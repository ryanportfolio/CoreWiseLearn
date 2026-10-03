import type { Button } from './button';

/** A visible default selection and spatial arrow movement, independent of the pointer. */
export function createKeyboardNavigation(getButtons: () => readonly Button[]) {
  let selected: Button | undefined;
  function focus(button: Button | undefined): void {
    if (selected) selected.focused = false;
    selected = button;
    if (selected) selected.focused = true;
  }
  function available(): Button[] {
    return getButtons().filter((b) => b.enabled && b.visible);
  }
  return {
    focus,
    get selected() { return selected; },
    key(key: string): boolean {
      const buttons = available();
      if (!buttons.includes(selected as Button)) focus(buttons[0]);
      if (key === 'Enter' || key === ' ') {
        selected?.activate();
        return true;
      }
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
      if (!direction || !selected) return false;
      const [dx = 0, dy = 0] = direction;
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
