/**
 * Name entry start screen. A child types (or taps) their name, or taps the
 * bubble of a name already saved, and goes to the hub. No instruction text:
 * the only words on screen are names. Nothing is ever wrong; an action that
 * does nothing gets a soft wobble and a gentle sound.
 */

import type { AppServices } from '../../app/services';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { Profile } from '../../engine/save';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import { accentFor, avatarPath, avatarSpriteName } from '../../app/avatar';
import { chunkyCircle, chunkyPanel, chunkyText, drawCover, groundShadow, OUTLINE, DISPLAY_FONT } from '../../ui/draw';
import { createButton, dispatchDown, dispatchUp, type Button } from '../../ui/button';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, pulse, slamScale } from '../../ui/tween';
import { drawEnterFade, reducedMotion } from '../../ui/motion';
import { drawMascotAt } from '../../ui/mascot';
import { confettiBurst } from '../../ui/celebrate';
import { playSfx, type SfxName, type SfxOptions } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { computeLayout, emptyLayout, KEY_ROWS, MAX_LETTERS } from './layout';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_BUBBLES = 8;
const GHOSTS = 4;

const BG = 'backgrounds/meadow-sky';
const MASCOT_IDLE = 'mascot/idle';
const MASCOT_CHEER = 'mascot/cheer';
const MASCOT_POINT = 'mascot/point';
const MASCOT_WAVE = 'mascot/wave';
const ICON_BACK = 'buttons/backspace';
const ICON_GO = 'buttons/play-arrow';
/** Stand-in face for a profile bubble whose animal art has not loaded. */
const SILHOUETTE = 'buttons/avatar-silhouette';
/** The point pose art points right; the keyboard is to the mascot's left. */
const POINT_FLIP = -1;
/** Mascot reaction to a letter: pose swap plus a squash, then a stretched bounce. */
const CHEER_SECONDS = 0.35;
/** Key squash on a letter: snaps down, then springs back with a small overshoot. */
const KEY_FLASH_SECONDS = 0.22;
/** A typed letter slams in for LETTER_SLAM; a removed one drops away in 75 percent of that. */
const LETTER_SLAM = 0.32;
const GHOST_SECONDS = 0.24;

/** Bright fills that cycle across keys and letter panels, with matching sparkle hues. */
const PALETTE = ['#ff5a5f', '#ffb627', '#9b5de5', '#2ec27e', '#2f9bff', '#ff7f3f', '#f25cae', '#1fc8db'] as const;
const PALETTE_HUE = [358, 40, 270, 150, 210, 22, 325, 187] as const;
const CREAM = '#fff4dc';
const SLOT_DOT = '#d8ccb6';
const GO_GREEN = '#2ec27e';
const BACK_FILL = '#ff9f43';

const HOVER_OPTS: SfxOptions = { volume: 0.6 };
const SOFT_OPTS: SfxOptions = { volume: 0.7 };

/** Sprite name to art path for everything this scene draws (avatars are added per profile). */
export function nameEntryArt(): Record<string, string> {
  return {
    [BG]: 'backgrounds/meadow-sky.png',
    [MASCOT_IDLE]: 'mascot/idle.png',
    [MASCOT_CHEER]: 'mascot/cheer.png',
    [MASCOT_POINT]: 'mascot/point.png',
    [MASCOT_WAVE]: 'mascot/wave.png',
    [ICON_BACK]: 'buttons/backspace.png',
    [ICON_GO]: 'buttons/play-arrow.png',
    [SILHOUETTE]: 'buttons/avatar-silhouette.png',
  };
}

/** Load this scene's art. Missing files are tolerated; the scene draws placeholders. */
export function loadNameEntryArt(services: AppServices): Promise<void> {
  const art = nameEntryArt();
  const map: Record<string, string> = {};
  for (const name of Object.keys(art)) map[name] = services.art(art[name] as string);
  return services.sprites.loadAll(map).catch(() => undefined);
}

function glyphName(letter: number): string {
  return `glyph:${ALPHABET[letter]}`;
}

/**
 * Letter faces for the keyboard keys, rendered once to images and registered
 * in the sprite store so createButton draws them through the scaled cache
 * (no font string building per frame).
 */
