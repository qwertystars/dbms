import { describe, expect, it } from "vitest";
import { mapLayout, neighbors } from "~/client/map-layout";

const graph = {
  people: ["grandparent", "parent", "partner", "child", "other"].map((id) => ({ id, name: id })),
  edges: [
    { id: "e1", parentPersonId: "grandparent", childPersonId: "parent" },
    { id: "e2", parentPersonId: "parent", childPersonId: "child" },
    { id: "e3", parentPersonId: "partner", childPersonId: "child" },
  ],
  partners: [{ id: "u1", personAId: "parent", personBId: "partner" }],
};

describe("Family map presentation", () => {
  it("reveals only immediate relatives at each expansion", () => {
    // Given a focus with both parents and a grandparent in the family.
    const visible = new Set(["child", ...neighbors(graph, "child")]);
    // When its initial one-generation neighborhood is laid out.
    const layout = mapLayout(graph, visible);
    // Then grandparents and unconnected people remain hidden.
    expect(layout.nodes.map((n) => n.person.id).sort()).toEqual(["child", "parent", "partner"]);
    expect(neighbors(graph, "parent").filter((id) => !visible.has(id))).toEqual(["grandparent"]);
  });

  it("aligns a parent without recorded ancestors beside their co-parent", () => {
    // Given all family members are visible.
    const visible = new Set(graph.people.map((p) => p.id));
    // When the graph is laid out.
    const { positions } = mapLayout(graph, visible);
    // Then partners share a row above their child without overlapping.
    expect(positions.get("parent")?.y).toBe(positions.get("partner")?.y);
    expect(positions.get("parent")?.x).not.toBe(positions.get("partner")?.x);
    expect(positions.get("child")?.y).toBeGreaterThan(positions.get("parent")?.y ?? 0);
  });
});
