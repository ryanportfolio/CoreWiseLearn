/** Scene interface and a small stack-based scene manager. */

import type { Input, InputEventMap, InputEventName } from './input';

export interface SceneContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

/** Discriminated union: checking `event.type` narrows `event.info`. */
export type SceneInputEvent = {
  [K in InputEventName]: { type: K; info: InputEventMap[K] };
}[InputEventName];

export interface Scene {
  /** Called when the scene becomes the active one. */
  enter?(): void;
  /** Called when the scene is removed. Also called when covered, unless pause() exists. */
  exit?(): void;
  /** Called instead of exit() when another scene is pushed on top. */
  pause?(): void;
  /** Called instead of enter() when the scene above is popped. */
  resume?(): void;
  update(dt: number): void;
  render(view: SceneContext, alpha: number): void;
  /** Receives every pointer and key event while the scene is on top of the stack. */
  handleInput?(event: SceneInputEvent): void;
  /** Called when the canvas changes size. */
  resize?(width: number, height: number): void;
  /**
   * Optional cursor hook: what a press at (x, y) would touch, for the app's big
   * cursor. 'press' for something that acts when clicked, 'grab' for something
   * that can be picked up, 'carry' while the scene holds a piece (wherever the
   * pointer is), null for nothing. Reuse the scene's own hit tests; allocate
   * nothing. Buttons from src/ui/button.ts report their hover by themselves.
   * Called at most once per drawn frame, only while a mouse is over the canvas.
   */
  hoverAt?(x: number, y: number): CursorHover;
}

/** What the cursor is over; see Scene.hoverAt. */
export type CursorHover = 'press' | 'grab' | 'carry' | null;

/**
 * A transition hook runs before a scene change is applied. It may return a
 * promise (for a fade, for example); the manager waits for it, then swaps.
 * The hook receives the outgoing and incoming scenes.
 */
export type TransitionHook = (from: Scene | undefined, to: Scene) => void | Promise<void>;

export interface SceneManager {
  readonly current: Scene | undefined;
  readonly depth: number;
  /**
   * Seconds the top scene has been updated while on top since it was pushed
   * or swapped in; 0 when it has not run a frame yet. An overlay reads this to
   * tell whether the scene it covers has been seen.
   */
  readonly shownSeconds: number;
  /** Put a scene on top; the one below keeps its state but stops updating. */
  push(scene: Scene): Promise<void>;
  /** Remove the top scene and resume the one below. */
  pop(): Promise<void>;
  /** Swap the top scene for another. */
  replace(scene: Scene): Promise<void>;
  setTransition(hook: TransitionHook | undefined): void;
  update(dt: number): void;
  render(view: SceneContext, alpha: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

const INPUT_EVENTS: InputEventName[] = ['pointerdown', 'pointerup', 'pointermove', 'anykey', 'keydown', 'keyup'];

export function createSceneManager(input: Input): SceneManager {
  const stack: Scene[] = [];
  /** Seconds each stacked scene has been updated on top, parallel to `stack`. */
  const shown: number[] = [];
  let transition: TransitionHook | undefined;
  let changing = false;
  let lastWidth = 0;
  let lastHeight = 0;

  const unsubscribe = INPUT_EVENTS.map((type) =>
    input.on(type, (info) => {
      const top = stack[stack.length - 1];
      if (top && !changing) top.handleInput?.({ type, info } as SceneInputEvent);
    }),
  );

  /** Changes asked for while another is in progress (for example from a scene's enter()). */
  const queued: (() => void)[] = [];

  /**
   * Run one stack change. `plan` runs when the change starts, so a queued change
   * sees the stack as the earlier change left it; it returns undefined to skip.
   */
  async function change(plan: () => { to: Scene; apply: () => void } | undefined): Promise<void> {
    if (changing) {
      // Never drop it: a scene's enter() may push the break nudge mid-change.
      return new Promise<void>((resolve, reject) => {
        queued.push(() => { change(plan).then(resolve, reject); });
      });
    }
    changing = true;
    try {
      const step = plan();
      if (!step) return;
      const from = stack[stack.length - 1];
      if (transition) await transition(from, step.to);
      input.reset();
      if (lastWidth > 0 && lastHeight > 0) step.to.resize?.(lastWidth, lastHeight);
      step.apply();
    } finally {
      changing = false;
      queued.shift()?.();
    }
  }

  return {
    get current() {
      return stack[stack.length - 1];
    },
    get depth() {
      return stack.length;
    },
    get shownSeconds() {
      return shown[shown.length - 1] ?? 0;
    },
    push(scene) {
      return change(() => ({
        to: scene,
        apply: () => {
          const covered = stack[stack.length - 1];
          if (covered) (covered.pause ?? covered.exit)?.call(covered);
          stack.push(scene);
          shown.push(0);
          scene.enter?.();
        },
      }));
    },
    pop() {
      return change(() => {
        const below = stack[stack.length - 2];
        if (!below) return undefined;
        return {
          to: below,
          apply: () => {
            stack.pop()?.exit?.();
            shown.pop();
            (below.resume ?? below.enter)?.call(below);
          },
        };
      });
    },
    replace(scene) {
      return change(() => ({
        to: scene,
        apply: () => {
          stack.pop()?.exit?.();
          shown.pop();
          stack.push(scene);
          shown.push(0);
          scene.enter?.();
        },
      }));
    },
    setTransition(hook) {
      transition = hook;
    },
    update(dt) {
      const top = stack.length - 1;
      const scene = stack[top];
      if (!scene) return;
      scene.update(dt);
      // The update may have changed the stack; count the frame only if the scene is still on top.
      if (stack.length - 1 === top && stack[top] === scene) shown[top] = (shown[top] ?? 0) + dt;
    },
    render(view, alpha) {
      stack[stack.length - 1]?.render(view, alpha);
    },
    resize(width, height) {
      lastWidth = width;
      lastHeight = height;
      for (const scene of stack) scene.resize?.(width, height);
    },
    destroy() {
      for (const off of unsubscribe) off();
      queued.length = 0;
      while (stack.length) stack.pop()?.exit?.();
      shown.length = 0;
    },
  };
}
