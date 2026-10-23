import type { FamilyGraph, PersonSummary } from "~/client/family-data";

type Graph = Pick<FamilyGraph, "people" | "edges" | "partners">;

export function neighbors(graph: Graph, id: string): string[] {
  const ids = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.parentPersonId === id) ids.add(edge.childPersonId);
    if (edge.childPersonId === id) ids.add(edge.parentPersonId);
  }
  for (const edge of graph.partners) {
    if (edge.personAId === id) ids.add(edge.personBId);
    if (edge.personBId === id) ids.add(edge.personAId);
  }
  return [...ids];
}

export function mapLayout(graph: Graph, visible: ReadonlySet<string>) {
  const levels = new Map<string, number>();
  const parents = new Map<string, string[]>();
  for (const edge of graph.edges) {
    parents.set(edge.childPersonId, [
      ...(parents.get(edge.childPersonId) ?? []),
      edge.parentPersonId,
    ]);
  }
  function depth(id: string): number {
    const known = levels.get(id);
    if (known !== undefined) return known;
    const ancestors = parents.get(id) ?? [];
    const value = ancestors.length ? Math.max(...ancestors.map(depth)) + 1 : 0;
    levels.set(id, value);
    return value;
  }
  graph.people.forEach((p) => depth(p.id));
  for (const person of graph.people) {
    if (parents.has(person.id)) continue;
    const children = graph.edges.filter((e) => e.parentPersonId === person.id);
    if (children.length) {
      levels.set(person.id, Math.min(...children.map((e) => depth(e.childPersonId))) - 1);
    }
  }
  const groups = new Map<number, PersonSummary[]>();
  for (const person of graph.people) {
    if (!visible.has(person.id)) continue;
    const level = levels.get(person.id) ?? 0;
    groups.set(level, [...(groups.get(level) ?? []), person]);
  }
  const rows = [...groups.entries()].sort(([a], [b]) => a - b);
  const width = Math.max(256, ...rows.map(([, people]) => people.length * 256));
  const nodes = rows.flatMap(([, people], row) =>
    people
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((person, column) => ({
        person,
        x: (width - people.length * 256) / 2 + column * 256 + 24,
        y: row * 208 + 24,
      })),
  );
  const positions = new Map(nodes.map((node) => [node.person.id, node]));
  return { nodes, positions, width, height: Math.max(184, rows.length * 208) };
}
