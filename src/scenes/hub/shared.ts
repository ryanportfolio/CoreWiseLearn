/**
 * Helpers shared by the hub, the sticker book and the break nudge: art
 * loading with drawn placeholders for missing files, pre-rendered text and
 * backgrounds, the sound toggle button, and the "seen stickers" record.
 *
 * Everything that allocates (canvases, strings) runs on load, enter or
 * resize, never per frame.
 */

import type { AppServices, RewardsBag } from '../../app/services';
import { rewards } from '../../app/services';
import { STICKERS } from '../../app/stickers';
import { createButton, MIN_HIT, type Button } from '../../ui/button';
import { chunkyText, DISPLAY_FONT, drawCover, OUTLINE } from '../../ui/draw';
import { starPath } from '../../ui/celebrate';
import { playSfx } from '../../audio/sfx';

// ---------------------------------------------------------------------------
// Art loading with placeholders

/** What to draw when an art file is missing. 'none' draws nothing (backgrounds have their own fallback). */
export type PlaceholderKind = 'none' | 'blob' | 'star' | 'speaker-on' | 'speaker-off' | 'speaker-waiting' | 'home' | 'play' | 'person';

export interface ArtRequest {
  /** Sprite-store name, for example 'mascot/idle' or 'sticker:crab'. */
  name: string;
  url: string;
  kind: PlaceholderKind;
  /** Fill colour for the placeholder. */
  color?: string;
}

const PLACEHOLDER_SIZE = 256;
const resolvedNames = new Map<string, string>();
const loads = new Map<string, Promise<void>>();
const found = new Set<string>();
const missing = new Set<string>();

/** The sprite name to draw for `name`: the real art if it loaded, else its placeholder. */
export function artName(name: string): string {
  return resolvedNames.get(name) ?? name;
}

/** Which requested art files loaded and which fell back to a placeholder. */
export function artReport(): { found: string[]; missing: string[] } {
  return { found: [...found].sort(), missing: [...missing].sort() };
}