const glyphStores = new WeakSet<object>();
function ensureGlyphs(services: AppServices): void {
  if (glyphStores.has(services.sprites)) return;
  glyphStores.add(services.sprites);
  const size = 160;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return;
  for (let i = 0; i < ALPHABET.length; i++) {
    g.clearRect(0, 0, size, size);
    chunkyText(g, ALPHABET[i] as string, size / 2, size / 2 + 6, 112);
    void services.sprites.load(glyphName(i), c.toDataURL('image/png')).catch(() => undefined);
  }
}

interface Offscreen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

function makeOffscreen(): Offscreen {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  return { canvas, ctx, w: 0, h: 0 };
}

/** Resize the backing store for a logical size and reset the transform to dpr scale. */
function sizeOffscreen(o: Offscreen, w: number, h: number, dpr: number): void {
  o.w = w;
  o.h = h;
  o.canvas.width = Math.max(1, Math.ceil(w * dpr));
  o.canvas.height = Math.max(1, Math.ceil(h * dpr));
  o.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  o.ctx.clearRect(0, 0, w, h);
}

interface Slot {
  /** Alphabet index, or -1 when empty. */
  letter: number;
  color: number;
  /** Seconds since the letter appeared. */
  age: number;
  img: Offscreen;
}

interface Ghost {
  active: boolean;
  x: number;
  y: number;
  t: number;
  spin: number;
  img: Offscreen;
}

export interface NameEntryDebug {
  readonly name: string;
  readonly letters: number;
  readonly leaving: boolean;
  readonly attract: boolean;
  readonly pose: string;
  readonly wide: boolean;
  /** playSfx calls by sound name since the scene was created. */
  readonly sfx: Record<string, number>;
  keyCenter(letter: string): { x: number; y: number } | undefined;
  goCenter(): { x: number; y: number };
  backCenter(): { x: number; y: number };
  bubbleCenter(index: number): { x: number; y: number } | undefined;
  /** Art names this scene asked for, split by whether they loaded. */
  art(): { loaded: string[]; missing: string[] };
}

