import Link from "next/link";
import { redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";

export default async function Families() {
  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) return redirect("/sign-in");

  const families = await serverApi("GET", "/api/v1/families");

  return (
    <div>
      <h1>Families</h1>
      <ul>
        {families.body.families?.map((item: any) => (
          <li key={item.family.id}>
            <Link href={`/app/families/${item.family.id}`}>{item.family.name}</Link>{" "}
            <small>({item.membership.role})</small>
          </li>
        ))}
      </ul>
      {families.body.families?.length === 0 && <p>No families.</p>}
    </div>
  );
}
