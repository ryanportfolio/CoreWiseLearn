/** Visible play time; a due break waits for a round boundary. */
export interface SessionTimerOptions {
  nudgeAfterSeconds?: number;
  /** Show the nudge. Return false when it could not be shown; it stays due for the next round boundary. */
  onNudge?: (elapsedSeconds: number) => void | boolean;
  repeatEverySeconds?: number;
}
/** Longer frame gaps (a debugger pause, a sleep with the page visible) are not play time. */
const MAX_GAP_SECONDS = 1;
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
      if (document.hidden || !Number.isFinite(dt) || dt <= 0 || dt > MAX_GAP_SECONDS) return;
      elapsed += dt;
    },
    roundBoundary() {
      if (elapsed < nextNudgeAt) return;
      // Count the nudge as shown only once the app accepted it.
      if (options.onNudge?.(elapsed) === false) return;
      nudged = true;
      nextNudgeAt = options.repeatEverySeconds && options.repeatEverySeconds > 0 ? elapsed + options.repeatEverySeconds : Infinity;
    },
    setNudgeAfter(seconds) {
      if (!Number.isFinite(seconds)) return;
      threshold = Math.max(1, seconds);
      if (!nudged) nextNudgeAt = threshold;
    },
    reset() { elapsed = 0; nudged = false; nextNudgeAt = threshold; },
  };
}
