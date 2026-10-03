/**
 * Big round sprite buttons: hover grow, press squash, idle wobble on request.
 * Hit radius is never below MIN_HIT so a four year old can land on it.
 */

import type { SpriteStore } from '../engine/sprites';
import { chunkyCircle, drawSprite } from './draw';
import { reducedMotion } from './motion';
import { arriveAlpha, arriveScale, springStep } from './tween';

/** Hover, press and release spring: about 100 ms to grow, a small overshoot on release. */
const SPRING_OMEGA = 38;
const SPRING_ZETA = 0.55;
/** Pop-in length in seconds; the spring lands in about 0.25 s and settles by the end. */
const POP_SECONDS = 0.4;

export const MIN_HIT = 48; // radius in logical px, so 96 px across

export interface ButtonOptions {
  x: number;
  y: number;
  /** Visual radius. */
  radius: number;
  fill: string;
  /** Sprite name in the SpriteStore, drawn centred. */
  icon?: string;
  /** Icon size relative to diameter. Default 0.62. */
  iconScale?: number;
  onPress: () => void;
  /** Gentle idle wobble so the child notices it. Default false. */
  wobble?: boolean;
}

export interface Button {
  x: number;
  y: number;
  radius: number;
  icon: string | undefined;
  fill: string;
  visible: boolean;
  enabled: boolean;
  hovered: boolean;
  contains(px: number, py: number): boolean;
  update(dt: number, pointerX: number, pointerY: number): void;
  render(ctx: CanvasRenderingContext2D, sprites: SpriteStore): void;
  /** Call on pointerdown; returns true if consumed. */
  pointerDown(px: number, py: number): boolean;
  /** Call on pointerup; fires onPress if the press started and ended inside. */
  pointerUp(px: number, py: number): boolean;
  /** Play the pop-in animation (for example on scene enter). */
  popIn(delaySeconds?: number): void;
}

export function createButton(options: ButtonOptions): Button {
  /** Spring state: [scale, velocity]. */
  const spring = new Float32Array([1, 0]);
  let targetScale = 1;
  let pressed = false;
  let popT = 1;
  let popDelay = 0;
  let wobbleT = Math.random() * Math.PI * 2;
  const iconScale = options.iconScale ?? 0.62;

  const button: Button = {
    x: options.x,
    y: options.y,
    radius: options.radius,
    icon: options.icon,
    fill: options.fill,
    visible: true,
    enabled: true,
    hovered: false,
    contains(px, py) {
      const dx = px - button.x;
      const dy = py - button.y;
      const r = Math.max(button.radius, MIN_HIT);
      return dx * dx + dy * dy <= r * r;
    },
    update(dt, pointerX, pointerY) {
      if (popDelay > 0) {
        popDelay -= dt;
      } else if (popT < 1) {
        popT = Math.min(1, popT + dt / POP_SECONDS);
      }
      button.hovered = button.enabled && button.visible && button.contains(pointerX, pointerY);
      targetScale = pressed ? 0.9 : button.hovered ? 1.1 : 1;
      springStep(spring, targetScale, SPRING_OMEGA, reducedMotion() ? 1 : SPRING_ZETA, dt);
      if (options.wobble) wobbleT += dt * 2.4;
    },
    render(ctx, sprites) {
      if (!button.visible || popDelay > 0) return;
      const calm = reducedMotion();
      const wob = options.wobble && !calm ? Math.sin(wobbleT) * 0.04 : 0;
      const s = (spring[0] ?? 1) * arriveScale(popT, calm);
      const alpha = arriveAlpha(popT);
      if (alpha <= 0) return;
      ctx.save();
      if (alpha < 1) ctx.globalAlpha *= alpha;
      ctx.translate(button.x, button.y);
      if (wob !== 0) ctx.rotate(wob);
      ctx.scale(s, s);
      chunkyCircle(ctx, 0, 0, button.radius, button.fill);
      if (button.icon) drawSprite(ctx, sprites, button.icon, 0, 0, button.radius * 2 * iconScale);
      ctx.restore();
    },
    pointerDown(px, py) {
      if (!button.enabled || !button.visible || !button.contains(px, py)) return false;
      pressed = true;
      return true;
    },
    pointerUp(px, py) {
      if (!pressed) return false;
      pressed = false;
      if (button.enabled && button.visible && button.contains(px, py)) {
        options.onPress();
        return true;
      }
      return false;
    },
    popIn(delaySeconds = 0) {
      popT = 0;
      popDelay = delaySeconds;
      spring[0] = 1;
      spring[1] = 0;
    },
  };
  return button;
}

/** Routes pointer events to a list of buttons; first hit wins. */
export function dispatchDown(buttons: readonly Button[], x: number, y: number): boolean {
  for (const b of buttons) if (b.pointerDown(x, y)) return true;
  return false;
}

export function dispatchUp(buttons: readonly Button[], x: number, y: number): boolean {
  let any = false;
  for (const b of buttons) any = b.pointerUp(x, y) || any;
  return any;
}
