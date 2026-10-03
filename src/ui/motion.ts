/**
 * The player's reduced-motion preference, read once and kept current. With it
 * on, scenes drop idle sway, wobble and pop overshoot, and keep fades and
 * every celebration (docs/design/motion.md, "Safety and comfort").
 */

const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
let reduced = query?.matches ?? false;
query?.addEventListener('change', (e) => {
  reduced = e.matches;
});

/** True when the system asks for reduced motion. Cheap enough to call every frame. */
export function reducedMotion(): boolean {
  return reduced;
}

/** Length of the fade every full-screen scene draws over itself on enter. */
export const ENTER_FADE_SECONDS = 0.45;
const FADE_COLOR = '#2b2140';

/**
 * Fade in from the house outline colour over the first ENTER_FADE_SECONDS
 * after a scene enters. `t` is seconds since enter. Draws nothing afterwards.
 */
export function drawEnterFade(ctx: CanvasRenderingContext2D, width: number, height: number, t: number): void {
  if (t >= ENTER_FADE_SECONDS) return;
  const k = t <= 0 ? 0 : t / ENTER_FADE_SECONDS;
  // Ease out: most of the scene is visible within the first third.
  const a = (1 - k) * (1 - k) * (1 - k);
  if (a <= 0.003) return;
  const saved = ctx.globalAlpha;
  ctx.globalAlpha = a;
  ctx.fillStyle = FADE_COLOR;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = saved;
}
