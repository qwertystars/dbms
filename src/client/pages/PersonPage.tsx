import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage, uploadImage } from "~/client/api";
import { FamilyHeader } from "~/client/components/FamilyNav";
import {
  FIELD_GROUPS,
  KinshipTag,
  VISIBILITY_OPTIONS,
  CIRCLE_LABELS,
} from "~/client/components/kinship";
import {
  Alert,
  Avatar,
  Card,
  ErrorState,
  Field,
  Loading,
  capitalize,
  formatDate,
  lifeSpan,
  useBusy,
} from "~/client/components/ui";

// What the person linked to a profile may change themselves (mirrors the API's self-service fields).
const SELF_SERVICE_FIELDS = [
  "occupation",
  "education",
  "city",
  "skills",
  "email",
  "phone",
  "address",
  "biography",
];

function personPayload(formData: FormData, limited: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of SELF_SERVICE_FIELDS) {
    const value = formData.get(key);
    payload[key] = value ? value : null;
  }
  if (limited) return payload;
  payload.name = formData.get("name");
  payload.gender = formData.get("gender");
  for (const key of ["dateOfBirth", "dateOfDeath"]) {
    const value = formData.get(key);
    payload[key] = value ? value : null;
  }
  payload.heightCm = formData.get("heightCm") ? Number(formData.get("heightCm")) : null;
  payload.weightKg = formData.get("weightKg") ? Number(formData.get("weightKg")) : null;
  return payload;
}

