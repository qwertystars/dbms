import type { TreeEdge, TreePerson } from "~/client/tree/graph";

export const FAMILY_ID = "fam-1";

function person(id: string, name: string, extra: Partial<TreePerson> = {}): TreePerson {
  return {
    id,
    name,
    gender: "other",
    dateOfBirth: null,
    dateOfDeath: null,
    occupation: null,
    biography: null,
    profileMediaId: null,
    ...extra,
  };
}

/**
 * Ada and Sam are founders with children Ben and Cleo. Gus is a separate
 * founder whose daughter Dina has a child, Eli, with Ben: Eli is a shared
 * descendant of both lines. Fay is Cleo's child and has no children.
 * Hal has no relationships at all.
 */
export const people: TreePerson[] = [
  person("ada", "Ada Archer", { dateOfBirth: "1900-01-01", dateOfDeath: "1980-05-02" }),
  person("sam", "Sam Archer", { dateOfBirth: "1902-03-03" }),
  person("gus", "Gus Moreau", { dateOfBirth: "1898-07-07" }),
  person("ben", "Ben Archer", {
    dateOfBirth: "1925-01-01",
    occupation: "Carpenter",
    biography: "Built the family house by the river.",
  }),
  person("cleo", "Cleo Archer", { dateOfBirth: "1923-01-01" }),
  person("dina", "Dina Moreau", { dateOfBirth: "1927-01-01" }),
  person("eli", "Eli Archer", { dateOfBirth: "1950-01-01" }),
  person("fay", "Fay Archer", { dateOfBirth: "1952-01-01" }),
  person("hal", "Hal Nobody"),
];

const edge = (id: string, parentPersonId: string, childPersonId: string): TreeEdge => ({
  id,
  parentPersonId,
  childPersonId,
});

export const edges: TreeEdge[] = [
  edge("e1", "ada", "ben"),
  edge("e2", "sam", "ben"),
  edge("e3", "ada", "cleo"),
  edge("e4", "sam", "cleo"),
  edge("e5", "ben", "eli"),
  edge("e6", "dina", "eli"),
  edge("e7", "cleo", "fay"),
  edge("e8", "gus", "dina"),
];

/** A synthetic family: `founders` lines, each person with `branching` children. */
export function largeFamily(founders: number, branching: number, generations: number) {
  const ps: TreePerson[] = [];
  const es: TreeEdge[] = [];
  let next = 0;
  let frontier: string[] = [];
  for (let f = 0; f < founders; f++) {
    const id = `p${next++}`;
    ps.push(person(id, `Person ${id}`));
    frontier.push(id);
  }
  for (let g = 1; g < generations; g++) {
    const nextFrontier: string[] = [];
    for (const parent of frontier) {
      for (let b = 0; b < branching; b++) {
        const id = `p${next++}`;
        ps.push(person(id, `Person ${id}`));
        es.push(edge(`e-${parent}-${id}`, parent, id));
        nextFrontier.push(id);
      }
    }
    frontier = nextFrontier;
  }
  return { people: ps, edges: es };
}
