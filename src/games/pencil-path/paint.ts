/**
 * Pencil Path's drawing. The page (paper, no-pencil boxes, ink blots, rulers, erasers, the inside of the cup) and the
 * cup's front walls are baked into two window-sized layers when the page or the window changes; the marble is three
 * baked pieces (glass, a swirl that turns, a gloss that stays). Per frame there are only paths and image copies: no
 * gradients, no text, no blur, no allocation.
 */
import { LEVEL_H, LEVEL_W, LINE_R, R, cupWalls, spinnerEnds, type Level, type P2, type Spinner } from './physics';

const PAPER = '#f8edd8';
const GRAPHITE = '#4d4843';
const DASH = [0.5, 0.45];
const NO_DASH: number[] = [];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export interface Painter {
  /** px per cm, and the page's top-left corner in CSS px. */
  readonly s: number;
  readonly ox: number;
  readonly oy: number;
  layout(width: number, height: number, top: number, dpr: number): void;
  /** Bakes the page layers for this level (call after layout; cheap to call again with the same arguments). */
  bake(level: Level): void;
  toLevel(px: number, py: number, out: P2): P2;
  back(ctx: CanvasRenderingContext2D): void;
  front(ctx: CanvasRenderingContext2D): void;
  /** Starts drawing in page centimetres; end() returns to CSS px. */
  begin(ctx: CanvasRenderingContext2D): void;
  end(ctx: CanvasRenderingContext2D): void;
  strokes(ctx: CanvasRenderingContext2D, strokes: readonly (readonly P2[])[], alpha: number): void;
  /** A dashed pencil line from the start of `path` to fraction p of its length. */
  ghost(ctx: CanvasRenderingContext2D, path: readonly P2[], p: number, alpha: number): void;
  pencil(ctx: CanvasRenderingContext2D, x: number, y: number, lift: number, alpha: number): void;
  tack(ctx: CanvasRenderingContext2D, at: P2, out: number): void;
  marble(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number, alpha: number): void;
  spinner(ctx: CanvasRenderingContext2D, s: Spinner, t: number): void;
  zoneFlash(ctx: CanvasRenderingContext2D, level: Level, alpha: number): void;
  /** The pencil meter, in CSS px: a pencil whose body shortens from the tip as pencil is used. */
  meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, left: number): void;
}

/** Point at fraction p (0..1) of a polyline's length, written into out; returns the segment index reached. */
export function pointAlong(path: readonly P2[], p: number, out: P2): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  let target = Math.max(0, Math.min(1, p)) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (target <= l || i === path.length - 1) {
      const f = l > 0 ? Math.min(1, target / l) : 0;
      out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f;
      return i - 1;
    }
    target -= l;
  }
  out[0] = path[0]?.[0] ?? 0; out[1] = path[0]?.[1] ?? 0;
  return 0;
}