export function PersonPage() {
  const { familyId, personId } = useParams<{ familyId: string; personId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, runSave] = useBusy();
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setEditing(false);
    (async () => {
      const [family, person, tree] = await Promise.all([
        api("GET", `/api/v1/families/${familyId}`),
        api("GET", `/api/v1/families/${familyId}/people/${personId}`),
        api("GET", `/api/v1/families/${familyId}/tree?rootPersonId=${personId}&depth=1`),
      ]);
      if (cancelled) return;
      if (family.status !== 200) {
        setError(errorMessage(family, "Family not found."));
        return;
      }
      if (person.status !== 200) {
        setError(errorMessage(person, "Person not found."));
        return;
      }
      const people = new Map<string, any>((tree.body.people || []).map((p: any) => [p.id, p]));
      const edges: any[] = tree.body.edges || [];
      const parents = edges
        .filter((e) => e.childPersonId === personId && people.has(e.parentPersonId))
        .map((e) => people.get(e.parentPersonId));
      const children = edges
        .filter((e) => e.parentPersonId === personId && people.has(e.childPersonId))
        .map((e) => people.get(e.childPersonId));
      setData({
        family: family.body.family,
        role: family.body.membership.role,
        person: person.body.person,
        parents,
        children,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, personId]);

  if (error && !data) return <ErrorState title="Could not open this profile" message={error} />;
  if (!data) return <Loading />;

  const p = data.person;
  const isMaintainer = data.role === "CREATOR" || data.role === "EDITOR";
  const isSelf = p.kinship?.circle === "SELF";
  const canEdit = isMaintainer || isSelf;
  // A linked Viewer edits only their own contact, work, biography and privacy.
  const limited = !isMaintainer;
  const canDelete = data.role === "CREATOR";
  const details: [string, ReactNode][] = [
    ["Gender", capitalize(p.gender)],
    ["Born", formatDate(p.dateOfBirth) || (p.birthYear ? String(p.birthYear) : "")],
    ["Died", formatDate(p.dateOfDeath)],
    ["Occupation", p.occupation],
    ["Studies", p.education],
    ["Lives in", p.city],
    ["Can help with", p.skills],
    ["Height", p.heightCm ? `${p.heightCm} cm` : null],
    ["Weight", p.weightKg ? `${p.weightKg} kg` : null],
    ["Email", p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null],
    ["Phone", p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : null],
    ["Address", p.address],
  ];
  const personLink = (id: string) => `/app/families/${familyId}/people/${id}`;

  async function savePerson(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = personPayload(new FormData(e.currentTarget), limited);
    const res = await runSave(() =>
      api("PATCH", `/api/v1/families/${familyId}/people/${personId}`, payload),
    );
    if (!res || res.status !== 200) {
      setError(res ? errorMessage(res, "Could not save this profile.") : null);
      return;
    }
    setData((prev: any) => ({ ...prev, person: res.body.person }));
    setEditing(false);
    setError(null);
    setNotice(`${res.body.person.name} was updated.`);
  }

  async function setVisibility(group: string, level: string) {
    const res = await api("PATCH", `/api/v1/families/${familyId}/people/${personId}`, {
      fieldVisibility: { [group]: level },
    });
    if (res.status !== 200) {
      setError(errorMessage(res, "Couldn't save the privacy setting."));
      return;
    }
    setData((prev: any) => ({ ...prev, person: res.body.person }));
    setError(null);
    setNotice("Privacy setting saved.");
  }

  async function setPhoto(profileMediaId: string | null) {
    const res = await api("PATCH", `/api/v1/families/${familyId}/people/${personId}`, {
      profileMediaId,
    });
    if (res.status !== 200) {
      setError(errorMessage(res, "Couldn't save the photo."));
      return;
    }
    setData((prev: any) => ({ ...prev, person: res.body.person }));
    setError(null);
    setNotice(profileMediaId ? "Photo saved." : "Photo removed.");
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const upload = await uploadImage(file, "PERSON_PROFILE", familyId);
      if (!upload.ok) {
        setError(upload.message);
        return;
      }
      await setPhoto(upload.mediaId);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePerson() {
    if (!window.confirm(`Delete ${p.name}? Their profile and family-tree links will be removed.`)) {
      return;
    }
    const res = await api("DELETE", `/api/v1/families/${familyId}/people/${personId}`);
    if (res.status !== 200) {
      setError(errorMessage(res, "Could not delete this person."));
      return;
    }
    navigate(`/app/families/${familyId}`);
  }

  function relatives(list: any[], empty: string) {
    if (list.length === 0) return <p className="subtle">{empty}</p>;
    return (
      <ul className="list">
        {list.map((r) => (
          <li key={r.id}>
            <Link to={personLink(r.id)} className="list-item" style={{ padding: "8px 0" }}>
              <Avatar
                name={r.name}
                size="sm"
                mediaId={r.profileMediaId}
                deceased={Boolean(r.dateOfDeath)}
              />
              <div className="list-item-main">
                <div className="list-item-title">{r.name}</div>
                {lifeSpan(r) && <div className="list-item-meta">{lifeSpan(r)}</div>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={data.family}
        role={data.role}
        title={p.name}
        description={null}
        actions={
          <>
            {canEdit && !editing && (
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
                {limited ? "Edit my details" : "Edit profile"}
              </button>
            )}
            {canDelete && !editing && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => void removePerson()}
              >
                Delete
              </button>
            )}
          </>
        }
      />

      <div className="grid-2">
        <div className="stack">
          {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
          {notice && (
            <Alert kind="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}

          {editing ? (
            <Card title="Edit profile">
              <form onSubmit={savePerson} className="form">
                <div className="form-grid">
                  {!limited && (
                    <>
                      <Field label="Full name">
                        <input
                          className="input"
                          name="name"
                          required
                          maxLength={255}
                          defaultValue={p.name}
                        />
                      </Field>
                      <Field label="Gender">
                        <select className="select" name="gender" required defaultValue={p.gender}>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </select>
                      </Field>
                      <Field label="Date of birth" optional>
                        <input
                          className="input"
                          name="dateOfBirth"
                          type="date"
                          defaultValue={p.dateOfBirth ?? ""}
                        />
                      </Field>
                      <Field label="Date of death" optional>
                        <input
                          className="input"
                          name="dateOfDeath"
                          type="date"
                          defaultValue={p.dateOfDeath ?? ""}
                        />
                      </Field>
                    </>
                  )}
                  <Field label="Occupation" optional>
                    <input
                      className="input"
                      name="occupation"
                      maxLength={255}
                      defaultValue={p.occupation ?? ""}
                    />
                  </Field>
                  <Field label="Studies / education" optional>
                    <input
                      className="input"
                      name="education"
                      maxLength={255}
                      defaultValue={p.education ?? ""}
                    />
                  </Field>
                  <Field label="Lives in (city)" optional>
                    <input
                      className="input"
                      name="city"
                      maxLength={255}
                      defaultValue={p.city ?? ""}
                    />
                  </Field>
                  <Field label="Can help with" optional>
                    <input
                      className="input"
                      name="skills"
                      maxLength={1000}
                      placeholder="e.g. tax forms, maths tutoring"
                      defaultValue={p.skills ?? ""}
                    />
                  </Field>
                  <Field label="Email" optional>
                    <input
                      className="input"
                      name="email"
                      type="email"
                      maxLength={255}
                      defaultValue={p.email ?? ""}
                    />
                  </Field>
                  <Field label="Phone" optional>
                    <input
                      className="input"
                      name="phone"
                      type="tel"
                      maxLength={50}
                      defaultValue={p.phone ?? ""}
                    />
                  </Field>
                  <Field label="Address" optional>
                    <input
                      className="input"
                      name="address"
                      maxLength={1000}
                      defaultValue={p.address ?? ""}
                    />
                  </Field>
                  {!limited && (
                    <>
                      <Field label="Height (cm)" optional>
                        <input
                          className="input"
                          name="heightCm"
                          type="number"
                          min="1"
                          step="any"
                          defaultValue={p.heightCm ?? ""}
                        />
                      </Field>
                      <Field label="Weight (kg)" optional>
                        <input
                          className="input"
                          name="weightKg"
                          type="number"
                          min="1"
                          step="any"
                          defaultValue={p.weightKg ?? ""}
                        />
                      </Field>
                    </>
                  )}
                  <Field label="Biography" optional className="span-2">
                    <textarea
                      className="textarea"
                      name="biography"
                      maxLength={5000}
                      defaultValue={p.biography ?? ""}
                    />
                  </Field>
                </div>
                <div className="row">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" className="btn" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </Card>
          ) : (
            <section className="card card-body stack">
              <div className="profile-head">
                <Avatar
                  name={p.name}
                  size="lg"
                  mediaId={p.profileMediaId}
                  deceased={Boolean(p.dateOfDeath)}
                />
                <div>
                  <p style={{ fontSize: "1.05rem", fontWeight: 550 }}>
                    {[lifeSpan(p), p.occupation].filter(Boolean).join(" · ") || "No details yet"}
                  </p>
                  {p.kinship && p.kinship.circle !== "UNKNOWN" && (
                    <p className="row" style={{ gap: 6, marginTop: 6 }}>
                      <KinshipTag kinship={p.kinship} />
                      {p.kinship.circle !== "SELF" && (
                        <span className="subtle">{CIRCLE_LABELS[p.kinship.circle as "CLOSE"]}</span>
                      )}
                    </p>
                  )}
                  {isMaintainer && (
                    <div className="photo-actions">
                      <label className={`btn btn-sm${photoBusy ? " is-disabled" : ""}`}>
                        {photoBusy ? "Uploading…" : p.profileMediaId ? "Change photo" : "Add photo"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="visually-hidden"
                          disabled={photoBusy}
                          onChange={(e) => {
                            void choosePhoto(e.currentTarget.files?.[0]);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {p.profileMediaId && !photoBusy && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void setPhoto(null)}
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <dl className="detail-list">
                {details
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
              {p.hiddenFields?.length > 0 && (
                <p className="subtle">
                  {p.name} shares some details, like contact information, only with close family.
                </p>
              )}
            </section>
          )}

          {!editing && p.biography && (
            <Card title="Biography">
              <p className="prose">{p.biography}</p>
            </Card>
          )}
        </div>

        <div className="stack">
          {p.fieldVisibility && (
            <Card
              title="Privacy"
              description={
                isSelf
                  ? "Choose who in the family sees each part of your profile."
                  : `Who in the family sees each part of ${p.name}'s profile.`
              }
            >
              <div className="stack-sm">
                {FIELD_GROUPS.map((group) => (
                  <Field key={group.key} label={group.label} hint={group.fields}>
                    <select
                      className="select"
                      value={p.fieldVisibility[group.key]}
                      onChange={(e) => void setVisibility(group.key, e.target.value)}
                    >
                      {VISIBILITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
                <p className="subtle">
                  Name, photo, years and place in the tree are always visible to family members.
                  Nothing is ever shown to people outside the family.
                </p>
              </div>
            </Card>
          )}
          <Card title="Parents">{relatives(data.parents, "No parents recorded.")}</Card>
          <Card title="Children">{relatives(data.children, "No children recorded.")}</Card>
        </div>
      </div>
    </>
  );
}
