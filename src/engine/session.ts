/** Visible play time; a due break waits for a round boundary. */
export interface SessionTimerOptions {
  nudgeAfterSeconds?: number;
  onNudge?: (elapsedSeconds: number) => void;
  repeatEverySeconds?: number;
}
export interface SessionTimer {
  readonly elapsed: number;
  readonly nudged: boolean;
  readonly pending: boolean;
  tick(dt: number): void;
  /** Deliver a due nudge only after a celebration. */
  roundBoundary(): void;
  setNudgeAfter(seconds: number): void;
  reset(): void;
}
export function createSessionTimer(options: SessionTimerOptions = {}): SessionTimer {
  let threshold = Math.max(1, options.nudgeAfterSeconds ?? 1200);
  let elapsed = 0, nextNudgeAt = threshold;
  let nudged = false;
  return {
    get elapsed() { return elapsed; }, get nudged() { return nudged; },
    get pending() { return elapsed >= nextNudgeAt; },
    tick(dt) {
      if (document.hidden || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += dt;
    },
    roundBoundary() {
      if (elapsed < nextNudgeAt) return;
      nudged = true;
      nextNudgeAt = options.repeatEverySeconds && options.repeatEverySeconds > 0 ? elapsed + options.repeatEverySeconds : Infinity;
      options.onNudge?.(elapsed);
    },
    setNudgeAfter(seconds) {
      if (!Number.isFinite(seconds)) return;
      threshold = Math.max(1, seconds);
      if (!nudged) nextNudgeAt = threshold;
    },
    reset() { elapsed = 0; nudged = false; nextNudgeAt = threshold; },
  };
}
