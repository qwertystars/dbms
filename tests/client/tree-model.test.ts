import "./dom";
import { describe, expect, it } from "vitest";
import { fitBox, keepInPlace, neighbour, revealBox } from "~/client/tree/camera";
import {
  defaultSeeds,
  expansionReducer,
  initialExpansion,
  type ExpansionAction,
  type ExpansionState,
} from "~/client/tree/expansion";
import { buildFamilyGraph, descendantCount, withEdge } from "~/client/tree/graph";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  COLUMN_WIDTH,
  columnLayout,
  computeLayout,
  type Positions,
} from "~/client/tree/layout";
import { projectVisibleGraph } from "~/client/tree/projection";
import { edges, largeFamily, people } from "./fixtures";

const graph = buildFamilyGraph(people, edges);

function run(state: ExpansionState, ...actions: ExpansionAction[]) {
  return actions.reduce((s, a) => expansionReducer(graph, s, a), state);
}
const expand = (id: string, direction: "down" | "up" = "down"): ExpansionAction => ({
  type: "expand",
  id,
  direction,
});
const collapse = (id: string, direction: "down" | "up" = "down"): ExpansionAction => ({
  type: "collapse",
  id,
  direction,
});
const ids = (state: ExpansionState) =>
  projectVisibleGraph(graph, state)
    .nodes.map((n) => n.id)
    .sort();

describe("family graph index", () => {
  it("separates linked and unlinked people and orders siblings eldest first", () => {
    expect(graph.unlinked.map((p) => p.id)).toEqual(["hal"]);
    expect(graph.childrenOf.get("ada")).toEqual(["cleo", "ben"]);
    expect(graph.parentsOf.get("eli")).toEqual(["ben", "dina"]);
  });

  it("assigns fixed generation columns, eldest at 0", () => {
    expect(Object.fromEntries(graph.generation)).toMatchObject({
      ada: 0,
      sam: 0,
      gus: 0,
      ben: 1,
      cleo: 1,
      dina: 1,
      eli: 2,
      fay: 2,
    });
  });

  it("deduplicates repeated people and edges instead of duplicating identities", () => {
    const messy = buildFamilyGraph(
      [...people, people[3]],
      [...edges, edges[0], { id: "dup-pair", parentPersonId: "ada", childPersonId: "ben" }],
    );
    expect(messy.people.size).toBe(people.length);
    expect(messy.edges).toHaveLength(edges.length);
    expect(messy.childrenOf.get("ada")).toEqual(["cleo", "ben"]);
  });

  it("drops edges that point at people outside the response", () => {
    const partial = buildFamilyGraph(people, [
      ...edges,
      { id: "x", parentPersonId: "ada", childPersonId: "someone-else" },
    ]);
    expect(partial.edges).toHaveLength(edges.length);
  });

  it("counts shared descendants once", () => {
    expect(descendantCount(graph, "ada")).toBe(4); // ben, cleo, eli, fay
    expect(descendantCount(graph, "gus")).toBe(2); // dina, eli
    expect(descendantCount(graph, "fay")).toBe(0);
  });

  it("merges a newly created edge", () => {
    const next = withEdge(graph, { id: "e9", parentPersonId: "fay", childPersonId: "hal" });
    expect(next.unlinked).toHaveLength(0);
    expect(next.generation.get("hal")).toBe(3);
  });
});

