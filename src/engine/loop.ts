/**
 * Fixed-timestep game loop.
 *
 * update() runs at a fixed rate (60 Hz by default) however fast the display
 * refreshes; render() runs once per animation frame and receives an
 * interpolation alpha in [0, 1) for smoothing between the last two updates.
 * The loop pauses while the document is hidden so time does not pile up in
 * a background tab, and it clamps long gaps (debugger, laptop sleep) so the
 * simulation never spirals trying to catch up.
 */

export interface LoopCallbacks {
  /** Advance the simulation by dt seconds (always the fixed step). */
  update(dt: number): void;
  /** Draw the current state. alpha is the fraction of a step elapsed since the last update. */
  render(alpha: number): void;
  /** Unscaled visible wall time, independent of simulation catch-up. */
  frame?(seconds: number): void;
  afterFrame?(intervalMs: number, workMs: number): void;
}

export interface LoopOptions {
  /** Simulation updates per second. Default 60. */
  hz?: number;
  timeScale?: number;
  /** Longest frame gap (seconds) the loop will simulate before dropping time. Default 0.1. */
  maxFrameTime?: number;
  /** Number of frame timings kept for stats. Default 120. */
  statsCapacity?: number;
}

export interface FrameStats {
  /** Most recent frame time in milliseconds. */
  readonly last: number;
  /** Mean of the ring buffer in milliseconds. */
  readonly mean: number;
  /** Largest frame time in the ring buffer in milliseconds. */
  readonly max: number;
  /** Frames per second derived from the mean. */
  readonly fps: number;
  /** Number of samples currently in the buffer. */
  readonly count: number;
  /** Total frames rendered since start(). Keeps counting after the buffer is full. */
  readonly frames: number;
  /** Simulation updates run during the most recent frame. */
  readonly updatesLastFrame: number;
  /** Milliseconds spent in update plus render during the most recent frame. */
  readonly workLast: number;
  /** Mean work time over the ring buffer. The frame interval is vsync-locked; this is the real budget number. */
  readonly workMean: number;
  /** Largest work time in the ring buffer. */
  readonly workMax: number;
  readonly p95: number;
  readonly workP95: number;
  workSamples(): number[];
  /** Copy of the ring buffer in chronological order, for measurement scripts. */
  samples(): number[];
}

export interface GameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
  readonly paused: boolean;
  readonly stepSeconds: number;
  readonly stats: FrameStats;
}

export function createLoop(callbacks: LoopCallbacks, options: LoopOptions = {}): GameLoop {
  const hz = options.hz ?? 60;
  const step = 1 / hz;
  const maxFrameTime = options.maxFrameTime ?? 0.1;
  const capacity = options.statsCapacity ?? 120;

  const ring = new Float32Array(capacity);
  const work = new Float32Array(capacity);
  let workLast = 0;
  let ringIndex = 0;
  let ringCount = 0;
  let lastFrameMs = 0;
  let updatesLastFrame = 0;
  let totalFrames = 0;

  let running = false;
  let paused = false;
  let rafId = 0;
  let lastTime = 0;
  let accumulator = 0;

  function pushSample(ms: number): void {
    work[ringIndex] = workLast;
    ring[ringIndex] = ms;
    ringIndex = (ringIndex + 1) % capacity;
    if (ringCount < capacity) ringCount++;
    lastFrameMs = ms;
    totalFrames++;
  }

  function frame(now: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (paused) {
      lastTime = now;
      return;
    }

    let frameSeconds = (now - lastTime) / 1000;
    lastTime = now;
    const intervalMs = frameSeconds * 1000;
    callbacks.frame?.(Math.max(0, frameSeconds));
    frameSeconds = Math.max(0, Math.min(frameSeconds, maxFrameTime));
    accumulator += Math.min(maxFrameTime, frameSeconds * (options.timeScale ?? 1));

    const workStart = performance.now();
    let updates = 0;
    while (accumulator >= step) {
      callbacks.update(step);
      accumulator -= step;
      updates++;
    }
    updatesLastFrame = updates;
    callbacks.render(accumulator / step);
    workLast = performance.now() - workStart;
    pushSample(intervalMs);
    callbacks.afterFrame?.(intervalMs, workLast);
  }

  function onVisibility(): void {
    paused = document.hidden;
    if (!paused) {
      lastTime = performance.now();
      accumulator = 0;
    }
  }

  function percentile(values: Float32Array): number {
    if (!ringCount) return 0;
    const sorted = Array.from(values.subarray(0, ringCount)).sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  }
  const stats: FrameStats = {
    get p95() { return percentile(ring); },
    get workP95() { return percentile(work); },
    workSamples() {
      return Array.from({ length: ringCount }, (_, i) => work[(ringCount < capacity ? i : ringIndex + i) % capacity] ?? 0);
    },
    get last() {
      return lastFrameMs;
    },
    get mean() {
      if (ringCount === 0) return 0;
      let sum = 0;
      for (let i = 0; i < ringCount; i++) sum += ring[i] ?? 0;
      return sum / ringCount;
    },
    get max() {
      let m = 0;
      for (let i = 0; i < ringCount; i++) {
        const v = ring[i] ?? 0;
        if (v > m) m = v;
      }
      return m;
    },
    get fps() {
      const mean = stats.mean;
      return mean > 0 ? 1000 / mean : 0;
    },
    get count() {
      return ringCount;
    },
    get frames() {
      return totalFrames;
    },
    get updatesLastFrame() {
      return updatesLastFrame;
    },
    get workLast() {
      return workLast;
    },
    get workMean() {
      if (ringCount === 0) return 0;
      let sum = 0;
      for (let i = 0; i < ringCount; i++) sum += work[i] ?? 0;
      return sum / ringCount;
    },
    get workMax() {
      let m = 0;
      for (let i = 0; i < ringCount; i++) {
        const v = work[i] ?? 0;
        if (v > m) m = v;
      }
      return m;
    },
    samples() {
      const out: number[] = [];
      if (ringCount < capacity) {
        for (let i = 0; i < ringCount; i++) out.push(ring[i] ?? 0);
      } else {
        for (let i = 0; i < capacity; i++) out.push(ring[(ringIndex + i) % capacity] ?? 0);
      }
      return out;
    },
  };

  return {
    start() {
      if (running) return;
      running = true;
      paused = document.hidden;
      lastTime = performance.now();
      accumulator = 0;
      document.addEventListener('visibilitychange', onVisibility);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    },
    get running() {
      return running;
    },
    get paused() {
      return paused;
    },
    stepSeconds: step,
    stats,
  };
}
