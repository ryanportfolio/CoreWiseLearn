/**
 * Cumulative play timer. Counts only while ticked (so paused or hidden time
 * does not count) and fires a callback once when play time crosses the nudge
 * threshold, for a "time for a break" prompt.
 */

export interface SessionTimerOptions {
  /** Seconds of play before onNudge fires. Default 20 minutes. */
  nudgeAfterSeconds?: number;
  /** Called once when the threshold is crossed. */
  onNudge?: (elapsedSeconds: number) => void;
  /** If set, onNudge fires again every this many seconds after the first nudge. */
  repeatEverySeconds?: number;
}

export interface SessionTimer {
  /** Seconds of play counted so far. */
  readonly elapsed: number;
  readonly nudged: boolean;
  /** Advance by dt seconds; call from the game loop update. */
  tick(dt: number): void;
  /** Change the threshold at runtime. If already past it, nothing fires until reset. */
  setNudgeAfter(seconds: number): void;
  /** Start counting from zero again and re-arm the nudge. */
  reset(): void;
}

export function createSessionTimer(options: SessionTimerOptions = {}): SessionTimer {
  let threshold = options.nudgeAfterSeconds ?? 20 * 60;
  const repeat = options.repeatEverySeconds;
  let elapsed = 0;
  let nextNudgeAt = threshold;
  let nudged = false;

  return {
    get elapsed() {
      return elapsed;
    },
    get nudged() {
      return nudged;
    },
    tick(dt) {
      if (dt <= 0) return;
      elapsed += dt;
      if (elapsed >= nextNudgeAt) {
        nudged = true;
        options.onNudge?.(elapsed);
        nextNudgeAt = repeat ? nextNudgeAt + repeat : Infinity;
      }
    },
    setNudgeAfter(seconds) {
      threshold = seconds;
      if (!nudged) nextNudgeAt = threshold;
    },
    reset() {
      elapsed = 0;
      nudged = false;
      nextNudgeAt = threshold;
    },
  };
}