export function createNameEntryScene(services: AppServices): Scene {
  const { sprites, input, audio } = services;
  const particles = createParticleSystem(256);
  const L = emptyLayout();
  let dpr = 1;

  ensureGlyphs(services);
  void loadNameEntryArt(services);

  const sfxCounts: Record<string, number> = {};
  function sfx(name: SfxName, options?: SfxOptions): void {
    sfxCounts[name] = (sfxCounts[name] ?? 0) + 1;
    playSfx(audio, name, options);
  }

  // ---- State ---------------------------------------------------------------
  let t = 0;
  let name = '';
  let count = 0;
  let leaving = false;
  let leaveT = -1;
  let goT = -1;
  /** Seconds since the GO (or profile) hop started; -1 when not hopping. */
  let hopT = -1;
  let cheerT = 0;
  let missT = 0;
  let waveT = 0;
  let idleT = 0;
  let attract = false;
  let attractT = 0;
  let trayShakeT = 0;
  let goShakeT = 0;
  let lastHoverAt = -1;

  const slots: Slot[] = [];
  for (let i = 0; i < MAX_LETTERS; i++) slots.push({ letter: -1, color: 0, age: 0, img: makeOffscreen() });
  const ghosts: Ghost[] = [];
  for (let i = 0; i < GHOSTS; i++) ghosts.push({ active: false, x: 0, y: 0, t: 0, spin: 0, img: makeOffscreen() });
  let nextGhost = 0;

  const bg = makeOffscreen();
  let bgHasArt = false;
  const tray = makeOffscreen();

  // ---- Buttons -------------------------------------------------------------
  const keys: Button[] = [];
  for (let i = 0; i < ALPHABET.length; i++) {
    const letter = i;
    keys.push(
      createButton({
        x: 0,
        y: 0,
        radius: 48,
        fill: PALETTE[i % PALETTE.length] as string,
        icon: glyphName(i),
        iconScale: 0.92,
        onPress: () => typeLetter(letter),
      }),
    );
  }
  const keyWiggle = new Float32Array(ALPHABET.length);
  const keyFlash = new Float32Array(ALPHABET.length);
  const wasHovered = new Uint8Array(ALPHABET.length + 2 + MAX_BUBBLES);

  const backBtn = createButton({ x: 0, y: 0, radius: 48, fill: BACK_FILL, icon: ICON_BACK, iconScale: 0.62, onPress: () => backspace() });
  const goBtn = createButton({ x: 0, y: 0, radius: 56, fill: GO_GREEN, icon: ICON_GO, iconScale: 0.6, onPress: () => go() });

  let profiles: Profile[] = [];
  let bubbles: Button[] = [];
  let avatarNames: string[] = [];
  let labels: Offscreen[] = [];
  const bubbleBounce = new Float32Array(MAX_BUBBLES);
  let buttons: Button[] = [];

  // ---- Actions -------------------------------------------------------------
  function markActive(): void {
    idleT = 0;
    if (attract) {
      attract = false;
      keyWiggle.fill(0);
    }
  }

  function rebuildName(): void {
    let s = '';
    for (let i = 0; i < count; i++) s += ALPHABET[(slots[i] as Slot).letter];
    name = s;
  }

  function slotX(i: number): number {
    return L.trayX + L.trayPad + L.slotPitch * (i + 0.5);
  }

  function renderSlotImage(slot: Slot): void {
    const o = slot.img;
    const w = L.panelW;
    const h = L.panelH;
    sizeOffscreen(o, w, h, dpr);
    const lw = Math.max(4, Math.min(6, w * 0.07));
    chunkyPanel(o.ctx, lw / 2, lw / 2, w - lw, h - lw, PALETTE[slot.color] as string, OUTLINE, Math.min(w, h) * 0.26, lw);
    chunkyText(o.ctx, ALPHABET[slot.letter] as string, w / 2, h / 2 + h * 0.03, h * 0.7);
  }

  function wobbleTray(): void {
    trayShakeT = 0.45;
    sfx('miss', SOFT_OPTS);
  }

  function typeLetter(letter: number): void {
    if (leaving) return;
    markActive();
    keyFlash[letter] = KEY_FLASH_SECONDS;
    if (count >= MAX_LETTERS) {
      wobbleTray();
      return;
    }
    const slot = slots[count] as Slot;
    slot.letter = letter;
    slot.color = count % PALETTE.length;
    slot.age = 0;
    renderSlotImage(slot);
    const x = slotX(count);
    const hue = PALETTE_HUE[slot.color] as number;
    count++;
    rebuildName();
    particles.burst(12, (p: ParticleSpawn, k: number) => {
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.4;
      const v = 160 + Math.random() * 140;
      p.x = x;
      p.y = L.rowY;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 60;
      p.life = 0.45 + Math.random() * 0.25;
      p.size = 5 + Math.random() * 4;
      p.endSize = 1;
      p.drag = 0.05;
      p.gravity = 300;
      p.hue = k % 3 === 0 ? 50 : hue;
      p.saturation = 95;
      p.lightness = k % 3 === 0 ? 70 : 62;
    });
    cheerT = CHEER_SECONDS;
    sfx('key', { index: letter });
  }

  function backspace(): void {
    if (leaving) return;
    markActive();
    if (count === 0) {
      wobbleTray();
      return;
    }
    count--;
    const slot = slots[count] as Slot;
    const ghost = ghosts[nextGhost] as Ghost;
    nextGhost = (nextGhost + 1) % GHOSTS;
    // Swap images so the slot is free at once while the old panel drops away.
    const img = ghost.img;
    ghost.img = slot.img;
    slot.img = img;
    ghost.active = true;
    ghost.x = slotX(count);
    ghost.y = L.rowY;
    ghost.t = 0;
    ghost.spin = Math.random() < 0.5 ? -1 : 1;
    slot.letter = -1;
    rebuildName();
    sfx('backspace');
  }

  function go(): void {
    if (leaving) return;
    markActive();
    if (count === 0) {
      goShakeT = 0.5;
      trayShakeT = 0.45;
      missT = 0.7;
      sfx('miss', SOFT_OPTS);
      return;
    }
    leaving = true;
    leaveT = 1.2;
    goT = 0;
    hopT = 0;
    sfx('go');
    confettiBurst(particles, (slotX(0) + slotX(count - 1)) / 2, L.rowY, 90, 460);
    services.save.selectProfile(name);
    services.save.save();
  }

  function pickProfile(i: number): void {
    if (leaving) return;
    markActive();
    const p = profiles[i];
    const b = bubbles[i];
    if (!p || !b) return;
    leaving = true;
    leaveT = 0.8;
    hopT = 0;
    bubbleBounce[i] = 0.55;
    sfx('button');
    confettiBurst(particles, b.x, b.y, 60, 380);
    services.save.selectProfile(p.name);
  }

  // ---- Profiles ------------------------------------------------------------
  function buildProfiles(): void {
    profiles = services.save.data.profiles
      .slice()
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, MAX_BUBBLES);
    bubbles = profiles.map((p, i) =>
      createButton({ x: 0, y: 0, radius: 48, fill: accentFor(p.name), icon: avatarSpriteName(p.name), iconScale: 0.82, onPress: () => pickProfile(i) }),
    );
    labels = profiles.map(() => makeOffscreen());
    avatarNames = profiles.map((p) => avatarSpriteName(p.name));
    bubbleBounce.fill(0);
    const avatarMap: Record<string, string> = {};
    for (const p of profiles) avatarMap[avatarSpriteName(p.name)] = services.art(avatarPath(p.name));
    if (profiles.length) void sprites.loadAll(avatarMap).catch(() => undefined);
    buttons = [...keys, backBtn, goBtn, ...bubbles];
  }

  function layoutProfiles(): void {
    const n = bubbles.length;
    if (!n) return;
    const r = L.bubbleR;
    const pitch = r * 2 + Math.max(16, r * 0.4);
    const x0 = L.width / 2 - (pitch * (n - 1)) / 2;
    const measure = labels[0]?.ctx;
    for (let i = 0; i < n; i++) {
      const b = bubbles[i] as Button;
      b.x = x0 + pitch * i;
      b.y = L.bubbleY;
      b.radius = r;
      const o = labels[i] as Offscreen;
      const text = (profiles[i] as Profile).name;
      let size = L.labelSize;
      if (measure) {
        measure.font = `900 ${size}px ${DISPLAY_FONT}`;
        const tw = measure.measureText(text).width + size * 0.3;
        if (tw > pitch - 6) size = Math.max(12, (size * (pitch - 6)) / tw);
      }
      const w = pitch;
      const h = size * 1.5;
      sizeOffscreen(o, w, h, dpr);
      chunkyText(o.ctx, text, w / 2, h / 2, size);
    }
  }

  // ---- Cached drawings -----------------------------------------------------
  function rebuildBackground(): void {
    const w = L.width;
    const h = L.height;
    sizeOffscreen(bg, w, h, dpr);
    const g = bg.ctx;
    const img = sprites.get(BG);
    bgHasArt = !!img;
    if (img) {
      drawCover(g, img, w, h);
    } else {
      // Placeholder meadow: flat sky and two hills.
      g.fillStyle = '#8fd8ff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#86d96a';
      g.beginPath();
      g.ellipse(w * 0.25, h * 1.05, w * 0.6, h * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6cc957';
      g.beginPath();
      g.ellipse(w * 0.85, h * 1.1, w * 0.55, h * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Keyboard plate, static, so it lives in the background cache.
    const pad = L.key * 0.12;
    chunkyPanel(g, L.kbX - 2, L.kbY - 2, L.kbW + 4, L.kbH + 4, CREAM, OUTLINE, L.key * 0.32 + pad, 6);
  }

  function rebuildTray(): void {
    const w = L.trayW + 8;
    const h = L.trayH + 8;
    sizeOffscreen(tray, w, h, dpr);
    const g = tray.ctx;
    chunkyPanel(g, 4, 4, L.trayW, L.trayH, CREAM, OUTLINE, L.trayH * 0.3, 6);
    g.fillStyle = SLOT_DOT;
    for (let i = 0; i < MAX_LETTERS; i++) {
      const cx = 4 + L.trayPad + L.slotPitch * (i + 0.5);
      g.beginPath();
      g.ellipse(cx, 4 + L.trayH / 2, L.panelW * 0.36, L.panelH * 0.14, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  function layoutAll(w: number, h: number): void {
    dpr = services.canvas.dpr;
    computeLayout(w, h, L);
    // Keys.
    const k = L.key;
    const pad = k * 0.12;
    let i = 0;
    for (let row = 0; row < KEY_ROWS.length; row++) {
      const n = KEY_ROWS[row] as number;
      const rowW = n * k + (n - 1) * L.keyGap;
      const x0 = L.kbX + (L.kbW - rowW) / 2 + k / 2;
      const y = L.kbY + pad + k / 2 + row * (k + L.keyGap);
      for (let c = 0; c < n; c++, i++) {
        const b = keys[i] as Button;
        b.x = x0 + c * (k + L.keyGap);
        b.y = y;
        b.radius = k / 2 - 1;
      }
    }
    backBtn.x = L.backX;
    backBtn.y = L.rowY;
    backBtn.radius = L.backR;
    goBtn.x = L.goX;
    goBtn.y = L.rowY;
    goBtn.radius = L.goR;
    layoutProfiles();
    rebuildBackground();
    rebuildTray();
    for (let s = 0; s < count; s++) renderSlotImage(slots[s] as Slot);
    for (const g of ghosts) g.active = false;
    // Sprite sizes changed; drop this scene's scaled copies made for the old layout.
    for (const n of Object.keys(nameEntryArt())) sprites.clearScaled(n);
    for (let g = 0; g < ALPHABET.length; g++) sprites.clearScaled(glyphName(g));
    for (const p of profiles) sprites.clearScaled(avatarSpriteName(p.name));
  }

  // ---- Drawing helpers -----------------------------------------------------
  function drawWithTransform(ctx: CanvasRenderingContext2D, b: Button, rot: number, scale: number, dx: number, dy = 0): void {
    if (rot === 0 && scale === 1 && dx === 0 && dy === 0) {
      b.render(ctx, sprites);
      return;
    }
    ctx.save();
    ctx.translate(b.x + dx, b.y + dy);
    if (rot !== 0) ctx.rotate(rot);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.translate(-b.x, -b.y);
    b.render(ctx, sprites);
    ctx.restore();
  }

  function drawBackFallback(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const s = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x - s * 0.1, y - s * 0.75);
    ctx.lineTo(x - s * 0.1, y - s * 0.32);
    ctx.lineTo(x + s, y - s * 0.32);
    ctx.lineTo(x + s, y + s * 0.32);
    ctx.lineTo(x - s * 0.1, y + s * 0.32);
    ctx.lineTo(x - s * 0.1, y + s * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  function drawPlayFallback(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const s = r * 0.48;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x - s * 0.6, y + s);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  function currentPose(): string {
    if (leaving || cheerT > 0) return MASCOT_CHEER;
    if (missT > 0) return MASCOT_IDLE;
    if (attract) return MASCOT_POINT;
    if (waveT > 0) return MASCOT_WAVE;
    return MASCOT_IDLE;
  }

  /**
   * The mascot stands in the corner and reacts so a child sees it from the
   * corner of the eye: a squash then a stretched bounce on every letter, a big
   * cheering hop on GO, a wave on enter. Every pose is drawn from its feet.
   */
  function drawMascot(ctx: CanvasRenderingContext2D): void {
    const s = L.mascotSize;
    const calm = reducedMotion();
    // Idle: a slow float and breath, under half a cycle per second.
    const breath = calm ? 0 : Math.sin(t * 2.2 + 1.2) * 0.015;
    let lift = calm ? 0 : Math.sin(t * 2.2) * s * 0.012 + s * 0.012;
    let sx = 1 - breath * 0.5;
    let sy = 1 + breath;
    let rot = 0;
    if (hopT >= 0) {
      // GO: crouch, a big stretched hop with arms up, a squashed landing, then a small second hop.
      const h = hopT;
      let dev = 0;
      if (h < 0.1) {
        dev = -0.15 * easeOutCubic(h / 0.1);
      } else if (h < 0.55) {
        const p = (h - 0.1) / 0.45;
        lift += s * 0.2 * 4 * p * (1 - p);
        dev = Math.max(0, 0.35 - 1.75 * (h - 0.1));
      } else if (h < 0.8) {
        dev = -Math.max(0, 0.25 - 1.75 * (h - 0.55));
      } else if (h < 1.15) {
        const p = (h - 0.8) / 0.35;
        lift += s * 0.08 * 4 * p * (1 - p);
      }
      sx *= 1 - dev;
      sy *= 1 + dev;
    } else if (cheerT > 0) {
      // Letter: squash on the key press frame, then a stretched bounce that settles.
      const p = 1 - cheerT / CHEER_SECONDS;
      if (p < 0.15) {
        sx *= 1.16;
        sy *= 0.84;
      } else {
        const q = (p - 0.15) / 0.85;
        const dev = 0.14 * (1 - q) * (1 - q);
        sx *= 1 - dev;
        sy *= 1 + dev;
        lift += pulse(q) * s * 0.08;
      }
    }
    if (missT > 0 && !calm) rot = Math.sin((0.7 - missT) * 9) * 0.16 * (missT / 0.7);
    else if (waveT > 0 && !leaving && !calm) rot = Math.sin((1.6 - waveT) * 6) * 0.06 * (waveT / 1.6);
    const shadowScale = 1 - Math.min(0.4, lift / (s * 0.25));
    groundShadow(ctx, L.mascotX, L.mascotGroundY, s * 0.3 * shadowScale * sx, s * 0.055 * shadowScale, 0.18);
    let pose = currentPose();
    if (!sprites.get(pose)) pose = MASCOT_IDLE;
    if (sprites.get(pose)) {
      const flip = pose === MASCOT_POINT ? POINT_FLIP : 1;
      drawMascotAt(ctx, sprites, pose, pose, L.mascotX, L.mascotGroundY, s, lift, rot, sx * flip, sy);
    } else {
      // Placeholder mascot: a blue blob with eyes.
      const r = s * 0.36;
      ctx.save();
      ctx.translate(L.mascotX, L.mascotGroundY - r - lift);
      ctx.rotate(rot);
      chunkyCircle(ctx, 0, 0, r, '#38b6ff');
      chunkyCircle(ctx, -r * 0.35, -r * 0.15, r * 0.2, '#ffffff', OUTLINE, 4);
      chunkyCircle(ctx, r * 0.35, -r * 0.15, r * 0.2, '#ffffff', OUTLINE, 4);
      ctx.restore();
    }
  }

  // ---- Scene ---------------------------------------------------------------
  const scene: Scene = {
    enter() {
      t = 0;
      count = 0;
      name = '';
      leaving = false;
      leaveT = -1;
      goT = -1;
      hopT = -1;
      cheerT = 0;
      missT = 0;
      waveT = 1.6;
      idleT = 0;
      attract = false;
      attractT = 0;
      trayShakeT = 0;
      goShakeT = 0;
      keyWiggle.fill(0);
      keyFlash.fill(0);
      wasHovered.fill(0);
      for (const s of slots) s.letter = -1;
      for (const g of ghosts) g.active = false;
      particles.clear();
      buildProfiles();
      layoutAll(services.canvas.width, services.canvas.height);
      for (let i = 0; i < keys.length; i++) (keys[i] as Button).popIn(0.15 + i * 0.03);
      backBtn.popIn(0.1);
      goBtn.popIn(0.2);
      for (let i = 0; i < bubbles.length; i++) (bubbles[i] as Button).popIn(0.05 + i * 0.04);
      startMusic(audio, 'name-entry');
      sfx('whoosh');
    },

    /** Covered by the break nudge: keep the typed name, quiet the music. */
    pause() {
      stopMusic(audio);
    },
    resume() {
      startMusic(audio, 'name-entry');
    },
    exit() {
      stopMusic(audio);
    },

    resize(w, h) {
      layoutAll(w, h);
    },

    update(dt) {
      t += dt;
      const p = input.pointer;
      const px = p.inside ? p.x : -1e4;
      const py = p.inside ? p.y : -1e4;

      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i] as Button;
        b.update(dt, px, py);
        const hovered = b.hovered && !leaving ? 1 : 0;
        if (hovered && !wasHovered[i] && t - lastHoverAt > 0.07) {
          lastHoverAt = t;
          sfx('hover', HOVER_OPTS);
        }
        wasHovered[i] = hovered;
      }

      for (let i = 0; i < count; i++) (slots[i] as Slot).age += dt;
      for (const g of ghosts) {
        if (!g.active) continue;
        g.t += dt;
        if (g.t >= GHOST_SECONDS) g.active = false;
      }
      for (let i = 0; i < ALPHABET.length; i++) {
        if (keyWiggle[i]! > 0) keyWiggle[i] = Math.max(0, keyWiggle[i]! - dt);
        if (keyFlash[i]! > 0) keyFlash[i] = Math.max(0, keyFlash[i]! - dt);
      }
      for (let i = 0; i < bubbles.length; i++) {
        if (bubbleBounce[i]! > 0) bubbleBounce[i] = Math.max(0, bubbleBounce[i]! - dt);
        const avatar = avatarNames[i] as string;
        (bubbles[i] as Button).icon = sprites.get(avatar) ? avatar : SILHOUETTE;
      }
      if (cheerT > 0) cheerT = Math.max(0, cheerT - dt);
      if (missT > 0) missT = Math.max(0, missT - dt);
      if (waveT > 0) waveT = Math.max(0, waveT - dt);
      if (trayShakeT > 0) trayShakeT = Math.max(0, trayShakeT - dt);
      if (goShakeT > 0) goShakeT = Math.max(0, goShakeT - dt);
      if (goT >= 0) goT += dt;
      if (hopT >= 0) hopT += dt;

      // Attract: nothing typed and no input for 5 s.
      if (!leaving && count === 0) {
        idleT += dt;
        if (idleT >= 5) {
          if (!attract) {
            attract = true;
            attractT = 0;
          }
          attractT -= dt;
          if (attractT <= 0) {
            attractT = 2;
            keyWiggle[Math.floor(Math.random() * ALPHABET.length)] = 0.8;
          }
        }
      } else if (attract) {
        attract = false;
      }

      if (leaveT > 0) {
        leaveT -= dt;
        if (leaveT <= 0) {
          leaveT = -1;
          services.nav.toHub();
        }
      }

      if (!bgHasArt && sprites.get(BG)) rebuildBackground();
      particles.update(dt);
    },

    render(view: SceneContext) {
      const ctx = view.ctx;
      ctx.drawImage(bg.canvas, 0, 0, bg.w, bg.h);

      const calm = reducedMotion();
      // Profile bubbles and their names, each bobbing slowly on its own phase.
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i] as Button;
        const bt = bubbleBounce[i] as number;
        const scale = bt > 0 ? 1 + 0.28 * pulse(1 - bt / 0.55) : 1;
        const bob = calm ? 0 : Math.cos(t * 1.2 + (i + 7) * 1.5) * 3;
        drawWithTransform(ctx, b, 0, scale, 0, bob);
        const o = labels[i] as Offscreen;
        ctx.drawImage(o.canvas, b.x - o.w / 2, b.y + bob + b.radius * scale - o.h * 0.25, o.w, o.h);
      }

      // Tray and letters.
      const shake = trayShakeT > 0 && !calm ? Math.sin(trayShakeT * 48) * 10 * (trayShakeT / 0.45) : 0;
      ctx.drawImage(tray.canvas, L.trayX - 4 + shake, L.trayY - 4, tray.w, tray.h);
      const pw = L.panelW;
      const ph = L.panelH;
      for (let i = 0; i < count; i++) {
        const s = slots[i] as Slot;
        const x = slotX(i) + shake;
        let y = L.rowY;
        // Slams in at full opacity on the key-press frame, dips on contact and settles.
        const sc = slamScale(s.age / LETTER_SLAM, 0.3, calm);
        if (goT >= 0) y -= pulse(clamp01((goT - i * 0.07) / 0.32)) * ph * 0.45;
        const w = pw * sc;
        const h = ph * sc;
        if (w > 0.5) ctx.drawImage(s.img.canvas, x - w / 2, y - h / 2, w, h);
      }
      for (const g of ghosts) {
        if (!g.active) continue;
        const k = g.t / GHOST_SECONDS;
        const sc = 1 - easeInCubic(k);
        if (sc <= 0.01) continue;
        ctx.save();
        ctx.translate(g.x, g.y + k * k * ph * 1.4);
        ctx.rotate(g.spin * k * 0.6);
        ctx.scale(sc, sc);
        ctx.drawImage(g.img.canvas, -g.img.w / 2, -g.img.h / 2, g.img.w, g.img.h);
        ctx.restore();
      }

      // Backspace and GO.
      backBtn.render(ctx, sprites);
      if (!sprites.get(ICON_BACK) && backBtn.visible) drawBackFallback(ctx, backBtn.x, backBtn.y, backBtn.radius);
      const goIdle = count > 0 && !leaving && !calm;
      const goRot = goIdle ? Math.sin(t * 2.4) * 0.06 : 0;
      const goScale = goIdle ? 1 + Math.sin(t * 4.8) * 0.025 : leaving ? 1.08 : 1;
      const goDx = goShakeT > 0 && !calm ? Math.sin(goShakeT * 46) * 12 * (goShakeT / 0.5) : 0;
      drawWithTransform(ctx, goBtn, goRot, goScale, goDx);
      if (!sprites.get(ICON_GO)) drawPlayFallback(ctx, goBtn.x + goDx, goBtn.y, goBtn.radius);

      // Keyboard: each key bobs a little on its own phase from the moment it pops in.
      for (let i = 0; i < keys.length; i++) {
        const w = keyWiggle[i] as number;
        const f = keyFlash[i] as number;
        const rot = w > 0 && !calm ? Math.sin(w * 22) * 0.22 * (w / 0.8) : 0;
        let press = 1;
        if (f > 0) {
          // Snap down on the press frame, then spring back past 1 and settle.
          const k = 1 - f / KEY_FLASH_SECONDS;
          press = k < 0.15 ? 0.86 : 0.86 + 0.14 * (calm ? easeOutCubic((k - 0.15) / 0.85) : easeOutBack((k - 0.15) / 0.85, 3));
        }
        const scale = (w > 0 ? 1 + 0.12 * pulse(1 - w / 0.8) : 1) * press;
        const bob = calm ? 0 : Math.cos(t * 1.3 + i * 1.5) * 2.2;
        drawWithTransform(ctx, keys[i] as Button, rot, scale, 0, bob);
      }

      drawMascot(ctx);
      particles.render(ctx);
      drawEnterFade(ctx, L.width, L.height, t);
    },

    handleInput(e: SceneInputEvent) {
      if (leaving) return;
      switch (e.type) {
        case 'pointerdown':
          markActive();
          dispatchDown(buttons, e.info.x, e.info.y);
          break;
        case 'pointerup':
          dispatchUp(buttons, e.info.x, e.info.y);
          break;
        case 'keydown': {
          if (e.info.repeat) return;
          markActive();
          const { key, code } = e.info;
          if (code === 'Backspace') backspace();
          else if (code === 'Enter' || code === 'NumpadEnter') go();
          else if (key.length === 1) {
            const c = key.toUpperCase().charCodeAt(0) - 65;
            if (c >= 0 && c < 26) typeLetter(c);
          }
          break;
        }
        default:
          break;
      }
    },
  };

  if (import.meta.env.DEV) {
    const center = (b: Button): { x: number; y: number } => ({ x: b.x, y: b.y });
    const debug: NameEntryDebug = {
      get name() {
        return name;
      },
      get letters() {
        return count;
      },
      get leaving() {
        return leaving;
      },
      get attract() {
        return attract;
      },
      get pose() {
        return currentPose();
      },
      get wide() {
        return L.wide;
      },
      sfx: sfxCounts,
      keyCenter(letter) {
        const i = ALPHABET.indexOf(letter.toUpperCase());
        const b = keys[i];
        return b ? center(b) : undefined;
      },
      goCenter: () => center(goBtn),
      backCenter: () => center(backBtn),
      bubbleCenter(index) {
        const b = bubbles[index];
        return b ? center(b) : undefined;
      },
      art() {
        const names = [...Object.keys(nameEntryArt()), ...profiles.map((p) => avatarSpriteName(p.name))];
        return { loaded: names.filter((n) => sprites.get(n)), missing: names.filter((n) => !sprites.get(n)) };
      },
    };
    (window as unknown as { __nameEntry?: NameEntryDebug }).__nameEntry = debug;
  }

  return scene;
}
