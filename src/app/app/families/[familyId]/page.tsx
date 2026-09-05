import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";
import { CreatePersonForm } from "./CreatePersonForm";
import { createInvitation } from "./actions";

export default async function FamilyPage({ params }: { params: { familyId: string } }) {
  const { familyId } = params;
  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) return redirect("/sign-in");

  const family = await serverApi("GET", `/api/v1/families/${familyId}`);
  if (family.status !== 200) return notFound();

  const members = await serverApi("GET", `/api/v1/families/${familyId}/members`);
  const people = await serverApi("GET", `/api/v1/families/${familyId}/people`);
  const role = family.body.membership.role;

  const invitationAction = createInvitation.bind(null, familyId);

  return (
    <div>
      <h1>{family.body.family.name}</h1>
      <p>{family.body.family.description || "No description."}</p>
      <p>
        Your role: <strong>{role}</strong>
      </p>

      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href={`/app/families/${familyId}`}>Overview</Link>
        <Link href={`/app/families/${familyId}/tree`}>Tree</Link>
        <Link href={`/app/families/${familyId}/feed`}>Feed</Link>
      </nav>

      <h2>Members</h2>
      <ul>
        {members.body.members?.map((m: any) => (
          <li key={m.id}>
            {m.role} — {m.accountId}
          </li>
        ))}
      </ul>

      <h2>People</h2>
      <ul>
        {people.body.people?.map((p: any) => (
          <li key={p.id}>
            <Link href={`/app/families/${familyId}/people/${p.id}`}>{p.name}</Link>{" "}
            <small>
              {p.gender}
              {p.dateOfBirth ? ` · b. ${p.dateOfBirth}` : ""}
            </small>
          </li>
        ))}
      </ul>

      {role !== "VIEWER" && (
        <>
          <h2>Add person</h2>
          <CreatePersonForm familyId={familyId} />
        </>
      )}

      {role === "CREATOR" && (
        <>
          <h2>Invite</h2>
          <form action={invitationAction}>
            <select name="role" required>
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button type="submit">Create invitation</button>
          </form>

          <h2>Export</h2>
          <a href={`/api/v1/families/${familyId}/export?format=json`}>Download JSON</a>
          <a href={`/api/v1/families/${familyId}/export?format=csv`}>Download CSV</a>
        </>
      )}
    </div>
  );
}
