import type { KinshipGraph } from './types';

export interface Adjacency {
  // child id -> parent ids
  parents: Map<string, string[]>;
  // parent id -> child ids
  children: Map<string, string[]>;
  // spouse edges (both directions)
  spouses: Map<string, string[]>;
  personById: Map<string, { gender: 'm' | 'f' | 'o'; dob: string | null; birth_order: number | null }>;
}

function push(map: Map<string, string[]>, k: string, v: string): void {
  const arr = map.get(k);
  if (!arr) map.set(k, [v]);
  else if (!arr.includes(v)) arr.push(v);
}

export function buildAdjacency(g: KinshipGraph): Adjacency {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const personById = new Map<string, { gender: 'm' | 'f' | 'o'; dob: string | null; birth_order: number | null }>();

  for (const p of g.persons) {
    personById.set(p.id, { gender: p.gender, dob: p.dob ?? null, birth_order: p.birth_order ?? null });
  }

  const coupleById = new Map(g.couples.map(c => [c.couple_id, c]));

  for (const c of g.couples) {
    if (c.partner_a && c.partner_b) {
      push(spouses, c.partner_a, c.partner_b);
      push(spouses, c.partner_b, c.partner_a);
    }
  }
  for (const co of g.child_of) {
    const couple = coupleById.get(co.couple_id);
    if (!couple) continue;
    for (const pid of [couple.partner_a, couple.partner_b]) {
      if (pid) push(parents, co.child_person_id, pid);
    }
    if (couple.partner_a) push(children, couple.partner_a, co.child_person_id);
    if (couple.partner_b) push(children, couple.partner_b, co.child_person_id);
  }

  return { parents, children, spouses, personById };
}

export function genderOf(adj: Adjacency, id: string): 'm' | 'f' | 'o' | null {
  return adj.personById.get(id)?.gender ?? null;
}

/** true when x is demonstrably older than y (dob, fallback birth_order). */
export function olderThan(adj: Adjacency, x: string, y: string): boolean {
  const px = adj.personById.get(x);
  const py = adj.personById.get(y);
  if (!px || !py) return false;
  if (px.dob && py.dob && px.dob !== py.dob) return px.dob < py.dob;
  if (px.birth_order != null && py.birth_order != null && px.birth_order !== py.birth_order) {
    return px.birth_order < py.birth_order;
  }
  return false; // unknown ordering defaults to "younger" at call sites (documented choice)
}
