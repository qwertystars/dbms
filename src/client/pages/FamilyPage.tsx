import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { ClaimPanel } from "~/client/components/ClaimPanel";
import { FamilyHeader } from "~/client/components/FamilyNav";
import {
  Alert,
  Avatar,
  Card,
  CopyField,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  RoleBadge,
  capitalize,
  lifeSpan,
  useBusy,
} from "~/client/components/ui";

export function FamilyPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const { me } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [personBusy, runPerson] = useBusy();
  const [inviteBusy, runInvite] = useBusy();
  const [memberBusy, runMember] = useBusy();

  async function load() {
    const family = await api("GET", `/api/v1/families/${familyId}`);
    if (family.status !== 200) {
      setError(errorMessage(family, "Family not found."));
      return;
    }
    const [members, people] = await Promise.all([
      api("GET", `/api/v1/families/${familyId}/members`),
      api("GET", `/api/v1/families/${familyId}/tree`),
    ]);
    setData({
      family: family.body.family,
      membership: family.body.membership,
      members: members.body.members || [],
      people: people.body.people || [],
    });
  }

  useEffect(() => {
    setData(null);
    setError(null);
    setNotice(null);
    setInviteLink(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  async function createInvitation(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const role = new FormData(e.currentTarget).get("role") as string;
    const res = await runInvite(() =>
      api("POST", `/api/v1/families/${familyId}/invitations`, { role }),
    );
    if (res?.status === 201 && res.body.token) {
      setInviteLink(`${window.location.origin}/invitations/${res.body.token}`);
    } else {
      setError(res ? errorMessage(res, "Could not create invitation.") : null);
    }
  }

  async function updateRole(membershipId: string, role: string) {
    const res = await runMember(() =>
      api("PATCH", `/api/v1/families/${familyId}/members/${membershipId}`, { role }),
    );
    if (!res || res.status !== 200) {
      setError(res ? errorMessage(res, "Could not update the role.") : null);
      return;
    }
    setError(null);
    setNotice("Member role updated.");
    await load();
  }

  async function removeMember(member: any) {
    const name = member.account?.displayName || "this member";
    if (!window.confirm(`Remove ${name} from the family?`)) return;
    const res = await runMember(() =>
      api("DELETE", `/api/v1/families/${familyId}/members/${member.id}`),
    );
    if (!res || res.status !== 200) {
      setError(res ? errorMessage(res, "Could not remove the member.") : null);
      return;
    }
    setError(null);
    setNotice(`${name} was removed.`);
    await load();
  }

  async function createPerson(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    const payload: Record<string, any> = {
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
      if (value) payload[key] = value;
    }
    if (formData.get("heightCm")) payload.heightCm = Number(formData.get("heightCm"));
    if (formData.get("weightKg")) payload.weightKg = Number(formData.get("weightKg"));

    const res = await runPerson(() => api("POST", `/api/v1/families/${familyId}/people`, payload));
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not add person.") : null);
      return;
    }
    formEl.reset();
    setError(null);
    await load();
    setNotice(`${res.body.person.name} was added to the family.`);
  }

  if (error && !data) return <ErrorState title="Could not open this family" message={error} />;
  if (!data) return <Loading />;

  const role = data.membership.role;

  return (
    <>
      <FamilyHeader familyId={familyId!} family={data.family} role={role} />

      <div className="stack">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {notice && (
          <Alert kind="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        <ClaimPanel
          key={familyId}
          familyId={familyId!}
          role={role}
          myPersonId={data.membership.personId ?? null}
          people={data.people}
          linkedPersonIds={
            new Set(data.members.map((m: any) => m.personId).filter(Boolean) as string[])
          }
          onChanged={() => void load()}
          onError={setError}
        />

        <div className="grid-2">
          <div className="stack">
            <Card
              title="People"
              description={`${data.people.length} ${data.people.length === 1 ? "profile" : "profiles"} in this family`}
              actions={
                <Link to={`/app/families/${familyId}/tree`} className="btn btn-sm">
                  View tree
                </Link>
              }
              flush
            >
              {data.people.length === 0 ? (
                <EmptyState title="No people yet">
                  {role === "VIEWER"
                    ? "Editors of this family can add profiles."
                    : "Add the first person using the form below."}
                </EmptyState>
              ) : (
                <ul className="list">
                  {data.people.map((p: any) => (
                    <li key={p.id}>
                      <Link to={`/app/families/${familyId}/people/${p.id}`} className="list-item">
                        <Avatar
                          name={p.name}
                          mediaId={p.profileMediaId}
                          deceased={Boolean(p.dateOfDeath)}
                        />
                        <div className="list-item-main">
                          <div className="list-item-title">{p.name}</div>
                          <div className="list-item-meta">
                            {[capitalize(p.gender), lifeSpan(p), p.occupation]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        {p.dateOfDeath && <span className="badge">Deceased</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {role !== "VIEWER" && (
              <Card title="Add a person" description="Create a profile for a relative.">
                <form onSubmit={createPerson} className="form">
                  <div className="form-grid">
                    <Field label="Full name">
                      <input className="input" name="name" required maxLength={255} />
                    </Field>
                    <Field label="Gender">
                      <select className="select" name="gender" required defaultValue="">
                        <option value="" disabled>
                          Select…
                        </option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                      </select>
                    </Field>
                    <Field label="Date of birth" optional>
                      <input className="input" name="dateOfBirth" type="date" />
                    </Field>
                    <Field label="Date of death" optional>
                      <input className="input" name="dateOfDeath" type="date" />
                    </Field>
                  </div>
                  <details className="disclosure">
                    <summary>More details</summary>
                    <div className="form-grid">
                      <Field label="Occupation" optional>
                        <input className="input" name="occupation" maxLength={255} />
                      </Field>
                      <Field label="Email" optional>
                        <input className="input" name="email" type="email" maxLength={255} />
                      </Field>
                      <Field label="Phone" optional>
                        <input className="input" name="phone" type="tel" maxLength={50} />
                      </Field>
                      <Field label="Address" optional>
                        <input className="input" name="address" maxLength={1000} />
                      </Field>
                      <Field label="Height (cm)" optional>
                        <input className="input" name="heightCm" type="number" min="1" step="any" />
                      </Field>
                      <Field label="Weight (kg)" optional>
                        <input className="input" name="weightKg" type="number" min="1" step="any" />
                      </Field>
                      <Field label="Biography" optional className="span-2">
                        <textarea className="textarea" name="biography" maxLength={5000} />
                      </Field>
                    </div>
                  </details>
                  <div>
                    <button type="submit" className="btn btn-primary" disabled={personBusy}>
                      {personBusy ? "Adding…" : "Add person"}
                    </button>
                  </div>
                </form>
              </Card>
            )}
          </div>

          <div className="stack">
            <Card title="Members" description="Accounts with access to this family" flush>
              <ul className="list">
                {data.members.map((m: any) => (
                  <li key={m.id} className="list-item">
                    <Avatar name={m.account?.displayName} size="sm" />
                    <div className="list-item-main">
                      <div className="list-item-title">
                        {m.account?.displayName || "Unknown"}
                        {m.accountId === me?.id && <span className="subtle"> (you)</span>}
                      </div>
                    </div>
                    {role === "CREATOR" && m.role !== "CREATOR" ? (
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <select
                          className="select select-sm"
                          value={m.role}
                          disabled={memberBusy}
                          aria-label={`Role for ${m.account?.displayName || "member"}`}
                          onChange={(e) => void updateRole(m.id, e.target.value)}
                        >
                          <option value="EDITOR">Editor</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                        <button
                          type="button"
                          className="post-action post-action-danger"
                          disabled={memberBusy}
                          onClick={() => void removeMember(m)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            {role === "CREATOR" && (
              <Card
                title="Invite someone"
                description="Create a single-use link. It expires after 7 days."
              >
                <div className="stack-sm">
                  <form onSubmit={createInvitation} className="inline-form">
                    <select className="select" name="role" required aria-label="Role">
                      <option value="EDITOR">As editor</option>
                      <option value="VIEWER">As viewer</option>
                    </select>
                    <button type="submit" className="btn btn-primary" disabled={inviteBusy}>
                      {inviteBusy ? "Creating…" : "Create link"}
                    </button>
                  </form>
                  {inviteLink && (
                    <>
                      <CopyField value={inviteLink} label="Invitation link" />
                      <p className="subtle">Share this link with the person you want to invite.</p>
                    </>
                  )}
                </div>
              </Card>
            )}

            <Card
              title="Export"
              description="Download the people and relationships in this family."
            >
              <div className="row">
                <a
                  className="btn"
                  href={`/api/v1/families/${familyId}/export?format=json`}
                  download
                >
                  JSON
                </a>
                <a className="btn" href={`/api/v1/families/${familyId}/export?format=csv`} download>
                  CSV
                </a>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
