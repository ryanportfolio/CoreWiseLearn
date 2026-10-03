import type { Button } from './button';
import type { Input } from '../engine/input';

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Keys that usually change another key. With `anyKey` they act when released,
 * and only if no other key went down meanwhile, so Shift+Tab moves focus
 * without also pressing the focused control.
 */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS']);

export interface KeyboardNavigationOptions {
  /** Every key except the arrows and Tab presses the focused control, as Enter does. Default: only Enter and Space. */
  anyKey?: boolean;
  /** Read for Shift, so Shift+Tab moves focus backwards. */
  input?: Pick<Input, 'isKeyDown'>;
}

/**
 * A visible default selection, spatial arrow movement and Tab order,
 * independent of the pointer. Callers pass only first presses (no auto-repeat)
 * through their own input guard.
 */
export function createKeyboardNavigation(getButtons: () => readonly Button[], options: KeyboardNavigationOptions = {}) {
  let selected: Button | undefined;
  /** A modifier pressed on its own, waiting for its release. */
  let armed = '';
  function focus(button: Button | undefined): void {
    if (selected) selected.focused = false;
    selected = button;
    if (selected) selected.focused = true;
    armed = '';
  }
  function available(): Button[] {
    return getButtons().filter((b) => b.enabled && b.visible);
  }
  function shiftHeld(): boolean {
    return !!options.input && (options.input.isKeyDown('ShiftLeft') || options.input.isKeyDown('ShiftRight'));
  }
  return {
    focus,
    get selected() { return selected; },
    /** Handle a key press. Returns true when the key moved focus or pressed a control. */
    key(key: string): boolean {
      const buttons = available();
      if (!buttons.includes(selected as Button)) focus(buttons[0]);
      if (key === 'Tab') {
        if (buttons.length > 0) {
          const step = shiftHeld() ? -1 : 1;
          const i = buttons.indexOf(selected as Button);
          focus(buttons[(i + step + buttons.length) % buttons.length]);
        }
        return true;
      }
      const direction = MOVES[key];
      if (direction) {
        if (!selected) return false;
        const [dx, dy] = direction;
        let best: Button | undefined;
        let score = Infinity;
        for (const b of buttons) {
          const x = b.x - selected.x;
          const y = b.y - selected.y;
          const along = x * dx + y * dy;
          if (along <= 1) continue;
          const across = Math.abs(x * dy - y * dx);
          const value = along + across * 3;
          if (value < score) { best = b; score = value; }
        }
        // Wrapping keeps every control reachable when several rows share an edge.
        if (!best) {
          const step = dx + dy > 0 ? 1 : -1;
          const i = buttons.indexOf(selected);
          best = buttons[(i + step + buttons.length) % buttons.length];
        }
        focus(best);
        return true;
      }
      if (options.anyKey && MODIFIERS.has(key)) {
        armed = key;
        return true;
      }
      if (key !== 'Enter' && key !== ' ' && !options.anyKey) return false;
      armed = '';
      selected?.activate();
      return true;
    },
    /** Handle a key release: a modifier pressed on its own presses the focused control now. */
    keyUp(key: string): boolean {
      if (!armed || key !== armed) return false;
      armed = '';
      if (selected && available().includes(selected)) selected.activate();
      return true;
    },
  };
}

/** Icon-only page controls remain readable without instruction text. */
export function drawPageArrow(ctx: CanvasRenderingContext2D, button: Button, direction: -1 | 1): void {
  if (!button.visible) return;
  const r = button.radius * 0.42;
  ctx.beginPath();
  ctx.moveTo(button.x - direction * r * 0.5, button.y - r);
  ctx.lineTo(button.x + direction * r * 0.7, button.y);
  ctx.lineTo(button.x - direction * r * 0.5, button.y + r);
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff8e8';
  ctx.stroke();
}
