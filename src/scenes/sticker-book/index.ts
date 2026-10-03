/**
 * Three collection pages, eight stickers each. Owned stickers can play and move.
 * Earned stickers show in full colour with a white sticker border; the rest
 * are dotted circles holding a faint grey version. Stickers earned since the
 * last visit drop in one by one with confetti.
 */

import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { AppServices, RewardsBag } from '../../app/services';
import { STICKERS, stickerSpriteName, type StickerDef } from '../../app/stickers';
import { createButton, dispatchDown, dispatchUp, type Button } from '../../ui/button';
import { chunkyCircle, OUTLINE, roundedRect } from '../../ui/draw';
import { drawEnterFade } from '../../ui/motion';
import { createKeyboardNavigation, drawPageArrow } from '../../ui/navigation';
import { playSfx } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import {
  artName,
  artRequest,
  bakeBackground,
  circleTarget,
  createSoundButton,
  loadAllArt,
  markSeen,
  rewardsOrUndefined,
  soundArt,
  syncSoundIcon,
  unseenStickers,
  type ArtRequest,
  type LayoutTarget,
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
  /** True once a dropping sticker has touched its slot. */
  landed: boolean;
  /** Position in the book, for the pop-in stagger and the sway phase. */
  index: number;
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
  const art = d * 0.8;
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
    const v = 105;
    p[i] = v;
    p[i + 1] = v;
    p[i + 2] = v + 10;
    p[i + 3] = (p[i + 3] ?? 0) * 0.35;
  }
  gctx.putImageData(data, 0, 0);
  slot.grey = grey;
}

