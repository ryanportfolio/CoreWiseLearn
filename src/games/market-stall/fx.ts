/**
 * Market Stall's effects in the linocut medium: carved wood chips in the four inks (and coin copper and silver), cream
 * glints and gulls. One pooled set of sprite particles (typed arrays, no allocation once made); every shape is baked once per size on a CPU canvas
 * (pitfalls: bakes on GPU canvases stall the first frame that uses their draw modes), never drawn per frame.
 */

/**
 * The four linocut inks (deep blue, orange-red, mustard, cream paper), then the coins' copper and silver, so the chips a
 * coin throws match the coin (penny copper, the others silver).
 */
export const INKS = ['#1d3461', '#c8452a', '#e9b13b', '#fbf3de', '#b8683c', '#c7cbcf'] as const;
export const INK_COUNT = INKS.length;
/** `inks` masks for a coin's chips: copper for the penny, silver for the nickel, dime and quarter (each with cream). */
export const PENNY_INKS = 0b011000, SILVER_INKS = 0b101000;
/** Sprite kinds: chips 0 to 17 (ink = kind % INK_COUNT, shape = kind / INK_COUNT), then a glint and two gull frames. */
export const CHIPS = INK_COUNT * 3, GLINT = CHIPS, GULL = CHIPS + 1;
const KINDS = CHIPS + 3;

function cpu(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
}