describe("progressive expansion", () => {
  const start = initialExpansion(graph);

  it("starts from the founders with every descendant hidden", () => {
    expect(defaultSeeds(graph)).toEqual(["gus", "ada", "sam"]);
    expect(ids(start)).toEqual(["ada", "gus", "sam"]);
    const view = projectVisibleGraph(graph, start);
    expect(view.edges).toHaveLength(0);
    expect(view.nodes.find((n) => n.id === "ada")).toMatchObject({
      down: "expand",
      hiddenChildCount: 2,
      descendantCount: 4,
    });
  });

  it("does not start from someone who married into a line with ancestry", () => {
    const g = buildFamilyGraph(
      [...people, { id: "zed", name: "Zed" }],
      [...edges, { id: "z1", parentPersonId: "zed", childPersonId: "fay" }],
    );
    expect(defaultSeeds(g)).not.toContain("zed");
  });

  it("reveals exactly the next generation on expand", () => {
    const s = run(start, expand("ada"));
    expect(ids(s)).toEqual(["ada", "ben", "cleo", "gus", "sam"]);
    expect(ids(s)).not.toContain("eli");
  });

  it("expanding a child reveals its own children and their other parents", () => {
    const s = run(start, expand("ada"), expand("ben"));
    expect(ids(s)).toEqual(["ada", "ben", "cleo", "dina", "eli", "gus", "sam"]);
    const view = projectVisibleGraph(graph, s);
    expect(view.edges.map((e) => e.id).sort()).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e8"]);
  });

  it("collapsing hides only people no longer reachable", () => {
    const opened = run(start, expand("ada"), expand("ben"), expand("gus"), expand("dina"));
    // Eli is reachable through Ben and through Dina; collapsing Ben keeps him.
    const s = run(opened, collapse("ben"));
    expect(ids(s)).toContain("eli");
    expect(ids(s)).toContain("dina");
    // Collapsing Ada hides Cleo. Eli stays through Dina, and Ben stays as
    // Eli's other parent, so Eli is never drawn with a missing parent.
    const s2 = run(s, collapse("ada"));
    expect(ids(s2)).toEqual(["ada", "ben", "dina", "eli", "gus", "sam"]);
    // Once Dina's branch closes too, nothing reaches Ben or Eli.
    expect(ids(run(s2, collapse("dina")))).toEqual(["ada", "dina", "gus", "sam"]);
  });

  it("forgets nested expansion once a branch is hidden", () => {
    const s = run(start, expand("ada"), expand("cleo"), collapse("ada"), expand("ada"));
    expect(ids(s)).not.toContain("fay");
  });

  it("never duplicates a shared descendant", () => {
    const s = run(start, expand("ada"), expand("ben"), expand("gus"), expand("dina"));
    const view = projectVisibleGraph(graph, s);
    expect(view.nodes.filter((n) => n.id === "eli")).toHaveLength(1);
    const incoming = view.edges.filter((e) => e.target === "eli").map((e) => e.source);
    expect(incoming.sort()).toEqual(["ben", "dina"]);
  });

  it("shows no expansion control for someone without children", () => {
    const s = run(start, expand("ada"), expand("cleo"));
    const fay = projectVisibleGraph(graph, s).nodes.find((n) => n.id === "fay")!;
    expect(fay.down).toBe("none");
    expect(fay.childCount).toBe(0);
  });

  it("shows no control when the children are already shown by the other parent", () => {
    const s = run(start, expand("ada"));
    const sam = projectVisibleGraph(graph, s).nodes.find((n) => n.id === "sam")!;
    expect(sam.down).toBe("none");
  });

  it("explores ancestors and can focus on anyone", () => {
    const s = run(start, { type: "focus", id: "eli" });
    expect(ids(s)).toEqual(["ben", "dina", "eli"]);
    const ben = projectVisibleGraph(graph, s).nodes.find((n) => n.id === "ben")!;
    expect(ben.up).toBe("expand");
    expect(ben.hiddenParentCount).toBe(2);
    const s2 = run(s, expand("ben", "up"));
    expect(ids(s2)).toEqual(["ada", "ben", "dina", "eli", "sam"]);
    expect(ids(run(s2, collapse("ben", "up")))).toEqual(["ben", "dina", "eli"]);
  });

  it("keeps view state across a refetch and drops people who were removed", () => {
    const s = run(start, expand("ada"), expand("ben"));
    const smaller = buildFamilyGraph(
      people.filter((p) => p.id !== "ben"),
      edges,
    );
    const synced = expansionReducer(smaller, s, { type: "sync" });
    expect(synced.down.has("ada")).toBe(true);
    expect(synced.down.has("ben")).toBe(false);
  });

  it("reveals a new relationship from whichever side is visible", () => {
    const next = withEdge(graph, { id: "e9", parentPersonId: "fay", childPersonId: "hal" });
    const s = run(start, expand("ada"), expand("cleo"));
    const revealed = expansionReducer(next, s, { type: "reveal", parentId: "fay", childId: "hal" });
    expect(projectVisibleGraph(next, revealed).nodes.map((n) => n.id)).toContain("hal");
  });
});

function overlaps(positions: Positions) {
  const boxes = [...positions.values()];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (
        a.x < b.x + CARD_WIDTH &&
        b.x < a.x + CARD_WIDTH &&
        a.y < b.y + CARD_HEIGHT &&
        b.y < a.y + CARD_HEIGHT
      ) {
        return true;
      }
    }
  }
  return false;
}

