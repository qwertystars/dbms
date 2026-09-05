import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";

export default async function PersonPage({
  params,
}: {
  params: { familyId: string; personId: string };
}) {
  const { familyId, personId } = params;
  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) return redirect("/sign-in");

  const family = await serverApi("GET", `/api/v1/families/${familyId}`);
  if (family.status !== 200) return notFound();

  const person = await serverApi("GET", `/api/v1/families/${familyId}/people/${personId}`);
  if (person.status !== 200) return notFound();

  const p = person.body.person;

  return (
    <div>
      <h1>{p.name}</h1>
      <nav style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <Link href={`/app/families/${familyId}`}>Overview</Link>
        <Link href={`/app/families/${familyId}/tree`}>Tree</Link>
        <Link href={`/app/families/${familyId}/feed`}>Feed</Link>
      </nav>
      <p>Gender: {p.gender}</p>
      {p.dateOfBirth && <p>Date of birth: {p.dateOfBirth}</p>}
      {p.dateOfDeath && <p>Date of death: {p.dateOfDeath}</p>}
      {p.heightCm && <p>Height: {p.heightCm} cm</p>}
      {p.weightKg && <p>Weight: {p.weightKg} kg</p>}
      {p.address && <p>Address: {p.address}</p>}
      {p.email && <p>Email: {p.email}</p>}
      {p.phone && <p>Phone: {p.phone}</p>}
      {p.occupation && <p>Occupation: {p.occupation}</p>}
      {p.biography && <p>Biography: {p.biography}</p>}
    </div>
  );
}
