// Browser APIs that jsdom lacks but React Flow needs. Import this first in
// client tests. Sizes are fixed so layout-dependent code is deterministic.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class ResizeObserverStub {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 1000, height: 700 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? Number(scale) : 1;
  }
}

const g = globalThis as any;
if (typeof g.PointerEvent === "undefined") {
  g.PointerEvent = class PointerEvent extends MouseEvent {
    pointerType: string;
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
      this.pointerId = init.pointerId ?? 1;
    }
  };
}
g.ResizeObserver = ResizeObserverStub;
g.DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
Object.defineProperties(g.HTMLElement.prototype, {
  offsetHeight: {
    configurable: true,
    get() {
      return parseFloat(this.style.height) || 700;
    },
  },
  offsetWidth: {
    configurable: true,
    get() {
      return parseFloat(this.style.width) || 1000;
    },
  },
});
g.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
g.HTMLElement.prototype.scrollIntoView = () => {};

/** Sets what `prefers-reduced-motion` reports. */
export function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

setReducedMotion(true);
afterEach(() => cleanup());
