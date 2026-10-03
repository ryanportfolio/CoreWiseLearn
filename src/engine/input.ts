/**
 * Pointer and keyboard input in canvas space, plus browser hardening so a
 * four year old mashing keys cannot scroll, zoom, navigate or open menus.
 *
 * Fullscreen is left alone on purpose: F11 and the browser's own fullscreen
 * controls keep working so an adult can put the hub full screen.
 */

export interface PointerState {
  /** Position in logical canvas pixels (same units the render code draws in). */
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  /** True while any pointer button (or a touch) is held. */
  down: boolean;
  /** True if the pointer has been inside the canvas at least once. */
  inside: boolean;
}

export interface PointerEventInfo {
  x: number;
  y: number;
  /** Pointer id, so multi-touch can be told apart if a game wants to. */
  id: number;
}

export interface KeyEventInfo {
  /** KeyboardEvent.key as reported by the browser. */
  key: string;
  /** KeyboardEvent.code, layout independent. */
  code: string;
  repeat: boolean;
}

export type InputEventMap = {
  pointerdown: PointerEventInfo;
  pointerup: PointerEventInfo;
  pointermove: PointerEventInfo;
  /** Fires on every key press. Use for "press any key" prompts. */
  anykey: KeyEventInfo;
  keydown: KeyEventInfo;
  keyup: KeyEventInfo;
};

export type InputEventName = keyof InputEventMap;
export type InputListener<K extends InputEventName> = (info: InputEventMap[K]) => void;

export interface Input {
  readonly pointer: Readonly<PointerState>;
  /** True while the named key (KeyboardEvent.code, e.g. "ArrowLeft", "Space") is held. */
  isKeyDown(code: string): boolean;
  on<K extends InputEventName>(event: K, fn: InputListener<K>): () => void;
  /** Drop scene-held pointer state; physical keys remain held until keyup to suppress repeats. */
  reset(): void;
  /** Advance the swept pointer origin after a simulation update. */
  endFrame(): void;
  destroy(): void;
}

/** Keys whose default browser action navigates, scrolls or steals focus. */
const BLOCKED_CODES = new Set<string>([
  'Space',
  'Backspace',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Enter',
  'Escape',
]);

/** Ctrl / Meta shortcuts that would leave the page, open UI, or change zoom. */
const BLOCKED_CTRL_KEYS = new Set<string>([
  'r', 'l', 'p', 's', 'o', 'u', 'd', 'h', 'j', 'f', 'g', 'n', 't', 'w', 'e', 'k', 'b',
  '+', '-', '=', '0',
]);

function shouldBlockKey(e: KeyboardEvent): boolean {
  // F11 is the browser fullscreen toggle; leave it and plain F-key behaviour that the
  // browser reserves alone. F1, F3, F5, F6, F7, F10 and F12 open help, find, reload,
  // address bar, caret browsing, menu bar and devtools, so those are blocked.
  if (/^F(1|3|5|6|7|10|12)$/.test(e.code)) return true;
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (BLOCKED_CTRL_KEYS.has(k)) return true;
    if (e.code === 'Tab' || e.code === 'PageUp' || e.code === 'PageDown') return true;
  }
  if (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Home')) return true;
  return BLOCKED_CODES.has(e.code);
}

export function createInput(canvas: HTMLCanvasElement): Input {
  const pointer: PointerState = { x: 0, y: 0, previousX: 0, previousY: 0, down: false, inside: false };
  const keys = new Set<string>();
  let sceneGeneration = 0;
  const listeners: { [K in InputEventName]: Set<InputListener<K>> } = {
    pointerdown: new Set(),
    pointerup: new Set(),
    pointermove: new Set(),
    anykey: new Set(),
    keydown: new Set(),
    keyup: new Set(),
  };

  function emit<K extends InputEventName>(event: K, info: InputEventMap[K]): void {
    for (const fn of [...listeners[event]]) if (listeners[event].has(fn)) fn(info);
  }

  function toCanvas(e: PointerEvent): PointerEventInfo {
    // clientX/Y are CSS pixels; the canvas style size is also CSS pixels, so this
    // maps directly to logical units regardless of the DPR used for the backing store.
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, id: e.pointerId };
  }

  const onPointerDown = (e: PointerEvent): void => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a cancelled pointer has no capture */ }
    canvas.focus({ preventScroll: true });
    const info = toCanvas(e);
    if (!pointer.inside) { pointer.previousX = info.x; pointer.previousY = info.y; }
    pointer.x = info.x;
    pointer.y = info.y;
    pointer.down = true;
    pointer.inside = true;
    emit('pointerdown', info);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent): void => {
    const info = toCanvas(e);
    if (!pointer.inside) { pointer.previousX = info.x; pointer.previousY = info.y; }
    pointer.x = info.x;
    pointer.y = info.y;
    pointer.inside = true;
    emit('pointermove', info);
  };
  const onPointerUp = (e: PointerEvent): void => {
    const info = toCanvas(e);
    if (!pointer.inside) { pointer.previousX = info.x; pointer.previousY = info.y; }
    pointer.x = info.x;
    pointer.y = info.y;
    if (pointer.down) {
      pointer.down = false;
      emit('pointerup', info);
    }
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const onPointerLeave = (): void => {
    pointer.inside = false;
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (shouldBlockKey(e)) e.preventDefault();
    if (e.repeat || keys.has(e.code)) return;
    keys.add(e.code);
    const info: KeyEventInfo = { key: e.key, code: e.code, repeat: false };
    const generation = sceneGeneration;
    emit('anykey', info);
    if (generation === sceneGeneration) emit('keydown', info);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.code);
    emit('keyup', { key: e.key, code: e.code, repeat: false });
  };
  const onBlur = (): void => {
    keys.clear();
    pointer.down = false;
  };

  const prevent = (e: Event): void => e.preventDefault();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // Hardening. passive: false is required for preventDefault to take effect on wheel/touch.
  window.addEventListener('wheel', prevent, { passive: false });
  window.addEventListener('touchmove', prevent, { passive: false });
  window.addEventListener('touchstart', prevent, { passive: false });
  window.addEventListener('contextmenu', prevent);
  window.addEventListener('dragstart', prevent);
  window.addEventListener('selectstart', prevent);
  // Safari pinch gestures (no-ops elsewhere).
  window.addEventListener('gesturestart', prevent);
  window.addEventListener('gesturechange', prevent);
  canvas.addEventListener('dblclick', prevent);

  return {
    pointer,
    isKeyDown: (code) => keys.has(code),
    on(event, fn) {
      listeners[event].add(fn);
      return () => listeners[event].delete(fn);
    },
    reset() {
      sceneGeneration++;
      pointer.down = false;
      pointer.previousX = pointer.x;
      pointer.previousY = pointer.y;
    },
    endFrame() {
      pointer.previousX = pointer.x;
      pointer.previousY = pointer.y;
    },
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('wheel', prevent);
      window.removeEventListener('touchmove', prevent);
      window.removeEventListener('touchstart', prevent);
      window.removeEventListener('contextmenu', prevent);
      window.removeEventListener('dragstart', prevent);
      window.removeEventListener('selectstart', prevent);
      window.removeEventListener('gesturestart', prevent);
      window.removeEventListener('gesturechange', prevent);
      canvas.removeEventListener('dblclick', prevent);
      for (const set of Object.values(listeners)) set.clear();
    },
  };
}
