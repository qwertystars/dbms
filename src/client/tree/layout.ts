import type { ELK as ElkEngine, ElkNode } from "elkjs/lib/elk-api";
import { projectionKey, type VisibleGraph } from "~/client/tree/projection";

// Left-to-right layered layout. Each generation is a fixed column, so x never
// changes when branches open or close; ELK orders people inside a column
// (fewer crossings, siblings kept together) and places them vertically.

export const CARD_WIDTH = 248;
export const CARD_HEIGHT = 84;
/** Horizontal room between columns for connectors and the "+" buttons. */
export const COLUMN_GAP = 112;
export const ROW_GAP = 22;
export const COLUMN_WIDTH = CARD_WIDTH + COLUMN_GAP;

export interface Point {
  x: number;
  y: number;
}

export type Positions = Map<string, Point>;

export function columnX(generation: number): number {
  return generation * COLUMN_WIDTH;
}

const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // Layers come from the x positions we pass in, i.e. the generation column.
  "elk.layered.layering.strategy": "INTERACTIVE",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.spacing.nodeNode": String(ROW_GAP),
  "elk.layered.spacing.nodeNodeBetweenLayers": String(COLUMN_GAP),
  "elk.separateConnectedComponents": "false",
  "elk.randomSeed": "1",
};

let enginePromise: Promise<ElkEngine> | null = null;

/**
 * Loads ELK on first use so it stays out of the main bundle. In browsers it
 * runs in a Web Worker, so parsing it and laying out large families never
 * blocks pan, zoom or animation; elsewhere (tests) it runs in-process.
 */
function loadEngine(): Promise<ElkEngine> {
  if (!enginePromise) {
    enginePromise = createEngine().catch((error) => {
      enginePromise = null; // allow a later retry, e.g. after a flaky chunk load
      throw error;
    });
  }
  return enginePromise;
}

async function createEngine(): Promise<ElkEngine> {
  if (typeof Worker !== "undefined") {
    const [{ default: ElkApi }, { default: workerUrl }] = await Promise.all([
      import("elkjs/lib/elk-api.js"),
      import("elkjs/lib/elk-worker.min.js?url"),
    ]);
    return new ElkApi({ workerUrl }) as ElkEngine;
  }
  const { default: ElkBundled } = await import("elkjs/lib/elk.bundled.js");
  return new ElkBundled() as ElkEngine;
}

const cache = new Map<string, Positions>();
const CACHE_LIMIT = 24;

/** Cached by projection, so toggling a branch back and forth is instant. */
export async function layoutGraph(view: VisibleGraph): Promise<Positions> {
  const key = projectionKey(view);
  const cached = cache.get(key);
  if (cached) return cached;
  const positions = await computeLayout(view);
  cache.set(key, positions);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return positions;
}

/**
 * Deterministic: the same projection always yields the same positions.
 * Falls back to a plain column layout if ELK cannot be loaded or fails.
 */
export async function computeLayout(view: VisibleGraph): Promise<Positions> {
  try {
    return await elkLayout(view);
  } catch {
    return columnLayout(view);
  }
}

async function elkLayout(view: VisibleGraph): Promise<Positions> {
  const positions: Positions = new Map();
  if (view.nodes.length === 0) return positions;
  const elk = await loadEngine();
  const graph: ElkNode = {
    id: "family",
    layoutOptions: LAYOUT_OPTIONS,
    children: view.nodes.map((n) => ({
      id: n.id,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      x: columnX(n.generation),
      y: n.order * (CARD_HEIGHT + ROW_GAP),
    })),
    edges: view.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await elk.layout(graph);
  const generation = new Map(view.nodes.map((n) => [n.id, n.generation]));
  let minY = Infinity;
  for (const child of result.children ?? []) minY = Math.min(minY, child.y ?? 0);
  for (const child of result.children ?? []) {
    positions.set(child.id, {
      x: columnX(generation.get(child.id) ?? 0),
      y: Math.round((child.y ?? 0) - minY),
    });
  }
  return positions;
}

/** Simple stacked columns in model order. Used only when ELK is unavailable. */
export function columnLayout(view: VisibleGraph): Positions {
  const positions: Positions = new Map();
  const rows = new Map<number, number>();
  for (const node of view.nodes) {
    const row = rows.get(node.generation) ?? 0;
    rows.set(node.generation, row + 1);
    positions.set(node.id, { x: columnX(node.generation), y: row * (CARD_HEIGHT + ROW_GAP) });
  }
  return positions;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOf(positions: Positions, ids: Iterable<string>): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const p = positions.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + CARD_WIDTH);
    maxY = Math.max(maxY, p.y + CARD_HEIGHT);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
