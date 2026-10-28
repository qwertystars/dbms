import {
  CARD_HEIGHT,
  CARD_WIDTH,
  type Bounds,
  type Point,
  type Positions,
} from "~/client/tree/layout";

// Pure camera maths. A viewport maps a graph point p to the screen point
// p * zoom + (x, y), matching React Flow.

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Shifts the viewport so a node that moves from `from` to `to` stays put on screen. */
export function keepInPlace(viewport: Viewport, from: Point, to: Point): Viewport {
  return {
    zoom: viewport.zoom,
    x: viewport.x - (to.x - from.x) * viewport.zoom,
    y: viewport.y - (to.y - from.y) * viewport.zoom,
  };
}

/**
 * The smallest camera move that brings `box` into view: pans only as far as
 * needed and zooms out (never in) when the box does not fit, so the person
 * the viewer was looking at stays in context.
 */
export function revealBox(
  viewport: Viewport,
  size: Size,
  box: Bounds,
  { padding = 48, minZoom = 0.3 }: { padding?: number; minZoom?: number } = {},
): Viewport {
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  let zoom = viewport.zoom;
  const fit = Math.min(availableWidth / box.width, availableHeight / box.height);
  if (fit < zoom) zoom = Math.max(minZoom, fit);

  if (zoom !== viewport.zoom) {
    return {
      zoom,
      x: size.width / 2 - (box.x + box.width / 2) * zoom,
      y: size.height / 2 - (box.y + box.height / 2) * zoom,
    };
  }
  return {
    zoom,
    x: viewport.x + shift(box.x * zoom + viewport.x, box.width * zoom, size.width, padding),
    y: viewport.y + shift(box.y * zoom + viewport.y, box.height * zoom, size.height, padding),
  };
}

/** Centres `box` and zooms so it fits, within the zoom limits. */
export function fitBox(
  size: Size,
  box: Bounds,
  {
    padding = 48,
    minZoom = 0.3,
    maxZoom = 1,
  }: { padding?: number; minZoom?: number; maxZoom?: number } = {},
): Viewport {
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(availableWidth / box.width, availableHeight / box.height)),
  );
  return {
    zoom,
    x: size.width / 2 - (box.x + box.width / 2) * zoom,
    y: size.height / 2 - (box.y + box.height / 2) * zoom,
  };
}

function shift(start: number, length: number, span: number, padding: number): number {
  const end = start + length;
  if (length > span - padding * 2) return span / 2 - (start + length / 2);
  if (start < padding) return padding - start;
  if (end > span - padding) return span - padding - end;
  return 0;
}

export function nodeCenter(position: Point): Point {
  return { x: position.x + CARD_WIDTH / 2, y: position.y + CARD_HEIGHT / 2 };
}

/**
 * Keyboard navigation between cards. Right and left follow children and
 * parents when they are shown, otherwise the nearest card in the next or
 * previous column; up and down move within the column.
 */
export function neighbour(
  positions: Positions,
  currentId: string,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  related: { children: readonly string[]; parents: readonly string[] },
): string | null {
  const here = positions.get(currentId);
  if (!here) return null;
  const nearest = (ids: Iterable<string>) => {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const id of ids) {
      const p = positions.get(id);
      if (!p || id === currentId) continue;
      const score = Math.abs(p.y - here.y) + Math.abs(p.x - here.x) / 4;
      if (score < bestScore || (score === bestScore && best !== null && id < best)) {
        best = id;
        bestScore = score;
      }
    }
    return best;
  };
  const where = (test: (p: Point) => boolean) =>
    [...positions].filter(([, p]) => test(p)).map(([id]) => id);

  switch (key) {
    case "ArrowRight":
      return (
        nearest(related.children.filter((id) => positions.has(id))) ??
        nearest(where((p) => p.x > here.x))
      );
    case "ArrowLeft":
      return (
        nearest(related.parents.filter((id) => positions.has(id))) ??
        nearest(where((p) => p.x < here.x))
      );
    case "ArrowUp":
      return nearest(where((p) => p.x === here.x && p.y < here.y));
    case "ArrowDown":
      return nearest(where((p) => p.x === here.x && p.y > here.y));
  }
}
