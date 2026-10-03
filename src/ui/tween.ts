/** Easing helpers. All take t in [0, 1] and return a value, usually in [0, 1]. */

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number): number => Math.pow(clamp01(t), 3);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/** Overshoots past 1 then settles; the classic bouncy pop-in. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const x = clamp01(t) - 1;
  return 1 + x * x * ((overshoot + 1) * x + overshoot);
}

/** Springy bounce used for landings. */
export function easeOutElastic(t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

/** Up-and-down pulse, 0 at t=0 and t=1, 1 at t=0.5. */
export const pulse = (t: number): number => Math.sin(Math.PI * clamp01(t));

/** A value that moves toward a target with exponential smoothing, frame-rate independent. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Arrival scale for pop-ins: starts at 0.9 (never 0) and springs to 1 with a
 * small overshoot (about 1.065). `calm` drops the overshoot when an effect explicitly needs a still pose.
 */
export function arriveScale(t: number, calm = false): number {
  return calm ? 1 : 0.9 + 0.1 * easeOutBack(t, 6);
}

/** Fade-in alpha for an arrival: fully opaque by 40 percent of the way through. */
export const arriveAlpha = (t: number): number => easeOutCubic(clamp01(t / 0.4));

/** Overshoot used by slamScale; the slam touches down (first reaches 1) at SLAM_CONTACT. */
const SLAM_BACK = 1.70158;
export const SLAM_CONTACT = 1 / (SLAM_BACK + 1);

/**
 * A slam: starts at 1 + amount and comes down to 1, dipping a little below
 * on contact before it settles. `calm` lands without the dip.
 */
export function slamScale(t: number, amount: number, calm = false): number {
  return calm ? 1 : 1 + amount * (1 - easeOutBack(t, SLAM_BACK));
}

/**
 * One step of a damped spring, in place on a two-slot state [value, velocity].
 * `omega` is the stiffness in rad/s, `zeta` the damping ratio (1 = no overshoot).
 * Sub-steps internally so a 60 Hz dt stays stable and accurate.
 */
export function springStep(state: Float32Array, target: number, omega: number, zeta: number, dt: number): void {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  let x = state[0] ?? 0;
  let v = state[1] ?? 0;
  for (let i = 0; i < n; i++) {
    v += (omega * omega * (target - x) - 2 * zeta * omega * v) * h;
    x += v * h;
  }
  state[0] = x;
  state[1] = v;
}
