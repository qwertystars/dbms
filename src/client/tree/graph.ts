// Normalized, read-only index over the family graph returned by
// GET /families/{familyId}/tree. The persisted model is the explicit
// parent/child edge list; everything here is derived presentation data.

export interface TreePerson {
  id: string;
  name: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  dateOfDeath?: string | null;
  occupation?: string | null;
  biography?: string | null;
  profileMediaId?: string | null;
  [key: string]: unknown;
}

export interface TreeEdge {
  id: string;
  parentPersonId: string;
  childPersonId: string;
  [key: string]: unknown;
}

export interface FamilyGraph {
  people: ReadonlyMap<string, TreePerson>;
  edges: readonly TreeEdge[];
  /** Parents and children of each person, in a stable display order. */
  parentsOf: ReadonlyMap<string, readonly string[]>;
  childrenOf: ReadonlyMap<string, readonly string[]>;
  /** Generation column per linked person; the eldest column is 0. */
  generation: ReadonlyMap<string, number>;
  /** People with at least one recorded parent or child. */
  linked: readonly TreePerson[];
  /** People with no recorded relationships, shown outside the graph. */
  unlinked: readonly TreePerson[];
}

const EMPTY: readonly string[] = [];

/** Eldest first; people without a birth date go after dated siblings. */
export function comparePeople(a: TreePerson, b: TreePerson): number {
  const ad = a.dateOfBirth ?? "";
  const bd = b.dateOfBirth ?? "";
  if (ad !== bd) {
    if (!ad) return 1;
    if (!bd) return -1;
    return ad < bd ? -1 : 1;
  }
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Builds the index. People and edges are deduplicated by id, duplicate
 * parent/child pairs collapse to one edge, and edges that reference people
 * outside the response are dropped, so a person is never duplicated.
 */
export function buildFamilyGraph(
  rawPeople: readonly TreePerson[],
  rawEdges: readonly TreeEdge[],
): FamilyGraph {
  const people = new Map<string, TreePerson>();
  for (const person of rawPeople) people.set(person.id, person);

  const edges: TreeEdge[] = [];
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const edge of rawEdges) {
    const { parentPersonId: parent, childPersonId: child } = edge;
    if (!people.has(parent) || !people.has(child) || parent === child) continue;
    const pair = `${parent}\u0000${child}`;
    if (seenIds.has(edge.id) || seenPairs.has(pair)) continue;
    seenIds.add(edge.id);
    seenPairs.add(pair);
    edges.push(edge);
    push(parents, child, parent);
    push(children, parent, child);
  }

  const byPerson = (a: string, b: string) => comparePeople(people.get(a)!, people.get(b)!);
  for (const list of parents.values()) list.sort(byPerson);
  for (const list of children.values()) list.sort(byPerson);

  const linked: TreePerson[] = [];
  const unlinked: TreePerson[] = [];
  for (const person of people.values()) {
    (parents.has(person.id) || children.has(person.id) ? linked : unlinked).push(person);
  }
  linked.sort(comparePeople);
  unlinked.sort(comparePeople);

  return {
    people,
    edges,
    parentsOf: parents,
    childrenOf: children,
    generation: computeGenerations(linked, parents, children),
    linked,
    unlinked,
  };
}

/** Returns a new graph that also contains `edge`, for example after a POST. */
export function withEdge(graph: FamilyGraph, edge: TreeEdge): FamilyGraph {
  return buildFamilyGraph([...graph.people.values()], [...graph.edges, edge]);
}

export function parentsOf(graph: FamilyGraph, id: string): readonly string[] {
  return graph.parentsOf.get(id) ?? EMPTY;
}

export function childrenOf(graph: FamilyGraph, id: string): readonly string[] {
  return graph.childrenOf.get(id) ?? EMPTY;
}

/**
 * Generations follow the previous tree page: one after a person's deepest
 * parent. A parent with no recorded parents of their own (for example someone
 * who married into the family) sits one column before their eldest child.
 * Columns are computed over the whole family so they never shift when a
 * branch is expanded or collapsed.
 */
function computeGenerations(
  linked: readonly TreePerson[],
  parents: Map<string, string[]>,
  children: Map<string, string[]>,
): Map<string, number> {
  const level = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const known = level.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // defensive: the server rejects cycles
    visiting.add(id);
    const ps = parents.get(id) ?? EMPTY;
    let value = 0;
    for (const p of ps) value = Math.max(value, depth(p) + 1);
    visiting.delete(id);
    level.set(id, value);
    return value;
  }
  for (const person of linked) depth(person.id);

  for (const person of linked) {
    const kids = children.get(person.id) ?? EMPTY;
    if (!parents.has(person.id) && kids.length > 0) {
      let min = Infinity;
      for (const kid of kids) min = Math.min(min, level.get(kid) ?? 0);
      level.set(person.id, min - 1);
    }
  }

  let min = Infinity;
  for (const value of level.values()) min = Math.min(min, value);
  if (min !== 0 && Number.isFinite(min)) {
    for (const [id, value] of level) level.set(id, value - min);
  }
  return level;
}

const descendantCache = new WeakMap<FamilyGraph, Map<string, number>>();

/** Number of distinct descendants; shared descendants are counted once. */
export function descendantCount(graph: FamilyGraph, id: string): number {
  let cache = descendantCache.get(graph);
  if (!cache) {
    cache = new Map();
    descendantCache.set(graph, cache);
  }
  const known = cache.get(id);
  if (known !== undefined) return known;
  const seen = new Set<string>();
  const stack = [...childrenOf(graph, id)];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const child of childrenOf(graph, next)) if (!seen.has(child)) stack.push(child);
  }
  cache.set(id, seen.size);
  return seen.size;
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
