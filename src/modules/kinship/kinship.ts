/**
 * Pure kinship computation over a family's parent/child edges.
 *
 * Blood relationships are found through the nearest common ancestor: `up` is
 * the number of generations from the source to that ancestor and `down` the
 * number from the ancestor to the target. The kinship degree is `up + down`
 * (the civil-law method: parent 1, sibling 2, aunt 3, first cousin 4).
 *
 * Two people who share a child are treated as partners (degree 1). Partners of
 * blood relatives and blood relatives of partners are relatives by marriage,
 * one degree further than the blood relative they connect through.
 */

export interface KinPerson {
  id: string;
  gender: string;
}

export interface KinEdge {
  parentPersonId: string;
  childPersonId: string;
}

export interface Kinship {
  /** Human-readable relationship of the target to the source, e.g. "aunt". */
  label: string;
  degree: number;
  /** True when the relationship runs through a partner. */
  byMarriage: boolean;
}

interface BloodPath {
  up: number;
  down: number;
}

export class KinshipGraph {
  private readonly parents = new Map<string, string[]>();
  private readonly children = new Map<string, string[]>();
  private readonly partners = new Map<string, Set<string>>();
  private readonly genders = new Map<string, string>();
  private readonly bloodCache = new Map<string, Map<string, BloodPath>>();

  constructor(people: KinPerson[], edges: KinEdge[]) {
    for (const person of people) this.genders.set(person.id, person.gender);
    for (const edge of edges) {
      if (!this.genders.has(edge.parentPersonId) || !this.genders.has(edge.childPersonId)) continue;
      push(this.parents, edge.childPersonId, edge.parentPersonId);
      push(this.children, edge.parentPersonId, edge.childPersonId);
    }
    for (const parentIds of this.parents.values()) {
      for (const a of parentIds) {
        for (const b of parentIds) {
          if (a === b) continue;
          if (!this.partners.has(a)) this.partners.set(a, new Set());
          this.partners.get(a)!.add(b);
        }
      }
    }
  }

  /** Relationship of every reachable person to `sourceId`, keyed by person id. */
  relativesOf(sourceId: string): Map<string, Kinship> {
    const result = new Map<string, Kinship>();
    if (!this.genders.has(sourceId)) return result;
    const blood = this.blood(sourceId);

    const offer = (id: string, kinship: Kinship) => {
      const current = result.get(id);
      if (!current || kinship.degree < current.degree) result.set(id, kinship);
    };

    for (const [id, path] of blood) {
      offer(id, {
        label: bloodLabel(path, this.genders.get(id) ?? ""),
        degree: path.up + path.down,
        byMarriage: false,
      });
    }

    const sourcePartners = this.partners.get(sourceId) ?? new Set<string>();
    for (const partnerId of sourcePartners) {
      if (blood.has(partnerId)) continue;
      offer(partnerId, { label: "partner", degree: 1, byMarriage: true });
      // The partner's blood relatives.
      for (const [id, path] of this.blood(partnerId)) {
        if (id === sourceId || blood.has(id) || path.up + path.down === 0) continue;
        offer(id, {
          label: partnersRelativeLabel(path, this.genders.get(id) ?? ""),
          degree: path.up + path.down + 1,
          byMarriage: true,
        });
      }
    }

    // Partners of the source's blood relatives.
    for (const [relativeId, path] of blood) {
      if (relativeId === sourceId) continue;
      for (const partnerId of this.partners.get(relativeId) ?? []) {
        if (partnerId === sourceId || blood.has(partnerId)) continue;
        offer(partnerId, {
          label: relativesPartnerLabel(
            path,
            this.genders.get(partnerId) ?? "",
            this.genders.get(relativeId) ?? "",
          ),
          degree: path.up + path.down + 1,
          byMarriage: true,
        });
      }
    }

    result.set(sourceId, { label: "you", degree: 0, byMarriage: false });
    return result;
  }

  /** Closest blood path from `sourceId` to every blood relative (including itself). */
  private blood(sourceId: string): Map<string, BloodPath> {
    const cached = this.bloodCache.get(sourceId);
    if (cached) return cached;

    // Ancestors with their generation distance (breadth-first gives the minimum).
    const ancestors = new Map<string, number>([[sourceId, 0]]);
    const queue = [sourceId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const parentId of this.parents.get(id) ?? []) {
        if (ancestors.has(parentId)) continue;
        ancestors.set(parentId, ancestors.get(id)! + 1);
        queue.push(parentId);
      }
    }

