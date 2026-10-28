import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage, uploadImage } from "~/client/api";
import { FamilyHeader } from "~/client/components/FamilyNav";
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

function personPayload(formData: FormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: formData.get("name"),
    gender: formData.get("gender"),
  };
  for (const key of [
    "dateOfBirth",
    "dateOfDeath",
    "address",
    "email",
    "phone",
    "occupation",
    "biography",
  ]) {
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
      const [family, person, tree, members, posts] = await Promise.all([
        api("GET", `/api/v1/families/${familyId}`),
        api("GET", `/api/v1/families/${familyId}/people/${personId}`),
        api("GET", `/api/v1/families/${familyId}/tree?rootPersonId=${personId}&depth=1`),
        api("GET", `/api/v1/families/${familyId}/members`),
        api("GET", `/api/v1/families/${familyId}/posts?personId=${personId}`),
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
      const partners = ((tree.body.partners || []) as any[])
        .filter((r) => r.personAId === personId || r.personBId === personId)
        .map((r) => (r.personAId === personId ? r.personBId : r.personAId))
        .filter((id) => id !== personId && people.has(id))
        .map((id) => people.get(id));
      const linkedMember = ((members.body?.members || []) as any[]).find(
        (m) => m.personId === personId,
      );
      setData({
        partners,
        linkedTo: linkedMember?.account?.displayName ?? null,
        memories: posts.status === 200 ? posts.body.posts || [] : [],
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
  const canEdit = data.role === "CREATOR" || data.role === "EDITOR";
  const canDelete = data.role === "CREATOR";
  const details: [string, ReactNode][] = [
    ["Gender", capitalize(p.gender)],
    ["Born", formatDate(p.dateOfBirth)],
    ["Died", formatDate(p.dateOfDeath)],
    ["Occupation", p.occupation],
    ["Height", p.heightCm ? `${p.heightCm} cm` : null],
    ["Weight", p.weightKg ? `${p.weightKg} kg` : null],
    ["Email", p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null],
    ["Phone", p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : null],
    ["Address", p.address],
  ];
  const personLink = (id: string) => `/app/families/${familyId}/people/${id}`;

  async function savePerson(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = personPayload(new FormData(e.currentTarget));
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
            <Link className="btn btn-sm" to={`/app/families/${familyId}/tree?focus=${personId}`}>
              Show in family tree
            </Link>
            {canEdit && !editing && (
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
                Edit profile
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
                  <Field label="Occupation" optional>
                    <input
                      className="input"
                      name="occupation"
                      maxLength={255}
                      defaultValue={p.occupation ?? ""}
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
                  {canEdit && (
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
            </section>
          )}

          {!editing && p.biography && (
            <Card title="Biography">
              <p className="prose">{p.biography}</p>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title="Account">
            <p className="subtle">
              {data.linkedTo ? (
                <>
                  <span className="badge badge-editor">Linked</span> Verified as {data.linkedTo}'s
                  profile.
                </>
              ) : (
                "Not linked to an account. Members can claim it from the family Overview."
              )}
            </p>
          </Card>
          <Card title="Parents">{relatives(data.parents, "No parents recorded.")}</Card>
          <Card title="Partners">{relatives(data.partners, "No partners recorded.")}</Card>
          <Card title="Children">{relatives(data.children, "No children recorded.")}</Card>
          <Card title="Memories" description={`Shared moments tagged with ${p.name}.`}>
            {data.memories.length === 0 ? (
              <p className="muted">No memories tag this person yet.</p>
            ) : (
              <ul className="memory-list">
                {data.memories.slice(0, 5).map((post: any) => (
                  <li key={post.id}>
                    <p className="memory-snippet">{post.body || "Shared a photo"}</p>
                    <span className="subtle">
                      {post.author?.displayName} · {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn btn-sm" to={`/app/families/${familyId}/memories`}>
              All memories
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