function outlined(ctx: CanvasRenderingContext2D, fill: string, width = 12): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, kind: PlaceholderKind, color: string): void {
  const s = PLACEHOLDER_SIZE;
  const c = s / 2;
  switch (kind) {
    case 'blob': {
      ctx.beginPath();
      ctx.ellipse(c, c + 10, s * 0.4, s * 0.36, 0, 0, Math.PI * 2);
      outlined(ctx, color);
      for (const dx of [-36, 36]) {
        ctx.beginPath();
        ctx.arc(c + dx, c - 8, 22, 0, Math.PI * 2);
        outlined(ctx, '#ffffff', 6);
        ctx.beginPath();
        ctx.arc(c + dx + 4, c - 4, 10, 0, Math.PI * 2);
        ctx.fillStyle = OUTLINE;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(c, c + 34, 26, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      break;
    }
    case 'star':
      starPath(ctx, c, c + 6, s * 0.44);
      outlined(ctx, color);
      break;
    case 'speaker-on':
    case 'speaker-off':
    case 'speaker-waiting': {
      ctx.beginPath();
      ctx.moveTo(s * 0.18, s * 0.38);
      ctx.lineTo(s * 0.34, s * 0.38);
      ctx.lineTo(s * 0.54, s * 0.2);
      ctx.lineTo(s * 0.54, s * 0.8);
      ctx.lineTo(s * 0.34, s * 0.62);
      ctx.lineTo(s * 0.18, s * 0.62);
      ctx.closePath();
      outlined(ctx, color, 10);
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      if (kind === 'speaker-on') {
        ctx.beginPath();
        ctx.arc(s * 0.56, c, s * 0.16, -0.3 * Math.PI, 0.3 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.56, c, s * 0.3, -0.3 * Math.PI, 0.3 * Math.PI);
        ctx.stroke();
      } else if (kind === 'speaker-waiting') {
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(s * 0.67, s * (0.32 + i * 0.18), 9, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
      } else {
        ctx.beginPath();
        ctx.moveTo(s * 0.64, s * 0.36);
        ctx.lineTo(s * 0.86, s * 0.64);
        ctx.moveTo(s * 0.86, s * 0.36);
        ctx.lineTo(s * 0.64, s * 0.64);
        ctx.stroke();
      }
      break;
    }
    case 'home':
      ctx.beginPath();
      ctx.moveTo(c, s * 0.12);
      ctx.lineTo(s * 0.9, s * 0.5);
      ctx.lineTo(s * 0.78, s * 0.5);
      ctx.lineTo(s * 0.78, s * 0.86);
      ctx.lineTo(s * 0.22, s * 0.86);
      ctx.lineTo(s * 0.22, s * 0.5);
      ctx.lineTo(s * 0.1, s * 0.5);
      ctx.closePath();
      outlined(ctx, color);
      break;
    case 'play':
      ctx.beginPath();
      ctx.moveTo(s * 0.28, s * 0.16);
      ctx.lineTo(s * 0.86, c);
      ctx.lineTo(s * 0.28, s * 0.84);
      ctx.closePath();
      outlined(ctx, color, 14);
      break;
    case 'person':
      ctx.beginPath();
      ctx.arc(c, s * 0.36, s * 0.2, 0, Math.PI * 2);
      outlined(ctx, color);
      ctx.beginPath();
      ctx.ellipse(c, s * 0.92, s * 0.36, s * 0.3, 0, Math.PI, Math.PI * 2);
      outlined(ctx, color);
      break;
    case 'none':
      break;
  }
}

function placeholderUrl(kind: PlaceholderKind, color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = PLACEHOLDER_SIZE;
  canvas.height = PLACEHOLDER_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) drawPlaceholder(ctx, kind, color);
  return canvas.toDataURL('image/png');
}

/**
 * Load one art file. If it fails, a drawn placeholder is registered under
 * `ph:<name>` and artName(name) points at it. Never rejects.
 */
export function loadArt(services: AppServices, req: ArtRequest): Promise<void> {
  const existing = loads.get(req.name);
  if (existing) return existing;
  const p = services.sprites
    .load(req.name, req.url)
    .then(() => {
      found.add(req.url);
      resolvedNames.set(req.name, req.name);
    })
    .catch(async () => {
      missing.add(req.url);
      if (req.kind === 'none') return;
      const phName = `ph:${req.name}`;
      try {
        await services.sprites.load(phName, placeholderUrl(req.kind, req.color ?? '#ffffff'));
        resolvedNames.set(req.name, phName);
      } catch {
        /* drawSprite draws nothing; the scene still runs */
      }
    });
  loads.set(req.name, p);
  return p;
}

export async function loadAllArt(services: AppServices, reqs: readonly ArtRequest[]): Promise<void> {
  await Promise.all(reqs.map((r) => loadArt(services, r)));
}

/** Request for a plain art path such as 'mascot/idle.png'; the sprite name drops the extension. */
export function artRequest(services: AppServices, path: string, kind: PlaceholderKind, color?: string): ArtRequest {
  const req: ArtRequest = { name: path.replace(/\.[a-z0-9]+$/i, ''), url: services.art(path), kind };
  if (color !== undefined) req.color = color;
  return req;
}

/** Art used by more than one scene. */
export const SOUND_ON = 'buttons/sound-on';
export const SOUND_OFF = 'buttons/sound-off';
export const SOUND_WAITING = 'buttons/sound-waiting';

export function soundArt(services: AppServices): ArtRequest[] {
  return [
    artRequest(services, `${SOUND_ON}.png`, 'speaker-on', '#ffffff'),
    artRequest(services, `${SOUND_OFF}.png`, 'speaker-off', '#ffffff'),
    { name: SOUND_WAITING, url: placeholderUrl('speaker-waiting', '#ffffff'), kind: 'speaker-waiting' },
  ];
}

// ---------------------------------------------------------------------------
// Pre-rendered text and backgrounds

export interface TextSprite {
  canvas: HTMLCanvasElement;
  /** Logical size. */
  w: number;
  h: number;
}

/** Render chunky outlined text once into a canvas at device resolution. */
export function makeTextSprite(text: string, sizePx: number, dpr: number, fill = '#ffffff'): TextSprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const stroke = Math.max(4, sizePx * 0.14);
  let w = sizePx * text.length;
  if (ctx) {
    ctx.font = `900 ${sizePx}px ${DISPLAY_FONT}`;
    w = ctx.measureText(text).width;
  }
  const lw = Math.ceil(w + stroke * 2 + 4);
  const lh = Math.ceil(sizePx * 1.3 + stroke * 2);
  canvas.width = Math.max(1, Math.round(lw * dpr));
  canvas.height = Math.max(1, Math.round(lh * dpr));
  const c2 = canvas.getContext('2d');
  if (c2) {
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    chunkyText(c2, text, lw / 2, lh / 2, sizePx, fill);
  }
  return { canvas, w: lw, h: lh };
}

/** Draw a text sprite centred on (x, y), or with its left edge at x when align is 'left'. */
export function drawTextSprite(ctx: CanvasRenderingContext2D, t: TextSprite, x: number, y: number, align: 'left' | 'center' = 'center'): void {
  const left = align === 'left' ? x : x - t.w / 2;
  ctx.drawImage(t.canvas, left, y - t.h / 2, t.w, t.h);
}

/** Where a cover-fitted image lands in a width x height view. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function coverRect(imgW: number, imgH: number, width: number, height: number, out: Rect): Rect {
  const scale = Math.max(width / imgW, height / imgH);
  out.w = imgW * scale;
  out.h = imgH * scale;
  out.x = (width - out.w) / 2;
  out.y = (height - out.h) / 2;
  return out;
}

/**
 * Cover-fit background baked into a device-resolution canvas, so each frame
 * is a 1:1 blit instead of a resample. Reuses `reuse` when the size matches.
 */
export function bakeBackground(
  services: AppServices,
  spriteName: string,
  width: number,
  height: number,
  fallback: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  reuse: HTMLCanvasElement | undefined,
): HTMLCanvasElement {
  const dpr = services.canvas.dpr;
  const pw = Math.max(1, Math.round(width * dpr));
  const ph = Math.max(1, Math.round(height * dpr));
  const canvas = reuse && reuse.width === pw && reuse.height === ph ? reuse : document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  const img = services.sprites.get(spriteName);
  if (img) drawCover(ctx, img, width, height);
  else fallback(ctx, width, height);
  return canvas;
}

// ---------------------------------------------------------------------------
// Buttons

/** Clamp a button radius so the hit area is never under 96 px across. */
export function buttonRadius(height: number, frac: number, max: number): number {
  return Math.max(52, Math.min(max, height * frac));
}

/** The blue sound toggle. Its icon follows audio.muted; call syncSoundIcon each update. */
export function createSoundButton(services: AppServices): Button {
  const button: Button = createButton({
    x: 0,
    y: 0,
    radius: 60,
    fill: '#3b82f6',
    icon: artName(services.audio.muted ? SOUND_OFF : SOUND_ON),
    iconScale: 0.6,
    onPress: () => {
      if (services.audio.state === 'waiting') { void services.audio.unlock(); return; }
      const muted = services.audio.toggleMuted();
      if (!muted) playSfx(services.audio, 'button');
      syncSoundIcon(button, services);
    },
  });
  return button;
}

export function syncSoundIcon(button: Button, services: AppServices): void {
  button.icon = artName(services.audio.state === 'waiting' ? SOUND_WAITING : services.audio.muted ? SOUND_OFF : SOUND_ON);
  button.fill = services.audio.state === 'waiting' ? '#8c78ba' : '#3b82f6';
}

/** Plays 'hover' when the pointer moves onto a button. `prev` holds last frame's state per button. */
export function hoverSounds(services: AppServices, buttons: readonly Button[], prev: boolean[]): void {
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (!b) continue;
    if (b.hovered && !prev[i]) playSfx(services.audio, 'hover');
    prev[i] = b.hovered;
  }
}

