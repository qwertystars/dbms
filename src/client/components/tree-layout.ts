export interface TreePerson {
  id: string;
  name: string;
  dateOfBirth?: string | null;
  dateOfDeath?: string | null;
  profileMediaId?: string | null;
  occupation?: string | null;
  biography?: string | null;
}
export interface TreeEdge {
  parentPersonId: string;
  childPersonId: string;
}

interface Generation {
  level: number;
  people: TreePerson[];
}

/**
 * Groups people into generations for display. This is presentation logic only;
 * the persisted model is the explicit parent/child edge list.
 *
 * A person's generation is one below their deepest parent. Parents with no
 * recorded parents of their own (for example someone who married into the
 * family) are aligned one generation above their children.
 */
export function layoutGenerations(people: TreePerson[], edges: TreeEdge[]) {
  const ids = new Set(people.map((p) => p.id));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.parentPersonId) || !ids.has(e.childPersonId)) continue;
    parentsOf.set(e.childPersonId, [...(parentsOf.get(e.childPersonId) ?? []), e.parentPersonId]);
    childrenOf.set(e.parentPersonId, [
      ...(childrenOf.get(e.parentPersonId) ?? []),
      e.childPersonId,
    ]);
  }

  const level = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const known = level.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // defensive: the server rejects cycles
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depth));
    visiting.delete(id);
    level.set(id, value);
    return value;
  }
  people.forEach((p) => depth(p.id));

  for (const p of people) {
    const children = childrenOf.get(p.id) ?? [];
    if ((parentsOf.get(p.id) ?? []).length === 0 && children.length > 0) {
      level.set(p.id, Math.min(...children.map((c) => level.get(c) ?? 0)) - 1);
    }
  }

  const connected = people.filter((p) => parentsOf.has(p.id) || childrenOf.has(p.id));
  const unconnected = people.filter((p) => !parentsOf.has(p.id) && !childrenOf.has(p.id));

  const byLevel = new Map<number, TreePerson[]>();
  for (const p of connected) {
    const l = level.get(p.id) ?? 0;
    byLevel.set(l, [...(byLevel.get(l) ?? []), p]);
  }
  const generations: Generation[] = [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([l, list]) => ({
      level: l,
      people: list.sort((a, b) => (a.dateOfBirth ?? "").localeCompare(b.dateOfBirth ?? "")),
    }));

  return { generations, unconnected, parentsOf };
}
