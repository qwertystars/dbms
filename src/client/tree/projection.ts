import {
  childrenOf,
  descendantCount,
  parentsOf,
  type FamilyGraph,
  type TreeEdge,
  type TreePerson,
} from "~/client/tree/graph";
import { visibleIds, type ExpansionState } from "~/client/tree/expansion";

/** Expansion control on one edge of a card. */
export type ToggleState = "expand" | "collapse" | "none";

export interface VisibleNode {
  id: string;
  person: TreePerson;
  generation: number;
  /** Discovery order; used as the layout's model order. */
  order: number;
  childCount: number;
  parentCount: number;
  hiddenChildCount: number;
  hiddenParentCount: number;
  descendantCount: number;
  down: ToggleState;
  up: ToggleState;
}

export interface VisibleEdge {
  id: string;
  source: string;
  target: string;
}

export interface VisibleGraph {
  nodes: VisibleNode[];
  edges: VisibleEdge[];
}

/**
 * Projects the family graph through the viewer's expansion state. Every
 * recorded edge between two visible people is drawn, so branches that meet
 * (shared descendants, two parents) show as one person with several
 * incoming lines rather than as duplicates.
 */
export function projectVisibleGraph(graph: FamilyGraph, state: ExpansionState): VisibleGraph {
  const visible = visibleIds(graph, state);
  const nodes: VisibleNode[] = [];
  for (const [id, order] of visible) {
    const kids = childrenOf(graph, id);
    const parents = parentsOf(graph, id);
    const hiddenChildCount = kids.filter((k) => !visible.has(k)).length;
    const hiddenParentCount = parents.filter((p) => !visible.has(p)).length;
    nodes.push({
      id,
      person: graph.people.get(id)!,
      generation: graph.generation.get(id) ?? 0,
      order,
      childCount: kids.length,
      parentCount: parents.length,
      hiddenChildCount,
      hiddenParentCount,
      descendantCount: descendantCount(graph, id),
      down: toggle(hiddenChildCount, state.down.has(id)),
      up: toggle(hiddenParentCount, state.up.has(id)),
    });
  }
  nodes.sort((a, b) => a.generation - b.generation || a.order - b.order);

  const edges: VisibleEdge[] = graph.edges
    .filter((e: TreeEdge) => visible.has(e.parentPersonId) && visible.has(e.childPersonId))
    .map((e) => ({ id: e.id, source: e.parentPersonId, target: e.childPersonId }))
    .sort(
      (a, b) =>
        visible.get(a.source)! - visible.get(b.source)! ||
        visible.get(a.target)! - visible.get(b.target)!,
    );

  return { nodes, edges };
}

/**
 * "+" while relatives are hidden, "−" when this person's own expansion shows
 * them, and no control when there is nothing to reveal (no relatives, or
 * they are already shown through another branch).
 */
function toggle(hidden: number, expanded: boolean): ToggleState {
  if (hidden > 0) return "expand";
  return expanded ? "collapse" : "none";
}

/** Stable key for a projection, used to cache layouts. */
export function projectionKey(view: VisibleGraph): string {
  return (
    view.nodes.map((n) => `${n.id}@${n.generation}`).join(",") +
    "|" +
    view.edges.map((e) => e.id).join(",")
  );
}
