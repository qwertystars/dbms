import { api, errorMessage } from "~/client/api";

export interface PersonSummary {
  id: string;
  name: string;
  gender?: string;
  dateOfBirth?: string | null;
  dateOfDeath?: string | null;
  occupation?: string | null;
  biography?: string | null;
  profileMediaId?: string | null;
}

export interface FamilyGraph {
  family: { id: string; name: string; description?: string | null };
  membership: { id: string; role: string; personId: string | null };
  people: PersonSummary[];
  edges: { id: string; parentPersonId: string; childPersonId: string }[];
  partners: { id: string; personAId: string; personBId: string }[];
  members: {
    id: string;
    personId: string | null;
    role: string;
    account: { displayName: string };
  }[];
}

export async function loadFamilyGraph(
  familyId: string,
): Promise<{ ok: true; data: FamilyGraph } | { ok: false; message: string }> {
  const family = await api("GET", `/api/v1/families/${familyId}`);
  if (family.status !== 200)
    return { ok: false, message: errorMessage(family, "Family not found.") };
  const [tree, members] = await Promise.all([
    api("GET", `/api/v1/families/${familyId}/tree`),
    api("GET", `/api/v1/families/${familyId}/members`),
  ]);
  if (tree.status !== 200) {
    return { ok: false, message: errorMessage(tree, "Could not load the family.") };
  }
  return {
    ok: true,
    data: {
      family: family.body.family,
      membership: family.body.membership,
      people: tree.body.people || [],
      edges: tree.body.edges || [],
      partners: tree.body.partners || [],
      members: members.status === 200 ? members.body.members || [] : [],
    },
  };
}

export function relationIndex(graph: Pick<FamilyGraph, "edges" | "partners" | "members">) {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const partners = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) =>
    map.set(key, [...(map.get(key) ?? []), value]);
  for (const e of graph.edges) {
    push(parents, e.childPersonId, e.parentPersonId);
    push(children, e.parentPersonId, e.childPersonId);
  }
  for (const p of graph.partners) {
    push(partners, p.personAId, p.personBId);
    push(partners, p.personBId, p.personAId);
  }
  const linkedTo = new Map<string, string>();
  for (const m of graph.members) if (m.personId) linkedTo.set(m.personId, m.account.displayName);
  return { parents, children, partners, linkedTo };
}