/** One chip: a carved shard (three shapes) in one ink, `s` across, with an ink edge on the light ones. */
function bakeChip(s: number, ratio: number, ink: number, shape: number): HTMLCanvasElement {
  const { c, g } = cpu(s * ratio, s * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  g.beginPath();
  if (shape === 0) { g.moveTo(s * 0.1, s * 0.75); g.lineTo(s * 0.55, s * 0.08); g.lineTo(s * 0.92, s * 0.62); g.lineTo(s * 0.48, s * 0.9); }
  else if (shape === 1) { g.moveTo(s * 0.08, s * 0.6); g.quadraticCurveTo(s * 0.5, s * 0.02, s * 0.94, s * 0.42); g.quadraticCurveTo(s * 0.52, s * 0.3, s * 0.12, s * 0.78); }
  else { g.moveTo(s * 0.18, s * 0.2); g.lineTo(s * 0.86, s * 0.12); g.lineTo(s * 0.74, s * 0.84); g.lineTo(s * 0.12, s * 0.7); }
  g.closePath(); g.fillStyle = INKS[ink]!; g.fill();
  if (ink === 3 || ink === 2 || ink === 5) { g.lineWidth = Math.max(1, s * 0.07); g.strokeStyle = INKS[0]; g.stroke(); }
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** A four-point glint, cream with a thin ink edge. */
function bakeGlint(s: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpu(s * ratio, s * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const r = s / 2 - 1, w = r * 0.3, x = s / 2, y = s / 2;
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + w, y - w); g.lineTo(x + r, y); g.lineTo(x + w, y + w); g.lineTo(x, y + r);
  g.lineTo(x - w, y + w); g.lineTo(x - r, y); g.lineTo(x - w, y - w); g.closePath();
  g.fillStyle = INKS[3]; g.fill(); g.lineWidth = Math.max(1, s * 0.06); g.strokeStyle = INKS[0]; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** A gull as a carved ink stroke: wings up (frame 0) or level (frame 1). */
function bakeGull(s: number, ratio: number, frame: number): HTMLCanvasElement {
  const { c, g } = cpu(s * ratio, s * 0.6 * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const lift = frame === 0 ? s * 0.32 : s * 0.12, mid = s * 0.42;
  g.beginPath(); g.moveTo(s * 0.06, mid - lift); g.quadraticCurveTo(s * 0.3, mid - lift - s * 0.08, s * 0.5, mid);
  g.quadraticCurveTo(s * 0.7, mid - lift - s * 0.08, s * 0.94, mid - lift);
  g.lineWidth = Math.max(2, s * 0.11); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INKS[0]; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}
/** A soft ink shadow (baked radial fade, drawn stretched under a carried piece). */
export function bakeShadow(s: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpu(s * ratio, s * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const r = s / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(29, 52, 97, 0.42)'); grad.addColorStop(0.6, 'rgba(29, 52, 97, 0.26)'); grad.addColorStop(1, 'rgba(29, 52, 97, 0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  g.getImageData(0, 0, 1, 1);
  return c;
}

export interface Fx {
  readonly alive: number;
  /** Re-bake every shape for unit size `u` (CSS px per layout unit) at pixel ratio `ratio`; only when they change. */
  bake(u: number, ratio: number): void;
  /** One particle; `drag` slows it (per second; 0 keeps its speed, so it arrives where vx, vy and life aim it). */
  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, gravity: number, spin: number, drag?: number): void;
  /** A burst of `n` chips from (x, y) at about `speed` px/s, upward-biased; `inks` is a bit mask of INKS to use. */
  chips(x: number, y: number, n: number, speed: number, inks: number, size?: number): void;
  /** A few glints around (x, y) within radius r. */
  glints(x: number, y: number, n: number, r: number): void;
  /** Gulls lifting off from (x, y) and flying away to the side `dir` (1 right, -1 left). */
  gulls(x: number, y: number, n: number, dir: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  clear(): void;
}

export function createFx(capacity: number, random: () => number): Fx {
  const x = new Float32Array(capacity), y = new Float32Array(capacity), vx = new Float32Array(capacity), vy = new Float32Array(capacity);
  const rot = new Float32Array(capacity), spin = new Float32Array(capacity), size = new Float32Array(capacity), life = new Float32Array(capacity);
  const max = new Float32Array(capacity), grav = new Float32Array(capacity), kind = new Uint8Array(capacity), phase = new Float32Array(capacity), drag = new Float32Array(capacity);
  const sprites: (HTMLCanvasElement | undefined)[] = new Array<HTMLCanvasElement | undefined>(KINDS).fill(undefined);
  /** Each sprite's own size in CSS px (sprites are baked at `ratio` times this). */
  const baseW = new Float32Array(KINDS), baseH = new Float32Array(KINDS);
  let alive = 0, bakedU = 0, bakedRatio = 0, age = 0;

  function spawn(k: number, px: number, py: number, svx: number, svy: number, l: number, s: number, g: number, sp: number, dr = 1.2): void {
    if (alive >= capacity) return;
    const i = alive++;
    kind[i] = k; drag[i] = dr; x[i] = px; y[i] = py; vx[i] = svx; vy[i] = svy; life[i] = l; max[i] = l; size[i] = s; grav[i] = g; spin[i] = sp;
    rot[i] = random() * Math.PI * 2; phase[i] = random() * 2;
  }
  function kill(i: number): void {
    const last = --alive; if (i === last) return;
    kind[i] = kind[last]!; x[i] = x[last]!; y[i] = y[last]!; vx[i] = vx[last]!; vy[i] = vy[last]!; life[i] = life[last]!; max[i] = max[last]!;
    size[i] = size[last]!; grav[i] = grav[last]!; drag[i] = drag[last]!; spin[i] = spin[last]!; rot[i] = rot[last]!; phase[i] = phase[last]!;
  }
  return {
    get alive() { return alive; },
    bake(u, ratio) {
      if (u === bakedU && ratio === bakedRatio && sprites[0]) return;
      bakedU = u; bakedRatio = ratio;
      const chip = Math.max(12, Math.round(30 * u)), glint = Math.max(16, Math.round(40 * u)), gull = Math.max(24, Math.round(54 * u));
      for (let k = 0; k < CHIPS; k++) { sprites[k] = bakeChip(chip, ratio, k % INK_COUNT, Math.floor(k / INK_COUNT)); baseW[k] = baseH[k] = chip; }
      sprites[GLINT] = bakeGlint(glint, ratio); baseW[GLINT] = baseH[GLINT] = glint;
      for (let f = 0; f < 2; f++) { sprites[GULL + f] = bakeGull(gull, ratio, f); baseW[GULL + f] = gull; baseH[GULL + f] = Math.round(gull * 0.6); }
    },
    spawn,
    chips(px, py, n, speed, inks, s = 1) {
      for (let k = 0; k < n; k++) {
        let ink = Math.floor(random() * INK_COUNT); for (let t = 0; t < INK_COUNT && !(inks & (1 << ink)); t++) ink = (ink + 1) % INK_COUNT;
        const a = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.3, v = speed * (0.45 + random() * 0.55);
        spawn(ink + INK_COUNT * Math.floor(random() * 3), px, py, Math.cos(a) * v, Math.sin(a) * v, 0.55 + random() * 0.45, s * (0.7 + random() * 0.5), speed * 2.4, (random() - 0.5) * 14);
      }
    },
    glints(px, py, n, r) {
      for (let k = 0; k < n; k++) {
        const a = random() * Math.PI * 2, d = r * (0.3 + random() * 0.7);
        spawn(GLINT, px + Math.cos(a) * d, py + Math.sin(a) * d, 0, -12, 0.35 + random() * 0.25, 0.7 + random() * 0.5, 0, (random() - 0.5) * 2);
      }
    },
    gulls(px, py, n, dir) {
      for (let k = 0; k < n; k++) {
        spawn(GULL, px + (random() - 0.5) * 60, py + (random() - 0.5) * 30, dir * (70 + random() * 70), -(45 + random() * 45), 2.2 + random() * 0.8, 0.75 + random() * 0.4, -8, 0, 0);
      }
    },
    update(dt) {
      age += dt;
      for (let i = 0; i < alive;) {
        const l = life[i]! - dt;
        if (l <= 0) { kill(i); continue; }
        life[i] = l;
        const slow = 1 - Math.min(0.9, dt * drag[i]!);
        vx[i] = vx[i]! * slow; vy[i] = vy[i]! * (drag[i]! > 0 ? slow : 1) + grav[i]! * dt;
        x[i] = x[i]! + vx[i]! * dt; y[i] = y[i]! + vy[i]! * dt; rot[i] = rot[i]! + spin[i]! * dt;
        i++;
      }
    },
    render(ctx) {
      if (!alive) return;
      for (let i = 0; i < alive; i++) {
        let k = kind[i]!;
        const gull = k === GULL;
        if (gull) k = GULL + (Math.floor((age + phase[i]!) * 7) & 1);
        const img = sprites[k]; if (!img) continue;
        const t = 1 - life[i]! / max[i]!, fade = t > 0.7 ? (1 - t) / 0.3 : 1, s = size[i]! * (k === GLINT ? 1 - Math.abs(t - 0.4) * 0.8 : 1 - t * 0.35);
        const w = baseW[k]! * s, h = baseH[k]! * s;
        ctx.globalAlpha = fade;
        if (gull) { ctx.drawImage(img, x[i]! - w / 2, y[i]! - h / 2, w, h); continue; }
        ctx.save(); ctx.translate(x[i]!, y[i]!); ctx.rotate(rot[i]!); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
    clear() { alive = 0; },
  };
}
