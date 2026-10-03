/**
 * Pooled particle system. All storage is preallocated typed arrays; spawning,
 * updating and drawing never allocate, so there is no garbage collector hitch
 * on a low-end machine.
 */

export interface ParticleSpawn {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Lifetime in seconds. */
  life: number;
  /** Radius in logical pixels at spawn. */
  size?: number;
  /** Radius at death; defaults to size (no change). */
  endSize?: number;
  /** Downward acceleration in px/s^2. Default 0. */
  gravity?: number;
  /** Velocity multiplier per second, 1 = none. Default 1. */
  drag?: number;
  /** Hue 0..360, saturation and lightness 0..100 for an HSL fill. */
  hue?: number;
  saturation?: number;
  lightness?: number;
  /** Alpha at spawn, fades linearly to 0. Default 1. */
  alpha?: number;
}

export interface ParticleSystem {
  readonly capacity: number;
  readonly alive: number;
  spawn(p: ParticleSpawn): boolean;
  /** Spawn n particles around a point using a generator that fills a reusable spec. */
  burst(n: number, fill: (spec: ParticleSpawn, index: number) => void): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  clear(): void;
}

export function createParticleSystem(capacity: number = 512): ParticleSystem {
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const size = new Float32Array(capacity);
  const endSize = new Float32Array(capacity);
  const gravity = new Float32Array(capacity);
  const drag = new Float32Array(capacity);
  const hue = new Float32Array(capacity);
  const sat = new Float32Array(capacity);
  const light = new Float32Array(capacity);
  const alpha0 = new Float32Array(capacity);
  const color: string[] = new Array<string>(capacity).fill('');
  let alive = 0;

  // Reused by burst() so callers do not allocate a spec per particle.
  const scratch: ParticleSpawn = { x: 0, y: 0, life: 1 };

  function resetScratch(): void {
    scratch.x = 0;
    scratch.y = 0;
    scratch.vx = 0;
    scratch.vy = 0;
    scratch.life = 1;
    scratch.size = 4;
    delete scratch.endSize;
    scratch.gravity = 0;
    scratch.drag = 1;
    scratch.hue = 0;
    scratch.saturation = 80;
    scratch.lightness = 60;
    scratch.alpha = 1;
  }

  function spawn(p: ParticleSpawn): boolean {
    if (alive >= capacity) return false;
    const i = alive++;
    x[i] = p.x;
    y[i] = p.y;
    vx[i] = p.vx ?? 0;
    vy[i] = p.vy ?? 0;
    life[i] = p.life;
    maxLife[i] = p.life;
    size[i] = p.size ?? 4;
    endSize[i] = p.endSize ?? p.size ?? 4;
    gravity[i] = p.gravity ?? 0;
    drag[i] = p.drag ?? 1;
    hue[i] = p.hue ?? 0;
    sat[i] = p.saturation ?? 80;
    light[i] = p.lightness ?? 60;
    alpha0[i] = p.alpha ?? 1;
    color[i] = `hsl(${hue[i]} ${sat[i]}% ${light[i]}%)`;
    return true;
  }

  function kill(i: number): void {
    // Swap-remove keeps the live particles packed at the front.
    const last = --alive;
    if (i === last) return;
    x[i] = x[last] as number;
    y[i] = y[last] as number;
    vx[i] = vx[last] as number;
    vy[i] = vy[last] as number;
    life[i] = life[last] as number;
    maxLife[i] = maxLife[last] as number;
    size[i] = size[last] as number;
    endSize[i] = endSize[last] as number;
    gravity[i] = gravity[last] as number;
    drag[i] = drag[last] as number;
    hue[i] = hue[last] as number;
    sat[i] = sat[last] as number;
    light[i] = light[last] as number;
    alpha0[i] = alpha0[last] as number;
    color[i] = color[last] ?? '';
  }

  return {
    capacity,
    get alive() {
      return alive;
    },
    spawn,
    burst(n, fill) {
      for (let k = 0; k < n && alive < capacity; k++) {
        resetScratch();
        fill(scratch, k);
        spawn(scratch);
      }
    },
    update(dt) {
      for (let i = 0; i < alive; ) {
        const l = (life[i] as number) - dt;
        if (l <= 0) {
          kill(i);
          continue;
        }
        life[i] = l;
        const d = drag[i] as number;
        if (d !== 1) {
          const f = Math.pow(d, dt);
          vx[i] = (vx[i] as number) * f;
          vy[i] = (vy[i] as number) * f;
        }
        vy[i] = (vy[i] as number) + (gravity[i] as number) * dt;
        x[i] = (x[i] as number) + (vx[i] as number) * dt;
        y[i] = (y[i] as number) + (vy[i] as number) * dt;
        i++;
      }
    },
    render(ctx) {
      if (alive === 0) return;
      const savedAlpha = ctx.globalAlpha;
      for (let i = 0; i < alive; i++) {
        const t = 1 - (life[i] as number) / (maxLife[i] as number); // 0 at spawn, 1 at death
        const r = (size[i] as number) + ((endSize[i] as number) - (size[i] as number)) * t;
        if (r <= 0) continue;
        ctx.globalAlpha = (alpha0[i] as number) * (1 - t);
        ctx.fillStyle = color[i] ?? '#fff';
        ctx.beginPath();
        ctx.arc(x[i] as number, y[i] as number, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = savedAlpha;
    },
    clear() {
      alive = 0;
    },
  };
}
