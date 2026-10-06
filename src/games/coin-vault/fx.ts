/**
 * Coin Vault's feel layer in the game's coloured-pencil medium: pooled bits (gold glints, falling leaves, curled pencil
 * shavings, soft dust puffs) drawn from sprites baked once per size, and the baked pieces the feel needs (the carried
 * piece's shadow, the vault dial, the savings jar's fill). Bakes run on CPU canvases when a size changes, never per
 * frame; spawning, updating and drawing bits allocate nothing.
 */

/** A CPU canvas (pitfalls: bakes on GPU canvases stall the first frame that uses them). */
function cpu(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
}
const INK = '#4a2f1c';

/** Bit sprites: 0 glint, 1 to 3 leaves (sage, olive, russet), 4 to 6 shavings (russet, sky blue, mustard), 7 dust. */
export const GLINT = 0, LEAF = 1, SHAVING = 4, DUST = 7;
const SPRITES = 8;

function bakeGlint(g: CanvasRenderingContext2D, s: number): void {
  const c = s / 2;
  g.beginPath(); g.arc(c, c, s * 0.2, 0, Math.PI * 2); g.fillStyle = 'rgba(255, 236, 170, 0.45)'; g.fill();
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 === 0 ? s * 0.47 : s * 0.11;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath(); g.fillStyle = '#fff4cc'; g.fill(); g.lineWidth = Math.max(1, s * 0.04); g.strokeStyle = '#d9931c'; g.stroke();
}
function bakeLeaf(g: CanvasRenderingContext2D, s: number, fill: string, vein: string): void {
  const c = s / 2;
  g.save(); g.translate(c, c); g.rotate(-0.5);
  g.beginPath(); g.moveTo(-s * 0.44, 0);
  g.quadraticCurveTo(-s * 0.05, -s * 0.34, s * 0.44, 0); g.quadraticCurveTo(-s * 0.05, s * 0.34, -s * 0.44, 0);
  g.fillStyle = fill; g.fill(); g.lineWidth = Math.max(1, s * 0.05); g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.moveTo(-s * 0.4, 0); g.lineTo(s * 0.36, 0); g.lineWidth = Math.max(1, s * 0.035); g.strokeStyle = vein; g.stroke();
  // Pencil hatching across the blade.
  g.lineWidth = Math.max(0.6, s * 0.018); g.strokeStyle = 'rgba(74, 47, 28, 0.28)';
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * s * 0.09 - s * 0.05, -s * 0.12); g.lineTo(i * s * 0.09 + s * 0.05, s * 0.12); g.stroke(); }
  g.restore();
}
function bakeShaving(g: CanvasRenderingContext2D, s: number, rim: string): void {
  const c = s / 2, r0 = s * 0.18, r1 = s * 0.44;
  // A curled fan of wood with a coloured, scalloped outer rim, like a pencil sharpener's shaving.
  g.beginPath(); g.arc(c, c, r1, Math.PI * 0.15, Math.PI * 1.25); g.arc(c, c, r0, Math.PI * 1.25, Math.PI * 0.15, true); g.closePath();
  g.fillStyle = '#e8c58f'; g.fill(); g.lineWidth = Math.max(1, s * 0.04); g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(c, c, r1 - s * 0.03, Math.PI * 0.15, Math.PI * 1.25); g.lineWidth = Math.max(2, s * 0.09); g.strokeStyle = rim; g.stroke();
  g.lineWidth = Math.max(0.6, s * 0.02); g.strokeStyle = 'rgba(74, 47, 28, 0.35)';
  for (let i = 0; i < 6; i++) { const a = Math.PI * (0.25 + i * 0.17); g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * (r1 - s * 0.08), c + Math.sin(a) * (r1 - s * 0.08)); g.stroke(); }
}
function bakeDust(g: CanvasRenderingContext2D, s: number): void {
  const c = s / 2, grad = g.createRadialGradient(c, c, 0, c, c, s / 2);
  grad.addColorStop(0, 'rgba(240, 222, 190, 0.8)'); grad.addColorStop(0.6, 'rgba(225, 200, 160, 0.4)'); grad.addColorStop(1, 'rgba(225, 200, 160, 0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
}

export interface Bits {
  readonly alive: number;
  /** Bake the bit sprites for layout unit `u` at pixel ratio `ratio` (only when either changed). */
  bake(u: number, ratio: number): void;
  /**
   * Spawn `n` bits of sprite `kind` (a group: LEAF and SHAVING pick one of their three colours) around (x, y): flung
   * outward at `speed` px/s (upward bias `up`), `size` px across, living `life` seconds.
   */
  burst(kind: number, n: number, x: number, y: number, spread: number, speed: number, up: number, size: number, life: number, random: () => number): void;
  /** One bit flying from (x, y) toward (tx, ty) in `life` seconds (a gold mote into the jar). */
  toward(kind: number, x: number, y: number, tx: number, ty: number, size: number, life: number): void;
  /** Bits drifting down from the top edge across `width` (celebration). */
  rain(n: number, width: number, size: number, random: () => number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  clear(): void;
}

export function createBits(capacity: number): Bits {
  const x = new Float32Array(capacity), y = new Float32Array(capacity), vx = new Float32Array(capacity), vy = new Float32Array(capacity);
  const rot = new Float32Array(capacity), vr = new Float32Array(capacity), life = new Float32Array(capacity), max = new Float32Array(capacity);
  const size = new Float32Array(capacity), grav = new Float32Array(capacity), drag = new Float32Array(capacity), sway = new Float32Array(capacity);
  const phase = new Float32Array(capacity), kind = new Uint8Array(capacity);
  const sprites: (HTMLCanvasElement | undefined)[] = new Array<HTMLCanvasElement | undefined>(SPRITES).fill(undefined);
  let alive = 0, bakedU = 0, bakedRatio = 0, base = 32;

  function add(k: number, px: number, py: number, pvx: number, pvy: number, s: number, l: number, g: number, d: number, sw: number, r: number, spin: number, ph: number): void {
    if (alive >= capacity) return;
    const i = alive++;
    x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy; size[i] = s; life[i] = l; max[i] = l; grav[i] = g; drag[i] = d; sway[i] = sw;
    rot[i] = r; vr[i] = spin; phase[i] = ph; kind[i] = k;
  }
  function kill(i: number): void {
    const j = --alive; if (i === j) return;
    x[i] = x[j]!; y[i] = y[j]!; vx[i] = vx[j]!; vy[i] = vy[j]!; size[i] = size[j]!; life[i] = life[j]!; max[i] = max[j]!; grav[i] = grav[j]!;
    drag[i] = drag[j]!; sway[i] = sway[j]!; rot[i] = rot[j]!; vr[i] = vr[j]!; phase[i] = phase[j]!; kind[i] = kind[j]!;
  }
  const pickKind = (k: number, random: () => number): number => (k === LEAF || k === SHAVING ? k + Math.floor(random() * 3) : k);

  return {
    get alive() { return alive; },
    bake(u, ratio) {
      if (u === bakedU && ratio === bakedRatio && sprites[0]) return;
      bakedU = u; bakedRatio = ratio; base = Math.max(16, Math.round(40 * u));
      const px = Math.round(base * ratio);
      for (let k = 0; k < SPRITES; k++) {
        const { c, g } = cpu(px, px); sprites[k] = c; if (!g) continue;
        g.lineJoin = 'round'; g.lineCap = 'round';
        if (k === GLINT) bakeGlint(g, px);
        else if (k < SHAVING) bakeLeaf(g, px, ['#9fb57a', '#7f9a55', '#c46a3c'][k - LEAF]!, ['#6f8a4c', '#56713a', '#8e4524'][k - LEAF]!);
        else if (k < DUST) bakeShaving(g, px, ['#b8462e', '#6f9fc8', '#d9a62a'][k - SHAVING]!);
        else bakeDust(g, px);
        g.getImageData(0, 0, 1, 1);
      }
    },
    burst(k, n, px, py, spread, speed, up, s, l, random) {
      for (let i = 0; i < n; i++) {
        const a = random() * Math.PI * 2, v = speed * (0.45 + random() * 0.55), kk = pickKind(k, random);
        const leafy = kk >= LEAF && kk < DUST;
        add(kk, px + (random() - 0.5) * spread, py + (random() - 0.5) * spread * 0.5, Math.cos(a) * v, Math.sin(a) * v * 0.7 - up,
          s * (0.75 + random() * 0.5), l * (0.8 + random() * 0.4), kk === DUST ? -40 : leafy ? 260 : 120, kk === DUST ? 0.08 : leafy ? 0.25 : 0.12,
          leafy ? 40 + random() * 50 : 0, random() * 6.28, (random() - 0.5) * (leafy ? 7 : 2), random() * 6.28);
      }
    },
    toward(k, px, py, tx, ty, s, l) {
      add(k, px, py, (tx - px) / l, (ty - py) / l, s, l, 0, 1, 0, 0, 3, 0);
    },
    rain(n, width, s, random) {
      for (let i = 0; i < n; i++) {
        const kk = random() < 0.55 ? LEAF + Math.floor(random() * 3) : SHAVING + Math.floor(random() * 3);
        add(kk, random() * width, -s - random() * 160, (random() - 0.5) * 60, 60 + random() * 70, s * (0.8 + random() * 0.5), 3 + random() * 1.5,
          18, 1, 50 + random() * 40, random() * 6.28, (random() - 0.5) * 4, random() * 6.28);
      }
    },
    update(dt) {
      for (let i = 0; i < alive;) {
        const l = life[i]! - dt;
        if (l <= 0) { kill(i); continue; }
        life[i] = l;
        if (drag[i] !== 1) { const f = Math.pow(drag[i]!, dt); vx[i]! *= f; vy[i]! *= f; }
        vy[i]! += grav[i]! * dt;
        phase[i]! += dt * 3.2;
        x[i]! += (vx[i]! + Math.sin(phase[i]!) * sway[i]!) * dt; y[i]! += vy[i]! * dt; rot[i]! += vr[i]! * dt;
        i++;
      }
    },
    render(ctx) {
      if (!alive) return;
      const a0 = ctx.globalAlpha;
      for (let i = 0; i < alive; i++) {
        const img = sprites[kind[i]!]; if (!img) continue;
        const t = 1 - life[i]! / max[i]!;
        // Glints twinkle and shrink; leaves and shavings fade in their last third; dust grows as it fades.
        let s = size[i]!, a = t > 0.66 ? (1 - t) / 0.34 : 1;
        if (kind[i] === GLINT) s *= 0.55 + 0.45 * Math.abs(Math.cos(phase[i]! * 1.6)) * (1 - t * 0.5);
        else if (kind[i] === DUST) { s *= 0.7 + t * 0.8; a = 0.85 * (1 - t); }
        if (a <= 0.01) continue;
        ctx.globalAlpha = a0 * Math.min(1, a);
        ctx.save(); ctx.translate(x[i]!, y[i]!); ctx.rotate(rot[i]!); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
      }
      ctx.globalAlpha = a0;
    },
    clear() { alive = 0; },
  };
}

/** A soft round shadow `d` across (a carried coin's, scaled for every coin): baked once per size. */
export function bakeShadow(d: number, ratio: number, round: boolean): HTMLCanvasElement {
  const w = round ? d : d * 2, h = d, pad = d * 0.2, { c, g } = cpu((w + 2 * pad) * ratio, (h + 2 * pad) * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const cx = w / 2 + pad, cy = h / 2 + pad;
  if (round) {
    const grad = g.createRadialGradient(cx, cy, d * 0.2, cx, cy, d / 2 + pad);
    grad.addColorStop(0, 'rgba(50, 30, 15, 0.34)'); grad.addColorStop(0.7, 'rgba(50, 30, 15, 0.2)'); grad.addColorStop(1, 'rgba(50, 30, 15, 0)');
    g.fillStyle = grad; g.fillRect(0, 0, w + 2 * pad, h + 2 * pad);
  } else {
    // A bill's shadow: stacked soft rounded rectangles, darker toward the middle.
    for (let i = 0; i < 6; i++) {
      const k = pad * (1 - i / 6);
      g.beginPath(); g.roundRect(pad - k, pad - k, w + 2 * k, h + 2 * k, h * 0.12 + k); g.fillStyle = 'rgba(50, 30, 15, 0.06)'; g.fill();
    }
  }
  g.getImageData(0, 0, 1, 1);
  return c;
}

/** The vault dial on the door's round plate, `d` across: a brass ring with notches and a three-spoke handle. */
export function bakeDial(d: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpu(d * ratio, d * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const r = d / 2, lw = Math.max(1.5, d * 0.05);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const grad = g.createRadialGradient(r * 0.75, r * 0.7, r * 0.1, r, r, r);
  grad.addColorStop(0, '#f6dc8a'); grad.addColorStop(0.6, '#d6a744'); grad.addColorStop(1, '#a8761f');
  g.beginPath(); g.arc(r, r, r * 0.92, 0, Math.PI * 2); g.fillStyle = grad; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  // Notches around the rim.
  g.lineWidth = Math.max(1, d * 0.03); g.strokeStyle = '#6b4a1e';
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(r + Math.cos(a) * r * 0.72, r + Math.sin(a) * r * 0.72); g.lineTo(r + Math.cos(a) * r * 0.86, r + Math.sin(a) * r * 0.86); g.stroke(); }
  // Three spokes with round knobs, and the hub.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2, ex = r + Math.cos(a) * r * 0.62, ey = r + Math.sin(a) * r * 0.62;
    g.beginPath(); g.moveTo(r, r); g.lineTo(ex, ey); g.lineWidth = d * 0.09; g.strokeStyle = INK; g.stroke(); g.lineWidth = d * 0.05; g.strokeStyle = '#8a5a26'; g.stroke();
    g.beginPath(); g.arc(ex, ey, d * 0.075, 0, Math.PI * 2); g.fillStyle = '#c4573a'; g.fill(); g.lineWidth = lw * 0.8; g.strokeStyle = INK; g.stroke();
  }
  g.beginPath(); g.arc(r, r, d * 0.11, 0, Math.PI * 2); g.fillStyle = '#f2d27a'; g.fill(); g.lineWidth = lw * 0.8; g.strokeStyle = INK; g.stroke();
  g.getImageData(0, 0, 1, 1);
  return c;
}

/**
 * The savings jar's fill, `w` x `h` (the jar's inside from the shoulder to the base): warm gold with coloured-pencil
 * hatching, square-ish at the top and rounded at the base so it reaches the glass walls. Code shows a share of it from
 * the bottom up.
 */
export function bakeJarFill(w: number, h: number, ratio: number): HTMLCanvasElement {
  const { c, g } = cpu(w * ratio, h * ratio); if (!g) return c;
  g.scale(ratio, ratio);
  const rb = w * 0.15, rt = w * 0.05;
  g.beginPath(); g.roundRect(0, 0, w, h, [rt, rt, rb, rb]); g.fillStyle = 'rgba(246, 197, 74, 0.92)'; g.fill();
  g.save(); g.clip();
  g.lineWidth = Math.max(1, w * 0.012); g.strokeStyle = 'rgba(200, 128, 24, 0.45)';
  for (let k = -h; k < w + h; k += Math.max(5, w * 0.045)) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k - h * 0.6, h); g.stroke(); }
  // Cross-hatching the other way, lighter, for the coloured-pencil grain (no shapes a child could count).
  g.lineWidth = Math.max(1, w * 0.008); g.strokeStyle = 'rgba(255, 240, 190, 0.35)';
  for (let k = -h; k < w + h; k += Math.max(7, w * 0.07)) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h * 0.5, h); g.stroke(); }
  g.restore();
  g.getImageData(0, 0, 1, 1);
  return c;
}
