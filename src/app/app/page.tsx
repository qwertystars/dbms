import Link from "next/link";
import { redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";
import { createFamily } from "./actions";

export default async function Dashboard() {
  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) return redirect("/sign-in");

  const families = await serverApi("GET", "/api/v1/families");

  return (
    <div>
      <h1>Welcome, {me.body.displayName}</h1>
      <h2>Your families</h2>
      {families.body.families?.length === 0 && <p>No families yet.</p>}
      <ul>
        {families.body.families?.map((item: any) => (
          <li key={item.family.id}>
            <Link href={`/app/families/${item.family.id}`}>{item.family.name}</Link>{" "}
            <small>({item.membership.role})</small>
          </li>
        ))}
      </ul>
      <h2>Create a family</h2>
      <form action={createFamily}>
        <input name="name" placeholder="Family name" required />
        <button type="submit">Create</button>
      </form>
      <h2>Invitations</h2>
      <p>
        Use an invitation token URL: <code>/invitations/TOKEN</code>
      </p>
    </div>
  );
}
