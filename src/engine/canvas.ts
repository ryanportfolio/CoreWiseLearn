/** Full-window logical canvas with an adaptive backing store. */
export const MAX_DPR = 1.5;
// A 1920x1080 window (2.07 M pixels) renders at full pixel ratio; MAX_DPR and SCALES bound the rest.
const MAX_PIXELS = 2_100_000;
const SCALES = [1, 0.85, 0.7] as const;
export interface GameCanvas {
  readonly element: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly resolutionScale: number;
  setResolutionScale(scale: number): void;
  /** Both delivered frame gaps and CPU work feed the controller. */
  observeFrame(intervalMs: number, workMs: number): void;
  resize(): void;
  onResize(fn: (width: number, height: number) => void): () => void;
  destroy(): void;
}
export function createCanvas(element: HTMLCanvasElement, maxDpr: number = MAX_DPR): GameCanvas {
  const maybeCtx = element.getContext('2d', { alpha: false });
  if (!maybeCtx) throw new Error('Canvas 2D context unavailable');
  const ctx = maybeCtx;
  let width = 0, height = 0, dpr = 1, level = 0;
  let windowMs = 0, slowMs = 0, goodMs = 0, cooldownMs = 0;
  const intervals = new Float32Array(512);
  const work = new Float32Array(512);
  const scratch = new Float32Array(512);
  let sampleCount = 0;
  const listeners = new Set<(w: number, h: number) => void>();
  function resize(): void {
    width = Math.max(1, Math.floor(window.innerWidth));
    height = Math.max(1, Math.floor(window.innerHeight));
    const baseDpr = Math.min(window.devicePixelRatio || 1, maxDpr, Math.sqrt(MAX_PIXELS / (width * height)));
    dpr = baseDpr * (SCALES[level] ?? 1);
    element.width = Math.max(1, Math.floor(width * dpr));
    element.height = Math.max(1, Math.floor(height * dpr));
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const fn of listeners) fn(width, height);
  }
  function setLevel(next: number): void {
    if (next === level) return;
    level = next;
    slowMs = goodMs = 0;
    cooldownMs = 4000;
    resize();
  }
  function p95(values: Float32Array): number {
    const count = Math.min(sampleCount, values.length);
    scratch.set(values.subarray(0, count));
    scratch.subarray(0, count).sort();
    return scratch[Math.max(0, Math.ceil(count * 0.95) - 1)] ?? 0;
  }
  const handleResize = (): void => resize();
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  resize();
  return {
    element, ctx,
    get width() { return width; }, get height() { return height; }, get dpr() { return dpr; },
    get resolutionScale() { return SCALES[level] ?? 1; },
    setResolutionScale(scale) {
      const closest = SCALES.reduce((best, item, i) => Math.abs(item - scale) < Math.abs((SCALES[best] ?? 1) - scale) ? i : best, 0);
      setLevel(closest);
    },
    observeFrame(intervalMs, workMs) {
      if (!Number.isFinite(intervalMs) || !Number.isFinite(workMs) || intervalMs <= 0) return;
      // Ignore sleep/debugger gaps; normal long frames remain in the delivered-frame sample.
      if (intervalMs > 1000) { windowMs = slowMs = goodMs = 0; sampleCount = 0; return; }
      windowMs += intervalMs;
      cooldownMs = Math.max(0, cooldownMs - intervalMs);
      const index = sampleCount % intervals.length;
      intervals[index] = intervalMs; work[index] = workMs; sampleCount++;
      if (windowMs < 1000 || sampleCount < 5) return;
      const delivered = p95(intervals), cost = p95(work);
      if (cost > 12 || delivered > 25) { slowMs += windowMs; goodMs = 0; }
      else if (cost < 7 && delivered < 19) { goodMs += windowMs; slowMs = 0; }
      else { slowMs = goodMs = 0; }
      if (cooldownMs === 0) {
        if (slowMs >= 2000 && level < SCALES.length - 1) setLevel(level + 1);
        else if (goodMs >= 8000 && level > 0) setLevel(level - 1);
      }
      windowMs = 0; sampleCount = 0;
    },
    resize,
    onResize(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    destroy() {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      listeners.clear();
    },
  };
}