    const best = new Map<string, BloodPath>();
    for (const [ancestorId, up] of ancestors) {
      const down = new Map<string, number>([[ancestorId, 0]]);
      const walk = [ancestorId];
      while (walk.length > 0) {
        const id = walk.shift()!;
        for (const childId of this.children.get(id) ?? []) {
          if (down.has(childId)) continue;
          down.set(childId, down.get(id)! + 1);
          walk.push(childId);
        }
      }
      for (const [id, d] of down) {
        const current = best.get(id);
        const degree = up + d;
        // Prefer the shortest path; on ties prefer the nearer common ancestor.
        if (
          !current ||
          degree < current.up + current.down ||
          (degree === current.up + current.down && up < current.up)
        ) {
          best.set(id, { up, down: d });
        }
      }
    }
    this.bloodCache.set(sourceId, best);
    return best;
  }
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

type Gendered = [female: string, male: string, neutral: string];

function gendered(gender: string, [female, male, neutral]: Gendered): string {
  const g = gender.toLowerCase();
  if (g === "female") return female;
  if (g === "male") return male;
  return neutral;
}

function greats(count: number): string {
  if (count <= 0) return "";
  if (count <= 2) return "great-".repeat(count);
  return `${count}× great-`;
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`;
}

function removed(n: number): string {
  if (n === 0) return "";
  if (n === 1) return " once removed";
  if (n === 2) return " twice removed";
  return ` ${n} times removed`;
}

export function bloodLabel({ up, down }: BloodPath, gender: string): string {
  if (up === 0 && down === 0) return "you";
  if (down === 0) {
    if (up === 1) return gendered(gender, ["mother", "father", "parent"]);
    return greats(up - 2) + gendered(gender, ["grandmother", "grandfather", "grandparent"]);
  }
  if (up === 0) {
    if (down === 1) return gendered(gender, ["daughter", "son", "child"]);
    return greats(down - 2) + gendered(gender, ["granddaughter", "grandson", "grandchild"]);
  }
  if (up === 1 && down === 1) return gendered(gender, ["sister", "brother", "sibling"]);
  if (down === 1) {
    return greats(up - 2) + gendered(gender, ["aunt", "uncle", "parent's sibling"]);
  }
  if (up === 1) {
    if (down === 2) return gendered(gender, ["niece", "nephew", "sibling's child"]);
    return (
      greats(down - 3) + gendered(gender, ["grandniece", "grandnephew", "sibling's grandchild"])
    );
  }
  return `${ordinal(Math.min(up, down) - 1)} cousin${removed(Math.abs(up - down))}`;
}

/** A blood relative of the source's partner. */
function partnersRelativeLabel(path: BloodPath, gender: string): string {
  if (path.up === 1 && path.down === 0) {
    return gendered(gender, ["mother-in-law", "father-in-law", "parent-in-law"]);
  }
  if (path.up === 1 && path.down === 1) {
    return gendered(gender, ["sister-in-law", "brother-in-law", "sibling-in-law"]);
  }
  if (path.up === 0 && path.down === 1) {
    return gendered(gender, ["stepdaughter", "stepson", "stepchild"]);
  }
  return `partner's ${bloodLabel(path, gender)}`;
}

/** The partner of one of the source's blood relatives. */
function relativesPartnerLabel(path: BloodPath, gender: string, relativeGender: string): string {
  if (path.up === 1 && path.down === 0) {
    return gendered(gender, ["stepmother", "stepfather", "step-parent"]);
  }
  if (path.up === 0 && path.down === 1) {
    return gendered(gender, ["daughter-in-law", "son-in-law", "child-in-law"]);
  }
  if (path.up === 1 && path.down === 1) {
    return gendered(gender, ["sister-in-law", "brother-in-law", "sibling-in-law"]);
  }
  if (path.down === 1 && path.up >= 2) {
    return `${bloodLabel(path, gender)} by marriage`;
  }
  return `${bloodLabel(path, relativeGender)}'s partner`;
}