describe("layout", () => {
  const opened = run(
    initialExpansion(graph),
    expand("ada"),
    expand("ben"),
    expand("cleo"),
    expand("gus"),
  );
  const view = projectVisibleGraph(graph, opened);

  it("is deterministic", async () => {
    const a = await computeLayout(view);
    const b = await computeLayout(projectVisibleGraph(graph, opened));
    expect([...a]).toEqual([...b]);
  });

  it("puts each generation in its own column, left to right", async () => {
    const positions = await computeLayout(view);
    for (const node of view.nodes) {
      expect(positions.get(node.id)!.x).toBe(node.generation * COLUMN_WIDTH);
    }
    for (const e of view.edges) {
      expect(positions.get(e.source)!.x).toBeLessThan(positions.get(e.target)!.x);
    }
  });

  it("never overlaps cards", async () => {
    expect(overlaps(await computeLayout(view))).toBe(false);
    expect(overlaps(columnLayout(view))).toBe(false);
  });

  it("lays out a large expanded family quickly and without overlaps", async () => {
    const big = largeFamily(3, 4, 5); // 3 + 12 + 48 + 192 + 768 people
    const g = buildFamilyGraph(big.people, big.edges);
    let s = initialExpansion(g);
    // Open three generations below every founder: 3 + 12 + 48 + 192 cards.
    for (let depth = 0; depth < 3; depth++) {
      for (const n of projectVisibleGraph(g, s).nodes) {
        if (n.down === "expand") s = expansionReducer(g, s, expand(n.id));
      }
    }
    const v = projectVisibleGraph(g, s);
    expect(v.nodes).toHaveLength(255);
    const started = performance.now();
    const positions = await computeLayout(v);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(positions.size).toBe(255);
    expect(overlaps(positions)).toBe(false);
  });
});

describe("large families", () => {
  it("indexes 20,000 people but only projects what is revealed", () => {
    const big = largeFamily(5, 3, 8); // 5 * (3^8 - 1) / 2 = 16,400 people
    const started = performance.now();
    const g = buildFamilyGraph(big.people, big.edges);
    let s = initialExpansion(g);
    s = expansionReducer(g, s, expand("p0"));
    const v = projectVisibleGraph(g, s);
    const elapsed = performance.now() - started;
    expect(g.people.size).toBe(16400);
    expect(v.nodes).toHaveLength(5 + 3);
    expect(elapsed).toBeLessThan(1500);
  });
});

describe("camera", () => {
  const size = { width: 800, height: 600 };

  it("keeps an anchor on the same screen point when the layout moves it", () => {
    const v = keepInPlace({ x: 10, y: 20, zoom: 2 }, { x: 0, y: 0 }, { x: 0, y: 50 });
    expect(v).toEqual({ x: 10, y: -80, zoom: 2 });
  });

  it("does not move when the revealed box is already visible", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    expect(revealBox(viewport, size, { x: 100, y: 100, width: 200, height: 100 })).toEqual(
      viewport,
    );
  });

  it("pans only as far as needed", () => {
    const v = revealBox({ x: 0, y: 0, zoom: 1 }, size, { x: 700, y: 100, width: 200, height: 100 });
    expect(v).toEqual({ x: -148, y: 0, zoom: 1 });
  });

  it("zooms out, never in, when the box does not fit", () => {
    const v = revealBox({ x: 0, y: 0, zoom: 1 }, size, { x: 0, y: 0, width: 400, height: 1008 });
    expect(v.zoom).toBeCloseTo(0.5, 2);
    expect(fitBox(size, { x: 0, y: 0, width: 10, height: 10 }, { maxZoom: 1 }).zoom).toBe(1);
  });

  it("moves keyboard focus to children, parents and column neighbours", () => {
    const positions: Positions = new Map([
      ["p", { x: 0, y: 100 }],
      ["c1", { x: 360, y: 0 }],
      ["c2", { x: 360, y: 120 }],
    ]);
    const rel = { children: ["c1", "c2"], parents: [] };
    expect(neighbour(positions, "p", "ArrowRight", rel)).toBe("c2");
    expect(neighbour(positions, "c2", "ArrowUp", { children: [], parents: [] })).toBe("c1");
    expect(neighbour(positions, "c1", "ArrowLeft", { children: [], parents: ["p"] })).toBe("p");
    expect(neighbour(positions, "c1", "ArrowDown", { children: [], parents: [] })).toBe("c2");
  });
});
