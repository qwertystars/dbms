import { describe, it, expect } from "vitest";
import { KinshipGraph, bloodLabel } from "~/modules/kinship/kinship";
import { estimateRelationship } from "~/modules/dna/service";

// Grandpa + Grandma -> Dad, Aunt
// Dad + Mum -> Me, Brother
// Aunt + Uncle -> Cousin -> CousinKid
const people = [
  { id: "grandpa", gender: "male" },
  { id: "grandma", gender: "female" },
  { id: "dad", gender: "male" },
  { id: "mum", gender: "female" },
  { id: "aunt", gender: "female" },
  { id: "uncle", gender: "male" },
  { id: "me", gender: "female" },
  { id: "brother", gender: "male" },
  { id: "cousin", gender: "female" },
  { id: "cousinKid", gender: "male" },
  { id: "stranger", gender: "other" },
];
const edges = [
  ["grandpa", "dad"],
  ["grandma", "dad"],
  ["grandpa", "aunt"],
  ["grandma", "aunt"],
  ["dad", "me"],
  ["mum", "me"],
  ["dad", "brother"],
  ["mum", "brother"],
  ["aunt", "cousin"],
  ["uncle", "cousin"],
  ["cousin", "cousinKid"],
].map(([parentPersonId, childPersonId]) => ({ parentPersonId, childPersonId }));

describe("Kinship engine", () => {
  const graph = new KinshipGraph(people, edges);

  it("labels blood relatives with their degree", () => {
    const rel = graph.relativesOf("me");
    const view = (id: string) => [rel.get(id)?.label, rel.get(id)?.degree];
    expect(view("me")).toEqual(["you", 0]);
    expect(view("dad")).toEqual(["father", 1]);
    expect(view("mum")).toEqual(["mother", 1]);
    expect(view("brother")).toEqual(["brother", 2]);
    expect(view("grandma")).toEqual(["grandmother", 2]);
    expect(view("aunt")).toEqual(["aunt", 3]);
    expect(view("cousin")).toEqual(["first cousin", 4]);
    expect(view("cousinKid")).toEqual(["first cousin once removed", 5]);
    expect(rel.has("stranger")).toBe(false);
  });

  it("labels relatives by marriage one degree further out", () => {
    const fromMe = graph.relativesOf("me");
    expect(fromMe.get("uncle")).toEqual({
      label: "uncle by marriage",
      degree: 4,
      byMarriage: true,
    });

    const fromMum = graph.relativesOf("mum");
    expect(fromMum.get("dad")?.label).toBe("partner");
    expect(fromMum.get("grandpa")).toMatchObject({ label: "father-in-law", degree: 2 });
    expect(fromMum.get("aunt")).toMatchObject({ label: "sister-in-law", degree: 3 });

    const fromGrandma = graph.relativesOf("grandma");
    expect(fromGrandma.get("mum")).toMatchObject({ label: "daughter-in-law", degree: 2 });
    expect(fromGrandma.get("uncle")).toMatchObject({ label: "son-in-law", degree: 2 });
  });

  it("is symmetric in degree", () => {
    for (const a of people) {
      const fromA = graph.relativesOf(a.id);
      for (const b of people) {
        const ab = fromA.get(b.id)?.degree;
        const ba = graph.relativesOf(b.id).get(a.id)?.degree;
        expect([a.id, b.id, ab]).toEqual([a.id, b.id, ba]);
      }
    }
  });

  it("takes the shortest path when relatives descend twice from one couple", () => {
    // Two cousins have a child together; the child is also their cousins' grandchild.
    const g = new KinshipGraph(
      [...people, { id: "baby", gender: "female" }, { id: "cousin2", gender: "male" }],
      [
        ...edges,
        { parentPersonId: "brother", childPersonId: "cousin2" },
        { parentPersonId: "cousin2", childPersonId: "baby" },
        { parentPersonId: "cousin", childPersonId: "baby" },
      ],
    );
    expect(g.relativesOf("brother").get("baby")).toMatchObject({
      label: "granddaughter",
      degree: 2,
    });
  });

  it("names distant generations", () => {
    expect(bloodLabel({ up: 4, down: 0 }, "male")).toBe("great-great-grandfather");
    expect(bloodLabel({ up: 6, down: 0 }, "female")).toBe("4× great-grandmother");
    expect(bloodLabel({ up: 3, down: 1 }, "female")).toBe("great-aunt");
    expect(bloodLabel({ up: 1, down: 3 }, "male")).toBe("grandnephew");
    expect(bloodLabel({ up: 3, down: 3 }, "other")).toBe("second cousin");
    expect(bloodLabel({ up: 2, down: 5 }, "other")).toBe("first cousin 3 times removed");
    expect(bloodLabel({ up: 1, down: 1 }, "other")).toBe("sibling");
  });
});

describe("DNA relationship estimate", () => {
  it("maps shared centimorgans to likely relationships", () => {
    expect(estimateRelationship(3500).likely).toContain("Parent or child");
    expect(estimateRelationship(2600).likely[0]).toBe("Full sibling");
    expect(estimateRelationship(850).likely).toContain("First cousin");
    expect(estimateRelationship(120).likely).toContain("Second cousin");
    expect(estimateRelationship(3).confidence).toBe("low");
  });
});
