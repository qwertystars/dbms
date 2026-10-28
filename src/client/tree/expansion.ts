import { childrenOf, parentsOf, type FamilyGraph } from "~/client/tree/graph";

// What the viewer has chosen to reveal. This is view state only and is kept
// apart from the server data: refetching the family never resets it, and it
// never mutates relationships.

export type Direction = "down" | "up";

export interface ExpansionState {
  /** People that are always shown: the family's founders or a focused person. */
  seeds: readonly string[];
  /** People whose children are revealed. */
  down: ReadonlySet<string>;
  /** People whose parents are revealed. */
  up: ReadonlySet<string>;
  /** The person the last action was about; the camera keeps them in view. */
  anchorId: string | null;
  /** What the last action was, so the view can pick a camera move. */
  lastAction: "init" | "expand" | "collapse" | "focus" | "reset" | "sync";
}

export type ExpansionAction =
  | { type: "expand"; id: string; direction: Direction }
  | { type: "collapse"; id: string; direction: Direction }
  | { type: "focus"; id: string }
  | { type: "reset" }
  | { type: "sync" }
  /** Show a newly recorded relationship from whichever side is on screen. */
  | { type: "reveal"; parentId: string; childId: string };

/**
 * Founders shown when a family opens: linked people with no recorded parents.
 * Someone with no recorded parents whose every child also has a parent with
 * their own ancestry (typically someone who married into the family) is left
 * out; they appear beside that child when the branch is expanded.
 */
export function defaultSeeds(graph: FamilyGraph): string[] {
  const roots = graph.linked.filter((p) => parentsOf(graph, p.id).length === 0);
  const seeds = roots.filter((root) => {
    const kids = childrenOf(graph, root.id);
    return !kids.every((kid) =>
      parentsOf(graph, kid).some((p) => p !== root.id && parentsOf(graph, p).length > 0),
    );
  });
  // Every connected group of people needs at least one starting point.
  const covered = new Set<string>();
  for (const id of seeds.map((p) => p.id)) markComponent(graph, id, covered);
  for (const root of roots) {
    if (covered.has(root.id)) continue;
    seeds.push(root);
    markComponent(graph, root.id, covered);
  }
  const order = new Map(graph.linked.map((p, index) => [p.id, index]));
  return seeds
    .map((p) => p.id)
    .sort(
      (a, b) =>
        (graph.generation.get(a) ?? 0) - (graph.generation.get(b) ?? 0) ||
        order.get(a)! - order.get(b)!,
    );
}

export function initialExpansion(graph: FamilyGraph, focusId?: string | null): ExpansionState {
  if (focusId && graph.generation.has(focusId)) {
    return { ...focusState(graph, focusId), lastAction: "init" };
  }
  return {
    seeds: defaultSeeds(graph),
    down: new Set(),
    up: new Set(),
    anchorId: null,
    lastAction: "init",
  };
}

export function expansionReducer(
  graph: FamilyGraph,
  state: ExpansionState,
  action: ExpansionAction,
): ExpansionState {
  switch (action.type) {
    case "expand": {
      const related =
        action.direction === "down" ? childrenOf(graph, action.id) : parentsOf(graph, action.id);
      if (related.length === 0) return state;
      const key = action.direction;
      const next = new Set(state[key]);
      next.add(action.id);
      return { ...state, [key]: next, anchorId: action.id, lastAction: "expand" };
    }
    case "collapse": {
      const key = action.direction;
      if (!state[key].has(action.id)) return state;
      const next = new Set(state[key]);
      next.delete(action.id);
      return prune(graph, {
        ...state,
        [key]: next,
        anchorId: action.id,
        lastAction: "collapse",
      });
    }
    case "focus":
      if (!graph.generation.has(action.id)) return state;
      return focusState(graph, action.id);
    case "reset":
      return { ...initialExpansion(graph), lastAction: "reset" };
    case "reveal": {
      const visible = visibleIds(graph, state);
      if (visible.has(action.parentId)) {
        return expansionReducer(graph, state, {
          type: "expand",
          id: action.parentId,
          direction: "down",
        });
      }
      if (visible.has(action.childId)) {
        return expansionReducer(graph, state, {
          type: "expand",
          id: action.childId,
          direction: "up",
        });
      }
      return focusState(graph, action.parentId);
    }
    case "sync":
      // The graph changed underneath (refetch or new relationship): drop ids
      // that no longer exist, keep everything else the viewer opened.
      return syncWithGraph(graph, state);
  }
}

function focusState(graph: FamilyGraph, id: string): ExpansionState {
  return {
    seeds: [id],
    down: new Set(childrenOf(graph, id).length > 0 ? [id] : []),
    up: new Set(parentsOf(graph, id).length > 0 ? [id] : []),
    anchorId: id,
    lastAction: "focus",
  };
}

function syncWithGraph(graph: FamilyGraph, state: ExpansionState): ExpansionState {
  const exists = (id: string) => graph.generation.has(id);
  let seeds = state.seeds.filter(exists);
  if (seeds.length === 0) seeds = defaultSeeds(graph);
  return prune(graph, {
    ...state,
    seeds,
    down: new Set([...state.down].filter(exists)),
    up: new Set([...state.up].filter(exists)),
    anchorId: state.anchorId && exists(state.anchorId) ? state.anchorId : null,
    lastAction: "sync",
  });
}

/**
 * Forgets expansion flags on people who are no longer visible, so pressing
 * "+" again later reveals one generation rather than a remembered subtree.
 * Visibility comes from reachability, so people still reachable through
 * another expanded path stay put.
 */
function prune(graph: FamilyGraph, state: ExpansionState): ExpansionState {
  const visible = visibleIds(graph, state);
  return {
    ...state,
    down: new Set([...state.down].filter((id) => visible.has(id))),
    up: new Set([...state.up].filter((id) => visible.has(id))),
  };
}

/**
 * Visible people in discovery order. Revealing a child also reveals the
 * child's other recorded parents, so a person with two parents is never
 * drawn as if they had one.
 */
export function visibleIds(graph: FamilyGraph, state: ExpansionState): Map<string, number> {
  const order = new Map<string, number>();
  const add = (id: string) => {
    if (order.has(id) || !graph.generation.has(id)) return false;
    order.set(id, order.size);
    return true;
  };
  const visit = (id: string) => {
    if (state.up.has(id)) {
      for (const parent of parentsOf(graph, id)) if (add(parent)) visit(parent);
    }
    if (state.down.has(id)) {
      for (const child of childrenOf(graph, id)) {
        for (const parent of parentsOf(graph, child)) if (add(parent)) visit(parent);
        if (add(child)) visit(child);
      }
    }
  };
  for (const seed of state.seeds) if (add(seed)) visit(seed);
  return order;
}

function markComponent(graph: FamilyGraph, start: string, into: Set<string>) {
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (into.has(id)) continue;
    into.add(id);
    stack.push(...parentsOf(graph, id), ...childrenOf(graph, id));
  }
}