export function createStickerBookScene(services: AppServices): Scene {
  const { audio, input, nav } = services;
  let width = services.canvas.width, height = services.canvas.height;
  let time = 0, page = 0, leaving = false;
  let bag: RewardsBag | undefined;
  let selected: Slot | undefined;
  let background: HTMLCanvasElement | undefined;
  let dirty = true;
  const slots: Slot[] = STICKERS.map((def, index) => ({ def, index, x: 0, y: 0, r: 48, count: 0, countText: undefined, color: undefined, grey: undefined, bounce: -1, wobble: -1, drop: -1, dropDelay: 0, landed: true }));
  const home = createButton({ x: 0, y: 0, radius: 48, fill: '#fb923c', icon: artName(HOME), onPress: () => { if (!leaving) { leaving = true; playSfx(audio, 'button'); nav.toHub(); } } });
  const sound = createSoundButton(services);
  const previous = createButton({ x: 0, y: 0, radius: 48, fill: '#a78bfa', onPress: () => changePage(-1) });
  const next = createButton({ x: 0, y: 0, radius: 48, fill: '#a78bfa', onPress: () => changePage(1) });
  const slotButtons = slots.map((slot) => createButton({ x: 0, y: 0, radius: 48, fill: '#fff4dc', onPress: () => tap(slot) }));
  const controls = [home, previous, next, sound];
  const keyboard = createKeyboardNavigation(() => keyboardButtons);
  const layoutInfo: StickerBookLayout = { targets: [] };
  let activeSlots: Slot[] = [];
  let activeButtons: Button[] = [];
  let slotHitOrder: Button[] = [];
  let keyboardButtons: Button[] = [];
  function visibleSlots(): Slot[] { return activeSlots; }
  function positions(): Record<string, { x: number; y: number }> {
    const raw = bag?.['positions'];
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, { x: number; y: number }> : {};
  }
  function savePosition(slot: Slot): void {
    if (!bag) return;
    bag['positions'] = { ...positions(), [slot.def.id]: { x: slot.x / width, y: slot.y / height } };
    services.save.save();
  }
  function tap(slot: Slot): void {
    if (slot.count < 1) return;
    if (selected === slot) { selected = undefined; return; }
    selected = slot;
    slot.bounce = 0;
    keyboard.focus(slotButtons[slot.index]);
    playSfx(audio, 'sticker');
  }
  function place(slot: Slot, x: number, y: number): void {
    slot.x = Math.max(slot.r + 12, Math.min(width - slot.r - 12, x));
    slot.y = Math.max(slot.r + 12, Math.min(height - 120 - slot.r, y));
    const b = slotButtons[slot.index]!; b.x = slot.x; b.y = slot.y;
    savePosition(slot);
  }
  function changePage(step: number): void {
    selected = undefined;
    page = (page + step + Math.ceil(STICKERS.length / 8)) % Math.ceil(STICKERS.length / 8);
    layout(); markVisibleSeen(); keyboard.focus(step > 0 ? next : previous);
    playSfx(audio, 'whoosh');
  }
  function refresh(): void {
    bag = rewardsOrUndefined(services);
    for (const slot of slots) slot.count = bag?.stickers.includes(slot.def.id) ? 1 : 0;
  }
  function markVisibleSeen(): void {
    const unseen = unseenStickers(bag).filter(id => activeSlots.some(slot => slot.def.id === id));
    if (bag && unseen.length) markSeen(services, bag, unseen);
  }
  function layout(): void {
    activeSlots = slots.slice(page * 8, page * 8 + 8);
    const visibleButtons = activeSlots.map((s) => slotButtons[s.index]!);
    activeButtons = [...controls, ...visibleButtons];
    slotHitOrder = visibleButtons.slice().reverse();
    keyboardButtons = [...visibleButtons, ...controls];
    const radius = Math.max(48, Math.min(64, 52 * services.config.uiScale, (width - 48) / 8));
    const y = height - radius - 12;
    [home, previous, next, sound].forEach((b, i) => { b.radius = radius; b.x = (i + 0.5) * width / 4; b.y = y; });
    const cols = width >= 640 ? 4 : width >= 420 ? 3 : 2;
    const rows = Math.ceil(8 / cols);
    const availableHeight = height - 2 * radius - 38;
    const cellW = (width - 24) / cols, cellH = availableHeight / rows;
    const d = Math.max(96, Math.min(190 * services.config.uiScale, cellW - 12, cellH - 8));
    const saved = positions();
    for (let i = 0; i < visibleSlots().length; i++) {
      const slot = visibleSlots()[i]!;
      slot.r = d / 2;
      slot.x = 12 + cellW * (i % cols + 0.5);
      slot.y = 12 + cellH * (Math.floor(i / cols) + 0.5);
      const position = saved[slot.def.id];
      if (slot.count && position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        slot.x = Math.max(slot.r + 12, Math.min(width - slot.r - 12, position.x * width));
        slot.y = Math.max(slot.r + 12, Math.min(availableHeight - slot.r, position.y * height));
      }
      const button = slotButtons[slot.index]!; button.x = slot.x; button.y = slot.y; button.radius = slot.r; button.enabled = slot.count > 0;
    }
    layoutInfo.targets = [...controls.map((b, i) => circleTarget(['home', 'previous', 'next', 'sound'][i]!, b)), ...visibleSlots().map((s) => circleTarget(`slot:${s.def.id}`, slotButtons[s.index]!))];
    dirty = true; background = undefined;
  }
  function bindArt(): void { home.icon = artName(HOME); syncSoundIcon(sound, services); dirty = true; background = undefined; }
  void loadStickerBookAssets(services).then(bindArt);
  const scene: Scene & { layout?: StickerBookLayout } = {
    enter() {
      width = services.canvas.width; height = services.canvas.height; time = 0; leaving = false; selected = undefined;
      refresh(); layout(); markVisibleSeen(); keyboard.focus(keyboardButtons.find((b) => b.enabled) ?? home);
      startMusic(audio, 'sticker-book');
    },
    pause() { stopMusic(audio); },
    resume() { time = 0; startMusic(audio, 'sticker-book'); },
    exit() { stopMusic(audio); },
    resize(w, h) { width = w; height = h; layout(); },
    update(dt) {
      time += dt;
      for (const b of activeButtons) b.update(dt, input.pointer.inside ? input.pointer.x : -9999, input.pointer.inside ? input.pointer.y : -9999);
      syncSoundIcon(sound, services);
      for (const slot of slots) if (slot.bounce >= 0) { slot.bounce += dt; if (slot.bounce >= 3) slot.bounce = -1; }
    },
    render({ ctx }: SceneContext) {
      if (!background) background = bakeBackground(services, BG, width, height, fallbackAlbum, undefined);
      ctx.drawImage(background, 0, 0, width, height);
      if (dirty) { for (const slot of visibleSlots()) buildSlotCanvases(services, slot, slot.r * 2); dirty = false; }
      for (const slot of visibleSlots()) {
        const b = slotButtons[slot.index]!;
        const owned = slot.count > 0;
        ctx.save(); ctx.translate(slot.x, slot.y);
        if (slot.bounce >= 0 && owned) {
          const amount = Math.sin(Math.PI * slot.bounce / 3) * 1;
          ctx.rotate(Math.sin(slot.bounce * 6) * 0.12 * amount);
          const scale = 1 + Math.sin(slot.bounce * 4) * 0.1 * amount; ctx.scale(scale, scale);
        }
        if (owned && (selected === slot || b.focused || b.hovered)) {
          chunkyCircle(ctx, 0, 0, slot.r, selected === slot ? '#ffe48c' : '#fff4dc', OUTLINE, 4);
        }
        if (!owned) {
          ctx.setLineDash([9, 9]); ctx.beginPath(); ctx.arc(0, 0, slot.r * 0.82, 0, Math.PI * 2); ctx.strokeStyle = '#9283a5'; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
        }
        const image = owned ? slot.color : slot.grey;
        if (image) ctx.drawImage(image, -slot.r, -slot.r, slot.r * 2, slot.r * 2);
        ctx.restore();
      }
      for (const b of controls) b.render(ctx, services.sprites);
      drawPageArrow(ctx, previous, -1); drawPageArrow(ctx, next, 1);
      for (let i = 0; i < Math.ceil(STICKERS.length / 8); i++) chunkyCircle(ctx, width / 2 + (i - 1) * 20, height - 16, 6, i === page ? '#ffd23f' : '#d8c9ef', OUTLINE, 2);
      drawEnterFade(ctx, width, height, time);
    },
    handleInput(event: SceneInputEvent) {
      if (leaving || time < 0.4) return;
      if (event.type === 'pointerdown') {
        const { x, y } = event.info;
        if (dispatchDown(controls, x, y)) return;
        if (selected) { place(selected, x, y); selected = undefined; return; }
        dispatchDown(slotHitOrder, x, y);
      } else if (event.type === 'pointerup') dispatchUp(activeButtons, event.info.x, event.info.y);
      else if (event.type === 'keydown' && !event.info.repeat) {
        const key = event.info.key;
        if (selected) {
          if (key === 'Enter' || key === ' ' || key === 'Escape') { selected = undefined; return; }
          const vector = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32] }[key];
          if (vector) { place(selected, selected.x + vector[0]!, selected.y + vector[1]!); return; }
        }
        // Reading order stays reachable even when the child stacks stickers together.
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          const step = key === 'ArrowRight' ? 1 : -1;
          const from = keyboardButtons.indexOf(keyboard.selected as Button);
          for (let offset = 1; offset <= keyboardButtons.length; offset++) {
            const button = keyboardButtons[(from + step * offset + keyboardButtons.length * 2) % keyboardButtons.length]!;
            if (button.enabled && button.visible) { keyboard.focus(button); break; }
          }
          return;
        }
        keyboard.key(key);
      }
    },
  };
  if (import.meta.env.DEV) scene.layout = layoutInfo;
  return scene;
}
