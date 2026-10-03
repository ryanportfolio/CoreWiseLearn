/**
 * The sticker book: one slot per sticker across the album's two pages.
 * Earned stickers show in full colour with a white sticker border; the rest
 * are dotted circles holding a faint grey version. Stickers earned since the
 * last visit drop in one by one with confetti.
 */

import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { AppServices, RewardsBag } from '../../app/services';
import { createParticleSystem } from '../../engine/particles';
import { STICKERS, stickerSpriteName, type StickerDef } from '../../app/stickers';
import { createButton, dispatchDown, dispatchUp, MIN_HIT, type Button } from '../../ui/button';
import { chunkyCircle, OUTLINE, roundedRect } from '../../ui/draw';
import { confettiBurst } from '../../ui/celebrate';
import { easeOutBack, pulse } from '../../ui/tween';
import { playSfx } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import {
  artName,
  artRequest,
  bakeBackground,
  buttonRadius,
  circleTarget,
  coverRect,
  createSoundButton,
  hoverSounds,
  loadAllArt,
  makeTextSprite,
  markSeen,
  rewardsOrUndefined,
  soundArt,
  syncSoundIcon,
  unseenStickers,
  type ArtRequest,
  type LayoutTarget,
  type Rect,
  type TextSprite,
} from '../hub/shared';

const BG = 'backgrounds/sticker-album';
const HOME = 'buttons/home';

/** Page areas as fractions of the album image (left page, right page). */
const PAGES = [
  { x0: 0.07, x1: 0.47, y0: 0.1, y1: 0.88 },
  { x0: 0.53, x1: 0.93, y0: 0.1, y1: 0.88 },
] as const;

const PLACEHOLDER_HUES = ['#ff8a5c', '#5fd36b', '#c084fc', '#ffd23f', '#ff6b6b', '#ffb84d', '#a855f7', '#facc15', '#60a5fa', '#38bdf8'];
const DASH: number[] = [14, 11];
const NO_DASH: number[] = [];
const DROP_SECONDS = 0.75;
const MIN_SLOT = 140;

function stickerArt(services: AppServices): ArtRequest[] {
  return [
    artRequest(services, `${BG}.png`, 'none'),
    artRequest(services, `${HOME}.png`, 'home', '#ffffff'),
    ...soundArt(services),
    ...STICKERS.map((def, i) => ({ name: stickerSpriteName(def.id), url: services.art(def.path), kind: 'blob' as const, color: PLACEHOLDER_HUES[i % PLACEHOLDER_HUES.length] ?? '#ffffff' })),
  ];
}

/** Load (or finish loading) everything the sticker book draws. Never rejects. */
export function loadStickerBookAssets(services: AppServices): Promise<void> {
  return loadAllArt(services, stickerArt(services));
}

interface Slot {
  def: StickerDef;
  x: number;
  y: number;
  r: number;
  count: number;
  countText: TextSprite | undefined;
  /** Full-colour sticker with white border, device resolution. */
  color: HTMLCanvasElement | undefined;
  /** Grey, 20 percent alpha version, device resolution. */
  grey: HTMLCanvasElement | undefined;
  /** Seconds since a bounce or wobble started; negative when idle. */
  bounce: number;
  wobble: number;
  /** Drop-in: waiting while dropDelay > 0, falling while drop < 1. -1 when not animating. */
  drop: number;
  dropDelay: number;
}

export interface StickerBookLayout {
  targets: LayoutTarget[];
}