export function createPainter(): Painter {
  let W = 1, H = 1, dpr = 1, s = 20, ox = 0, oy = 0;
  let backLayer = canvas(1, 1), frontLayer = canvas(1, 1), bakedFor: Level | null = null, bakedKey = '';
  let glass = canvas(1, 1), swirl = canvas(1, 1), gloss = canvas(1, 1), marbleKey = 0;
  const ends = [0, 0, 0, 0];
  const at: P2 = [0, 0];

  function bakeMarble(): void {
    const key = Math.round(s * dpr * 100);
    if (key === marbleKey) return;
    marbleKey = key;
    const px = R * s * dpr, size = Math.ceil(px * 2 + 4), c = size / 2;
    glass = canvas(size, size); swirl = canvas(size, size); gloss = canvas(size, size);
    let g = glass.getContext('2d')!;
    const body = g.createRadialGradient(c - px * 0.35, c - px * 0.4, px * 0.1, c, c, px * 1.05);
    body.addColorStop(0, '#e9f1ff'); body.addColorStop(0.45, '#8fb4f5'); body.addColorStop(1, '#2d5bc4');
    g.fillStyle = body; g.beginPath(); g.arc(c, c, px, 0, Math.PI * 2); g.fill();
    g = swirl.getContext('2d')!;
    g.beginPath(); g.arc(c, c, px * 0.98, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(255,140,60,0.88)'; g.lineWidth = px * 0.32; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const u = -1 + (i / 20) * 2, x = c + u * px * 0.8, y = c + Math.sin(u * 3) * px * 0.25;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g = gloss.getContext('2d')!;
    const rim = g.createRadialGradient(c, c, px * 0.7, c, c, px);
    rim.addColorStop(0, 'rgba(20,40,110,0)'); rim.addColorStop(1, 'rgba(20,40,110,0.45)');
    g.fillStyle = rim; g.beginPath(); g.arc(c, c, px, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.ellipse(c - px * 0.35, c - px * 0.42, px * 0.22, px * 0.13, -0.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b2140'; g.lineWidth = Math.max(1, px * 0.06);
    g.beginPath(); g.arc(c, c, px - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
  }

  function bakePaper(g: CanvasRenderingContext2D): void {
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    const r = rng(5);
    g.lineWidth = 0.7;
    for (let i = 0; i < (W * H) / 260; i++) {
      const x = r() * W, y = r() * H, a = r() * Math.PI, l = 1.5 + r() * 5;
      g.strokeStyle = r() < 0.5 ? 'rgba(120,100,70,0.05)' : 'rgba(255,255,255,0.2)';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // a dot every centimetre, lined up with the page so a line can be planned on it
    g.fillStyle = 'rgba(130,155,185,0.5)';
    const x0 = ox - Math.ceil(ox / s) * s, y0 = oy - Math.ceil(oy / s) * s, dot = Math.max(0.8, s * 0.05);
    for (let x = x0; x < W; x += s) for (let y = y0; y < H; y += s) { g.beginPath(); g.arc(x, y, dot, 0, Math.PI * 2); g.fill(); }
  }

  function ruler(g: CanvasRenderingContext2D, a: P2, b: P2): void {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), t = 0.9;
    g.save(); g.translate(a[0], a[1]); g.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
    g.fillStyle = 'rgba(80,50,25,0.18)'; g.fillRect(-0.2, -t / 2 + 0.35, len + 0.9, t);
    g.fillStyle = '#d7a96b'; g.fillRect(-0.45, -t / 2, len + 0.9, t);
    g.fillStyle = '#e6bf86'; g.fillRect(-0.45, -t / 2, len + 0.9, t * 0.3);
    g.strokeStyle = 'rgba(70,40,15,0.6)'; g.lineWidth = 0.05;
    for (let x = 0; x <= len + 0.01; x += 0.5) {
      const big = Math.abs(x - Math.round(x)) < 0.01;
      g.beginPath(); g.moveTo(x, -t / 2); g.lineTo(x, -t / 2 + (big ? 0.32 : 0.18)); g.stroke();
    }
    g.strokeStyle = '#2b2140'; g.lineWidth = 0.08; g.strokeRect(-0.45, -t / 2, len + 0.9, t);
    g.restore();
  }

  function pad(g: CanvasRenderingContext2D, a: P2, b: P2): void {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    g.save(); g.translate(a[0], a[1]); g.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
    const box = (x: number, y: number, w: number, h: number, r: number): void => {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    g.fillStyle = 'rgba(80,50,25,0.18)'; box(-0.25, -0.15, len + 1, 1, 0.35); g.fill();
    g.fillStyle = '#ec8f95'; box(-0.5, -0.5, len + 1, 1, 0.35); g.fill();
    g.strokeStyle = '#2b2140'; g.lineWidth = 0.08; g.stroke();
    g.fillStyle = '#f5b4b7'; box(-0.4, -0.45, len + 0.8, 0.35, 0.2); g.fill();
    g.restore();
  }

  function blot(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const rand = rng(Math.round(x * 31 + y * 17));
    g.fillStyle = '#1e2442';
    g.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI * 2, rr = r * (0.82 + rand() * 0.3);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.quadraticCurveTo(x + Math.cos(a - 0.2) * rr * 1.08, y + Math.sin(a - 0.2) * rr * 1.08, px, py);
    }
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, d = r * (1.15 + rand() * 0.6);
      g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.12 + rand() * 0.3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.15, -0.5, 0, Math.PI * 2); g.fill();
  }

  function noDraw(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    // a hatched box: the pencil lifts here (shown by the pencil, never by words)
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = 'rgba(160,150,140,0.12)'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(110,100,92,0.3)'; g.lineWidth = 0.07;
    for (let d = -h; d < w; d += 0.8) { g.beginPath(); g.moveTo(x + d, y + h); g.lineTo(x + d + h, y); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(110,100,92,0.55)'; g.lineWidth = 0.08; g.setLineDash([0.4, 0.3]); g.strokeRect(x, y, w, h); g.setLineDash(NO_DASH);
  }

  function cup(g: CanvasRenderingContext2D, level: Level, part: 'back' | 'front'): void {
    const [lw, bottom, rw] = cupWalls(level.cup), tl = lw![0], bl = bottom![0], br = bottom![1], tr = rw![1];
    if (part === 'back') {
      g.fillStyle = 'rgba(80,50,25,0.16)';
      g.beginPath(); g.moveTo(tl[0] + 0.3, tl[1] + 0.35); g.lineTo(bl[0] + 0.3, bl[1] + 0.35); g.lineTo(br[0] + 0.3, br[1] + 0.35); g.lineTo(tr[0] + 0.3, tr[1] + 0.35); g.fill();
      g.fillStyle = '#e9dcc4';
      g.beginPath(); g.moveTo(tl[0], tl[1]); g.lineTo(bl[0], bl[1]); g.lineTo(br[0], br[1]); g.lineTo(tr[0], tr[1]); g.closePath(); g.fill();
      return;
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#2b2140'; g.lineWidth = 0.58;
    g.beginPath(); g.moveTo(tl[0], tl[1]); g.lineTo(bl[0], bl[1]); g.lineTo(br[0], br[1]); g.lineTo(tr[0], tr[1]); g.stroke();
    g.strokeStyle = '#d9453a'; g.lineWidth = 0.4; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.12;
    g.beginPath(); g.moveTo(tl[0] + 0.08, tl[1] + 0.2); g.lineTo(bl[0] + 0.1, bl[1] - 0.1); g.stroke();
    g.strokeStyle = '#fbf6ec'; g.lineWidth = 0.45;
    g.beginPath(); g.moveTo(tl[0] - 0.25, tl[1]); g.lineTo(tl[0] + 0.25, tl[1]); g.moveTo(tr[0] - 0.25, tr[1]); g.lineTo(tr[0] + 0.25, tr[1]); g.stroke();
  }

  const painter: Painter = {
    get s() { return s; },
    get ox() { return ox; },
    get oy() { return oy; },
    layout(width, height, top, ratio) {
      W = width; H = height; dpr = ratio;
      s = Math.min((W - 28) / LEVEL_W, (H - top - 14) / (LEVEL_H + 0.6));
      ox = (W - LEVEL_W * s) / 2;
      oy = top + (H - top - 14 - LEVEL_H * s) / 2;
      bakeMarble();
    },
    bake(level) {
      const key = `${W}x${H}@${dpr}:${s}`;
      if (bakedFor === level && bakedKey === key) return;
      bakedFor = level; bakedKey = key;
      backLayer = canvas(W * dpr, H * dpr); frontLayer = canvas(W * dpr, H * dpr);
      let g = backLayer.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      bakePaper(g);
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      for (const z of level.noDraw ?? []) noDraw(g, z.x, z.y, z.w, z.h);
      for (const b of level.blots ?? []) blot(g, b.x, b.y, b.r);
      for (const [a, b] of level.rulers ?? []) ruler(g, a, b);
      for (const [a, b] of level.pads ?? []) pad(g, a, b);
      cup(g, level, 'back');
      g = frontLayer.getContext('2d')!;
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      cup(g, level, 'front');
    },
    toLevel(px, py, out) { out[0] = (px - ox) / s; out[1] = (py - oy) / s; return out; },
    back(ctx) { ctx.drawImage(backLayer, 0, 0, W, H); },
    front(ctx) { ctx.drawImage(frontLayer, 0, 0, W, H); },
    begin(ctx) { ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); },
    end(ctx) { ctx.restore(); },
    strokes(ctx, strokes, alpha) {
      ctx.globalAlpha = alpha * 0.92;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = GRAPHITE; ctx.fillStyle = GRAPHITE; ctx.lineWidth = LINE_R * 2.2;
      for (const st of strokes) {
        if (st.length === 1) { ctx.beginPath(); ctx.arc(st[0]![0], st[0]![1], LINE_R * 1.1, 0, Math.PI * 2); ctx.fill(); continue; }
        if (st.length < 2) continue;
        ctx.beginPath(); ctx.moveTo(st[0]![0], st[0]![1]);
        for (let i = 1; i < st.length; i++) ctx.lineTo(st[i]![0], st[i]![1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    ghost(ctx, path, p, alpha) {
      if (alpha <= 0 || path.length < 2) return;
      ctx.globalAlpha = alpha * 0.55; ctx.strokeStyle = GRAPHITE; ctx.lineWidth = LINE_R * 1.7; ctx.lineCap = 'round';
      ctx.setLineDash(DASH);
      const reached = pointAlong(path, p, at);
      ctx.beginPath(); ctx.moveTo(path[0]![0], path[0]![1]);
      for (let i = 1; i <= reached; i++) ctx.lineTo(path[i]![0], path[i]![1]);
      ctx.lineTo(at[0], at[1]); ctx.stroke();
      ctx.setLineDash(NO_DASH); ctx.globalAlpha = 1;
    },
    pencil(ctx, x, y, lift, alpha) {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y - lift); ctx.scale(0.62, 0.62);
      ctx.save(); ctx.translate(0.6 + lift, lift + 0.5); ctx.rotate(-0.78); ctx.fillStyle = 'rgba(90,60,30,0.16)'; ctx.fillRect(0.5, -0.3, 9, 0.6); ctx.restore();
      ctx.rotate(-0.95);
      ctx.fillStyle = '#e8c08a'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1.2, -0.42); ctx.lineTo(1.2, 0.42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3b3734'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.42, -0.15); ctx.lineTo(0.42, 0.15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2b632'; ctx.fillRect(1.2, -0.42, 8, 0.84);
      ctx.fillStyle = '#f7cb5a'; ctx.fillRect(1.2, -0.42, 8, 0.26);
      ctx.fillStyle = '#bdb6ac'; ctx.fillRect(9.2, -0.42, 0.8, 0.84);
      ctx.fillStyle = '#e98a8a'; ctx.fillRect(10, -0.42, 0.9, 0.84);
      ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 0.1; ctx.strokeRect(1.2, -0.42, 9.7, 0.84);
      ctx.restore();
    },
    tack(ctx, p, out) {
      if (out >= 1) return;
      ctx.save(); ctx.translate(p[0], p[1] + R + 0.15); ctx.rotate(out * 1.4); ctx.globalAlpha = 1 - out;
      ctx.fillStyle = '#b8b0a5'; ctx.fillRect(-0.06, 0, 0.12, 0.7);
      ctx.fillStyle = '#d9453a'; ctx.beginPath(); ctx.ellipse(0, 0, 0.55, 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 0.07; ctx.stroke();
      ctx.restore();
    },
    marble(ctx, x, y, angle, scale, alpha) {
      if (alpha <= 0) return;
      const size = (glass.width / dpr / s) * scale, half = size / 2;
      ctx.globalAlpha = alpha * 0.18; ctx.fillStyle = '#50321a';
      ctx.beginPath(); ctx.ellipse(x + 0.28, y + 0.36, R * scale * 0.98, R * scale * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.drawImage(glass, x - half, y - half, size, size);
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(swirl, -half, -half, size, size); ctx.restore();
      ctx.drawImage(gloss, x - half, y - half, size, size);
      ctx.globalAlpha = 1;
    },
    spinner(ctx, sp, t) {
      spinnerEnds(sp, t, ends);
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(Math.atan2(ends[3]! - ends[1]!, ends[2]! - ends[0]!));
      const L = sp.len;
      ctx.fillStyle = 'rgba(80,50,25,0.15)'; ctx.fillRect(-L + 0.25, 0.05, L * 2, 0.6);
      ctx.fillStyle = '#f2b632'; ctx.fillRect(-L + 0.8, -0.3, L * 2 - 1.6, 0.6);
      ctx.fillStyle = '#f7cb5a'; ctx.fillRect(-L + 0.8, -0.3, L * 2 - 1.6, 0.2);
      ctx.fillStyle = '#e8c08a'; ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(L - 0.8, -0.3); ctx.lineTo(L - 0.8, 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e98a8a'; ctx.fillRect(-L, -0.3, 0.8, 0.6);
      ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 0.08; ctx.strokeRect(-L, -0.3, L * 2 - 0.8, 0.6);
      ctx.restore();
      ctx.fillStyle = '#d9453a'; ctx.beginPath(); ctx.arc(sp.x, sp.y, 0.32, 0, Math.PI * 2); ctx.fill();
    },
    zoneFlash(ctx, level, alpha) {
      if (alpha <= 0) return;
      ctx.globalAlpha = 0.2 * alpha; ctx.fillStyle = '#d6463a';
      if (level.noDraw) for (const z of level.noDraw) ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.globalAlpha = 1;
    },
    meter(ctx, x, y, w, left) {
      const h = Math.max(16, Math.min(26, w * 0.09)), tip = h * 1.1, end = h * 1.3;
      const body = Math.max(0, (w - tip - end) * Math.max(0, Math.min(1, left)));
      const right = x + w, startX = right - end - body;
      ctx.fillStyle = 'rgba(43,33,64,0.08)'; ctx.fillRect(x + tip, y - h / 2, w - tip - end, h);
      ctx.fillStyle = '#bdb6ac'; ctx.fillRect(right - end, y - h / 2, end * 0.4, h);
      ctx.fillStyle = '#e98a8a'; ctx.fillRect(right - end * 0.6, y - h / 2, end * 0.6, h);
      ctx.fillStyle = '#f2b632'; ctx.fillRect(startX, y - h / 2, body, h);
      ctx.fillStyle = '#f7cb5a'; ctx.fillRect(startX, y - h / 2, body, h * 0.3);
      ctx.fillStyle = '#e8c08a'; ctx.beginPath(); ctx.moveTo(startX - tip, y); ctx.lineTo(startX, y - h / 2); ctx.lineTo(startX, y + h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3b3734'; ctx.beginPath(); ctx.moveTo(startX - tip, y); ctx.lineTo(startX - tip * 0.6, y - h * 0.18); ctx.lineTo(startX - tip * 0.6, y + h * 0.18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(startX - tip, y); ctx.lineTo(startX, y - h / 2); ctx.lineTo(right, y - h / 2); ctx.lineTo(right, y + h / 2); ctx.lineTo(startX, y + h / 2); ctx.closePath(); ctx.stroke();
    },
  };
  return painter;
}
