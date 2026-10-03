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