function fallbackAlbum(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#38b6ff';
  ctx.fillRect(0, 0, w, h);
  const pad = Math.min(w, h) * 0.03;
  roundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 40);
  ctx.fillStyle = '#8b5cf6';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  for (const p of PAGES) {
    const x = w * (p.x0 - 0.04);
    const y = h * (p.y0 - 0.06);
    roundedRect(ctx, x, y, w * (p.x1 - p.x0 + 0.08), h * (p.y1 - p.y0 + 0.1), 26);
    ctx.fillStyle = '#fff4dc';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

/** White sticker border + sprite, and a grey faint copy, both at `d` logical px. */
function buildSlotCanvases(services: AppServices, slot: Slot, d: number): void {
  const dpr = services.canvas.dpr;
  const name = artName(stickerSpriteName(slot.def.id));
  const img = services.sprites.get(name);
  if (!img) {
    slot.color = undefined;
    slot.grey = undefined;
    return;
  }
  const px = Math.max(8, Math.round(d * dpr));
  const art = px * 0.8;
  const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const scaled = services.sprites.scaled(name, art / longest);
  if (!scaled) return;
  const ox = (px - scaled.width) / 2;
  const oy = (px - scaled.height) / 2;

  // White silhouette, stamped around a ring to make the sticker's paper border.
  const white = document.createElement('canvas');
  white.width = scaled.width;
  white.height = scaled.height;
  const wctx = white.getContext('2d');
  const color = slot.color && slot.color.width === px ? slot.color : document.createElement('canvas');
  color.width = px;
  color.height = px;
  const cctx = color.getContext('2d');
  if (!wctx || !cctx) return;
  wctx.drawImage(scaled, 0, 0);
  wctx.globalCompositeOperation = 'source-in';
  wctx.fillStyle = '#ffffff';
  wctx.fillRect(0, 0, white.width, white.height);
  const border = Math.max(3, px * 0.035);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    cctx.drawImage(white, ox + Math.cos(a) * border, oy + Math.sin(a) * border);
  }
  cctx.drawImage(scaled, ox, oy);
  slot.color = color;

  // Grey at 20 percent alpha, computed once from the pixels (no per-frame filter).
  const grey = slot.grey && slot.grey.width === px ? slot.grey : document.createElement('canvas');
  grey.width = px;
  grey.height = px;
  const gctx = grey.getContext('2d', { willReadFrequently: true });
  if (!gctx) return;
  gctx.drawImage(scaled, ox, oy);
  const data = gctx.getImageData(0, 0, px, px);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.3 * (p[i] ?? 0) + 0.59 * (p[i + 1] ?? 0) + 0.11 * (p[i + 2] ?? 0);
    const v = 120 + l * 0.45;
    p[i] = v;
    p[i + 1] = v;
    p[i + 2] = v + 10;
    p[i + 3] = (p[i + 3] ?? 0) * 0.2;
  }
  gctx.putImageData(data, 0, 0);
  slot.grey = grey;
}

