/**
 * Adaptive difficulty with three tiers.
 *
 * The controller watches a rolling window of recent attempts (hit or miss,
 * plus reaction time) and moves between tiers when the window's accuracy
 * crosses a threshold. Hysteresis: the promote threshold is higher than the
 * demote threshold, a minimum number of attempts must be in the window
 * before any change, and a cooldown of attempts follows every change. All
 * numbers below are placeholders to be tuned per game with real children.
 */

export type Tier = 0 | 1 | 2;

export interface DifficultyParams {
  /** Attempts remembered. Default 10. */
  windowSize?: number;
  /** Accuracy (0..1) over the window at or above which the tier goes up. Default 0.85. */
  promoteAccuracy?: number;
  /** Accuracy at or below which the tier goes down. Default 0.5. */
  demoteAccuracy?: number;
  /** Reaction time (seconds) the window's mean must beat to promote. Default Infinity (ignored). */
  promoteMaxReaction?: number;
  /** Mean reaction time above which demotion is allowed even with fair accuracy. Default Infinity (ignored). */
  demoteMinReaction?: number;
  /** Attempts needed in the window before any change. Default 6. */
  minAttempts?: number;
  /** Attempts after a tier change before another is considered. Default 4. */
  cooldownAttempts?: number;
  /** Starting tier. Default 0. */
  initialTier?: Tier;
}

export interface Attempt {
  hit: boolean;
  /** Seconds from prompt to response. Optional for games without a timing component. */
  reactionSeconds?: number;
}

export interface AdaptiveTier {
  readonly tier: Tier;
  /** Accuracy over the current window, 0..1, or undefined when empty. */
  readonly accuracy: number | undefined;
  /** Mean reaction time over the window, seconds, or undefined when no timings. */
  readonly meanReaction: number | undefined;
  /** Record an attempt. Returns the new tier (same as before unless a change happened). */
  record(attempt: Attempt): Tier;
  /** Force a tier (for example when loading a saved profile). Clears the window. */
  setTier(tier: Tier): void;
  /** Subscribe to tier changes. */
  onChange(fn: (tier: Tier, previous: Tier) => void): () => void;
  reset(): void;
}

export function createAdaptiveTier(params: DifficultyParams = {}): AdaptiveTier {
  const windowSize = params.windowSize ?? 10;
  const promoteAccuracy = params.promoteAccuracy ?? 0.85;
  const demoteAccuracy = params.demoteAccuracy ?? 0.5;
  const promoteMaxReaction = params.promoteMaxReaction ?? Infinity;
  const demoteMinReaction = params.demoteMinReaction ?? Infinity;
  const minAttempts = params.minAttempts ?? 6;
  const cooldownAttempts = params.cooldownAttempts ?? 4;

  if (demoteAccuracy >= promoteAccuracy) {
    throw new Error('demoteAccuracy must be below promoteAccuracy for hysteresis to work');
  }

  let tier: Tier = params.initialTier ?? 0;
  const hits = new Uint8Array(windowSize);
  const reactions = new Float32Array(windowSize);
  const hasReaction = new Uint8Array(windowSize);
  let head = 0;
  let count = 0;
  let sinceChange = Infinity;
  const listeners = new Set<(tier: Tier, previous: Tier) => void>();

  function accuracy(): number | undefined {
    if (count === 0) return undefined;
    let h = 0;
    for (let i = 0; i < count; i++) h += hits[i] ?? 0;
    return h / count;
  }

  function meanReaction(): number | undefined {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (hasReaction[i]) {
        sum += reactions[i] ?? 0;
        n++;
      }
    }
    return n ? sum / n : undefined;
  }

  function clearWindow(): void {
    head = 0;
    count = 0;
  }

  function change(next: Tier): void {
    const prev = tier;
    tier = next;
    sinceChange = 0;
    clearWindow();
    for (const fn of listeners) fn(tier, prev);
  }

  return {
    get tier() {
      return tier;
    },
    get accuracy() {
      return accuracy();
    },
    get meanReaction() {
      return meanReaction();
    },
    record(attempt) {
      hits[head] = attempt.hit ? 1 : 0;
      if (attempt.reactionSeconds !== undefined) {
        reactions[head] = attempt.reactionSeconds;
        hasReaction[head] = 1;
      } else {
        hasReaction[head] = 0;
      }
      head = (head + 1) % windowSize;
      if (count < windowSize) count++;
      sinceChange++;

      if (count < minAttempts || sinceChange < cooldownAttempts) return tier;
      const acc = accuracy() ?? 0;
      const rt = meanReaction();

      const fastEnough = rt === undefined || rt <= promoteMaxReaction;
      const tooSlow = rt !== undefined && rt >= demoteMinReaction;

      if (tier < 2 && acc >= promoteAccuracy && fastEnough) {
        change((tier + 1) as Tier);
      } else if (tier > 0 && (acc <= demoteAccuracy || tooSlow)) {
        change((tier - 1) as Tier);
      }
      return tier;
    },
    setTier(t) {
      tier = t;
      sinceChange = Infinity;
      clearWindow();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset() {
      tier = params.initialTier ?? 0;
      sinceChange = Infinity;
      clearWindow();
    },
  };
}
