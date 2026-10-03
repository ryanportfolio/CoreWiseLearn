/** Full-window canvas that tracks the window size and caps device pixel ratio. */

/** Perf probe 2026-10-02: ship at 1; raise only after a frame-time check on the real laptop. */
export const MAX_DPR = 1;

export interface GameCanvas {
  readonly element: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Logical (CSS pixel) size. Draw in these units; the context is pre-scaled by dpr. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** Re-read the window size and resize the backing store. Called automatically on resize. */
  resize(): void;
  /** Register a callback for size changes. Returns an unsubscribe function. */
  onResize(fn: (width: number, height: number) => void): () => void;
  destroy(): void;
}

export function createCanvas(element: HTMLCanvasElement, maxDpr: number = MAX_DPR): GameCanvas {
  const maybeCtx = element.getContext('2d', { alpha: false });
  if (!maybeCtx) throw new Error('Canvas 2D context unavailable');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let width = 0;
  let height = 0;
  let dpr = 1;
  const listeners = new Set<(w: number, h: number) => void>();

  function resize(): void {
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    width = Math.max(1, Math.floor(window.innerWidth));
    height = Math.max(1, Math.floor(window.innerHeight));
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const fn of listeners) fn(width, height);
  }

  const handleResize = (): void => resize();
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  resize();

  return {
    element,
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get dpr() {
      return dpr;
    },
    resize,
    onResize(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      listeners.clear();
    },
  };
}