export function createStickerBookScene(services: AppServices): Scene {
  const { audio, input, nav } = services;
  const particles = createParticleSystem(400);

  let width = services.canvas.width;
  let height = services.canvas.height;
  let bg: HTMLCanvasElement | undefined;
  let bgDirty = true;
  let canvasesDirty = true;
  let slotD = MIN_SLOT;
  let bag: RewardsBag | undefined;
  let pending: string[] = [];
  let leaving = false;

  const homeButton = createButton({
    x: 0,
    y: 0,
    radius: 64,
    fill: '#fb923c',
    icon: artName(HOME),
    iconScale: 0.6,
    onPress: () => {
      if (leaving) return;
      leaving = true;
      playSfx(audio, 'button');
      nav.toHub();
    },
  });
  const soundButton = createSoundButton(services);
  const buttons: Button[] = [homeButton, soundButton];
  const hoverPrev: boolean[] = [false, false];

  const slots: Slot[] = STICKERS.map((def) => ({
    def,
    x: 0,
    y: 0,
    r: MIN_SLOT / 2,
    count: 0,
    countText: undefined,
    color: undefined,
    grey: undefined,
    bounce: -1,
    wobble: -1,
    drop: -1,
    dropDelay: 0,
  }));
  let pressedSlot: Slot | null = null;
  const layoutInfo: StickerBookLayout = { targets: [] };
  const imgRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  function layout(): void {
    const w = width;
    const h = height;
    const margin = Math.max(16, Math.round(h * 0.03));
    const br = buttonRadius(h, 0.085, 80);
    homeButton.radius = br;
    homeButton.x = margin + br;
    homeButton.y = h - margin - br;
    const sr = buttonRadius(h, 0.075, 72);
    soundButton.radius = sr;
    soundButton.x = w - margin - sr;
    soundButton.y = margin + sr;

    const img = services.sprites.get(BG);
    if (img) coverRect(img.naturalWidth, img.naturalHeight, w, h, imgRect);
    else coverRect(w, h, w, h, imgRect);

    // Split stickers across the pages, then pick the grid that gives the biggest slots.
    const perPage = [Math.ceil(slots.length / 2), Math.floor(slots.length / 2)];
    let best = 0;
    const pageRects: Rect[] = [];
    for (let p = 0; p < 2; p++) {
      const f = PAGES[p];
      if (!f) continue;
      const x0 = Math.max(margin, imgRect.x + imgRect.w * f.x0);
      const x1 = Math.min(w - margin, imgRect.x + imgRect.w * f.x1);
      const y0 = Math.max(margin, imgRect.y + imgRect.h * f.y0);
      const y1 = Math.min(h - margin, imgRect.y + imgRect.h * f.y1);
      pageRects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    const grids: { cols: number; rows: number }[] = [];
    for (let p = 0; p < 2; p++) {
      const n = perPage[p] ?? 0;
      const r = pageRects[p];
      let pick = { cols: 1, rows: Math.max(1, n) };
      let pickSize = 0;
      if (r && n > 0) {
        for (let cols = 1; cols <= n; cols++) {
          const rows = Math.ceil(n / cols);
          const size = Math.min(r.w / cols, r.h / rows);
          if (size > pickSize) {
            pickSize = size;
            pick = { cols, rows };
          }
        }
      }
      grids.push(pick);
      best = p === 0 ? pickSize : Math.min(best, pickSize);
    }
    const d = Math.max(MIN_SLOT, best * 0.84);
    if (Math.abs(d - slotD) > 0.5) canvasesDirty = true;
    slotD = d;

    let k = 0;
    for (let p = 0; p < 2; p++) {
      const n = perPage[p] ?? 0;
      const r = pageRects[p];
      const g = grids[p];
      if (!r || !g) continue;
      const cellW = r.w / g.cols;
      const cellH = r.h / g.rows;
      for (let i = 0; i < n; i++) {
        const s = slots[k++];
        if (!s) continue;
        const row = Math.floor(i / g.cols);
        const inRow = row === g.rows - 1 ? n - row * g.cols : g.cols;
        const col = i - row * g.cols;
        const rowOffset = ((g.cols - inRow) * cellW) / 2;
        s.x = r.x + rowOffset + cellW * (col + 0.5);
        s.y = r.y + cellH * (row + 0.5);
        s.r = d / 2;
      }
    }

    // On small screens a corner slot can reach under a corner button; nudge it clear.
    for (const s of slots) {
      for (const b of buttons) {
        const dx = s.x - b.x;
        const dy = s.y - b.y;
        const dist = Math.hypot(dx, dy) || 1;
        const need = s.r + Math.max(b.radius, MIN_HIT) + 6 - dist;
        if (need > 0) {
          s.x += (dx / dist) * need;
          s.y += (dy / dist) * need;
        }
      }
    }

    if (import.meta.env.DEV) {
      layoutInfo.targets = [
        circleTarget('home', homeButton),
        circleTarget('sound', soundButton),
        ...slots.map((s) => ({ id: `slot:${s.def.id}`, x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 })),
      ];
    }
    bgDirty = true;
  }

  function refreshCounts(): void {
    bag = rewardsOrUndefined(services);
    const earned = bag && Array.isArray(bag.stickers) ? bag.stickers : [];
    const dpr = services.canvas.dpr;
    for (const s of slots) {
      let c = 0;
      for (const id of earned) if (id === s.def.id) c++;
      s.count = c;
      s.countText = c > 1 ? makeTextSprite(String(c), Math.round(Math.max(24, s.r * 0.3)), dpr) : undefined;
    }
  }

  function bindArt(): void {
    homeButton.icon = artName(HOME);
    syncSoundIcon(soundButton, services);
    layout();
    canvasesDirty = true;
  }

  function slotAt(x: number, y: number): Slot | null {
    for (const s of slots) {
      const dx = x - s.x;
      const dy = y - s.y;
      if (dx * dx + dy * dy <= s.r * s.r) return s;
    }
    return null;
  }

  function finishSeen(): void {
    if (bag && pending.length > 0) markSeen(services, bag, pending);
    pending = [];
  }

  function renderSlot(ctx: CanvasRenderingContext2D, s: Slot): void {
    const d = s.r * 2;
    const earnedNow = s.count > 0 && (s.drop < 0 || s.dropDelay <= 0);
    // Empty slot outline (also shown under a sticker that has not dropped yet).
    if (!earnedNow || s.drop >= 0) {
      let rot = 0;
      if (s.wobble >= 0) rot = Math.sin(s.wobble * 18) * 0.12 * (1 - s.wobble / 0.6);
      ctx.save();
      ctx.translate(s.x, s.y);
      if (rot !== 0) ctx.rotate(rot);
      ctx.beginPath();
      ctx.arc(0, 0, s.r * 0.94, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150, 140, 190, 0.22)';
      ctx.fill();
      ctx.setLineDash(DASH);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#6f6597';
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      if (s.grey) ctx.drawImage(s.grey, -s.r, -s.r, d, d);
      ctx.restore();
    }
    if (!earnedNow) return;

    let y = s.y;
    let scale = 1;
    if (s.drop >= 0) {
      const e = easeOutBack(s.drop, 1.4);
      y = s.y - (s.y + d) * (1 - e);
      scale = 1.15 - 0.15 * Math.min(1, s.drop);
    }
    if (s.bounce >= 0) scale *= 1 + 0.22 * pulse(s.bounce / 0.45);
    ctx.save();
    ctx.translate(s.x, y);
    if (scale !== 1) ctx.scale(scale, scale);
    if (s.color) ctx.drawImage(s.color, -s.r, -s.r, d, d);
    else chunkyCircle(ctx, 0, 0, s.r * 0.8, '#ffd23f');
    if (s.countText) {
      const bx = s.r * 0.66;
      const by = s.r * 0.66;
      const br = Math.max(22, s.r * 0.24);
      chunkyCircle(ctx, bx, by, br, '#ef4444', OUTLINE, 5);
      const t = s.countText;
      const k = Math.min(1, (br * 1.7) / t.w);
      ctx.drawImage(t.canvas, bx - (t.w * k) / 2, by - (t.h * k) / 2, t.w * k, t.h * k);
    }
    ctx.restore();
  }

  layout();
  void loadStickerBookAssets(services).then(bindArt);

  const scene: Scene & { layout?: StickerBookLayout } = {
    enter() {
      width = services.canvas.width;
      height = services.canvas.height;
      leaving = false;
      pressedSlot = null;
      particles.clear();
      layout();
      refreshCounts();
      void loadStickerBookAssets(services).then(bindArt);
      pending = unseenStickers(bag);
      for (const s of slots) {
        s.bounce = -1;
        s.wobble = -1;
        s.drop = -1;
        s.dropDelay = 0;
      }
      pending.forEach((id, i) => {
        const s = slots.find((x) => x.def.id === id);
        if (!s) return;
        s.drop = 0;
        s.dropDelay = 0.6 + i * 0.4;
      });
      homeButton.popIn(0.1);
      soundButton.popIn(0.18);
      startMusic(audio, 'sticker-book');
    },
    exit() {
      stopMusic(audio);
    },
    update(dt) {
      const inside = input.pointer.inside;
      const px = inside ? input.pointer.x : -9999;
      const py = inside ? input.pointer.y : -9999;
      for (const b of buttons) b.update(dt, px, py);
      hoverSounds(services, buttons, hoverPrev);
      syncSoundIcon(soundButton, services);
      particles.update(dt);

      let animating = false;
      for (const s of slots) {
        if (s.bounce >= 0) {
          s.bounce += dt;
          if (s.bounce > 0.45) s.bounce = -1;
        }
        if (s.wobble >= 0) {
          s.wobble += dt;
          if (s.wobble > 0.6) s.wobble = -1;
        }
        if (s.drop >= 0) {
          animating = true;
          if (s.dropDelay > 0) {
            s.dropDelay -= dt;
            if (s.dropDelay <= 0) playSfx(audio, 'whoosh', { volume: 0.5 });
            continue;
          }
          s.drop += dt / DROP_SECONDS;
          if (s.drop >= 1) {
            s.drop = -1;
            confettiBurst(particles, s.x, s.y, 60, 380);
            playSfx(audio, 'sticker');
            s.bounce = 0;
          }
        }
      }
      if (!animating && pending.length > 0) finishSeen();
    },
    render(view: SceneContext) {
      const { ctx } = view;
      if (bgDirty || !bg) {
        bg = bakeBackground(services, BG, width, height, fallbackAlbum, bg);
        bgDirty = false;
      }
      if (canvasesDirty) {
        for (const s of slots) buildSlotCanvases(services, s, slotD);
        canvasesDirty = false;
      }
      ctx.drawImage(bg, 0, 0, width, height);
      // Settled slots first, then anything falling so it passes over its neighbours.
      for (const s of slots) if (s.drop < 0) renderSlot(ctx, s);
      for (const s of slots) if (s.drop >= 0) renderSlot(ctx, s);
      for (const b of buttons) b.render(ctx, services.sprites);
      particles.render(ctx);
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'pointerdown') {
        const { x, y } = event.info;
        if (dispatchDown(buttons, x, y)) return;
        pressedSlot = slotAt(x, y);
      } else if (event.type === 'pointerup') {
        const { x, y } = event.info;
        dispatchUp(buttons, x, y);
        const s = pressedSlot;
        pressedSlot = null;
        if (!s || slotAt(x, y) !== s || s.drop >= 0) return;
        if (s.count > 0) {
          s.bounce = 0;
          playSfx(audio, 'sticker');
        } else {
          s.wobble = 0;
        }
      }
    },
    resize(w: number, h: number) {
      width = w;
      height = h;
      layout();
      refreshCounts();
    },
  };
  if (import.meta.env.DEV) scene.layout = layoutInfo;
  return scene;
}
