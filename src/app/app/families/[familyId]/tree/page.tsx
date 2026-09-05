import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";
import { createTreeEdge } from "../actions";

export default async function TreePage({ params }: { params: { familyId: string } }) {
  const { familyId } = params;
  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) return redirect("/sign-in");

  const family = await serverApi("GET", `/api/v1/families/${familyId}`);
  if (family.status !== 200) return notFound();

  const tree = await serverApi("GET", `/api/v1/families/${familyId}/tree`);
  const people = await serverApi("GET", `/api/v1/families/${familyId}/people`);
  const role = family.body.membership.role;

  const edgeAction = createTreeEdge.bind(null, familyId);

  return (
    <div>
      <h1>{family.body.family.name} — Tree</h1>
      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href={`/app/families/${familyId}`}>Overview</Link>
        <Link href={`/app/families/${familyId}/tree`}>Tree</Link>
        <Link href={`/app/families/${familyId}/feed`}>Feed</Link>
      </nav>

      <h2>People</h2>
      <ul>
        {tree.body.people?.map((p: any) => (
          <li key={p.id}>
            <Link href={`/app/families/${familyId}/people/${p.id}`}>{p.name}</Link>
            <small>
              {" "}
              {p.gender}
              {p.deletedAt ? " (removed)" : ""}
            </small>
          </li>
        ))}
      </ul>

      <h2>Parent/child edges</h2>
      <ul>
        {tree.body.edges?.map((e: any) => (
          <li key={e.id}>
            {e.parentName || e.parentPersonId} → {e.childName || e.childPersonId}
          </li>
        ))}
      </ul>

      {role !== "VIEWER" && (
        <>
          <h2>Add parent/child edge</h2>
          <form action={edgeAction}>
            <select name="parentPersonId" required>
              <option value="">Parent</option>
              {people.body.people?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select name="childPersonId" required>
              <option value="">Child</option>
              {people.body.people?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit">Add edge</button>
          </form>
        </>
      )}
    </div>
  );
}