// ---------------------------------------------------------------------------
// Sticker bookkeeping

/** Rewards bag for the active profile, or undefined before a name is chosen. */
export function rewardsOrUndefined(services: AppServices): RewardsBag | undefined {
  return services.profile() ? rewards(services) : undefined;
}

/** Sticker ids the child has already looked at in the book. Safe against bad save data. */
export function seenIds(bag: RewardsBag): string[] {
  const raw = bag['seen'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string');
}

/** Earned sticker ids not yet seen in the book, once each, in STICKERS order. */
export function unseenStickers(bag: RewardsBag | undefined): string[] {
  if (!bag) return [];
  const earned = Array.isArray(bag.stickers) ? bag.stickers : [];
  const seen = seenIds(bag);
  const out: string[] = [];
  for (const def of STICKERS) if (earned.includes(def.id) && !seen.includes(def.id)) out.push(def.id);
  return out;
}

export function markSeen(services: AppServices, bag: RewardsBag, ids: readonly string[]): void {
  const seen = seenIds(bag);
  for (const id of ids) if (!seen.includes(id)) seen.push(id);
  bag['seen'] = seen;
  services.save.save();
}

// ---------------------------------------------------------------------------
// Dev layout exposure

/** A hit target, in logical px, for dev-build layout assertions. */
export interface LayoutTarget {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function circleTarget(id: string, b: Button): LayoutTarget {
  const r = Math.max(b.radius, MIN_HIT);
  return { id, x: b.x - r, y: b.y - r, w: r * 2, h: r * 2 };
}
