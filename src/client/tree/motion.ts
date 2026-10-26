import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Positions } from "~/client/tree/layout";

/** Card movement when the layout changes. */
export const MOVE_MS = 440;
/** Delay between successive new cards in one reveal. */
export const STAGGER_MS = 45;
export const MAX_STAGGER_STEPS = 8;
/** Above this many cards, positions change without tweening. */
export const MAX_ANIMATED_NODES = 400;

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matches());
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(QUERY);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function matches(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(QUERY).matches);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Interpolates node positions with requestAnimationFrame for one transition
 * and then stops: there is no render loop while nothing moves. Connectors
 * follow automatically because React Flow derives them from node positions.
 */
export function usePositionTween() {
  const [positions, setPositions] = useState<Positions>(() => new Map());
  const shown = useRef<Positions>(positions);
  const frame = useRef(0);

  const apply = useCallback((next: Positions) => {
    shown.current = next;
    setPositions(next);
  }, []);

  const animate = useCallback(
    (from: Positions, to: Positions, duration: number, done?: () => void) => {
      cancelAnimationFrame(frame.current);
      if (duration <= 0 || typeof requestAnimationFrame !== "function") {
        apply(to);
        done?.();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        const next: Positions = new Map();
        for (const [id, end] of to) {
          const begin = from.get(id) ?? end;
          next.set(id, lerp(begin, end, e));
        }
        apply(next);
        if (t < 1) frame.current = requestAnimationFrame(step);
        else done?.();
      };
      frame.current = requestAnimationFrame(step);
    },
    [apply],
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return { positions, shown, animate };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
