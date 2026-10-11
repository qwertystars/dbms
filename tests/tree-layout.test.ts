import { describe, expect, it } from "vitest";
import { layoutGenerations, type TreePerson } from "../src/client/components/tree-layout";

const person = (id: string, dateOfBirth?: string): TreePerson => ({ id, name: id, dateOfBirth });
const edge = (parentPersonId: string, childPersonId: string) => ({ parentPersonId, childPersonId });

describe("family tree presentation", () => {
  it("places a child below their deepest parent and aligns a parent joining the branch", () => {
    const { generations, parentsOf } = layoutGenerations(
      [person("ancestor"), person("parent"), person("otherParent"), person("child")],
      [edge("ancestor", "parent"), edge("parent", "child"), edge("otherParent", "child")],
    );
    expect(generations.map((g) => g.people.map((p) => p.id))).toEqual([
      ["ancestor"],
      ["parent", "otherParent"],
      ["child"],
    ]);
    expect(parentsOf.get("child")).toEqual(["parent", "otherParent"]);
  });

  it("keeps disconnected people separate and ignores relationships outside the projection", () => {
    const { generations, unconnected } = layoutGenerations(
      [person("a"), person("b"), person("isolated")],
      [edge("a", "b"), edge("missing", "isolated")],
    );
    expect(generations.map((g) => g.people.map((p) => p.id))).toEqual([["a"], ["b"]]);
    expect(unconnected.map((p) => p.id)).toEqual(["isolated"]);
  });

  it("renders a shared descendant once when branches converge", () => {
    const { generations } = layoutGenerations(
      [person("a"), person("b"), person("child")],
      [edge("a", "child"), edge("b", "child")],
    );
    expect(generations.flatMap((g) => g.people).filter((p) => p.id === "child")).toHaveLength(1);
  });

  it("orders siblings by recorded birth dates and does not mutate the input", () => {
    const people = [
      person("parent"),
      person("younger", "2000-01-01"),
      person("older", "1990-01-01"),
    ];
    const before = people.map((p) => p.id);
    const { generations } = layoutGenerations(people, [
      edge("parent", "younger"),
      edge("parent", "older"),
    ]);
    expect(generations[1].people.map((p) => p.id)).toEqual(["older", "younger"]);
    expect(people.map((p) => p.id)).toEqual(before);
  });
});
