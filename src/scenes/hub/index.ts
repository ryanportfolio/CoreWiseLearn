/**
 * The hub: avatar bubble, sticker-book and sound buttons, one big tile per
 * game, and the mascot. No text except the child's name and the sticker count.
 */

import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { AppServices } from '../../app/services';
import { allGames } from '../../engine/registry';
import { accentFor, avatarPath, avatarSpriteName } from '../../app/avatar';
import { createButton, dispatchDown, dispatchUp, type Button } from '../../ui/button';
import { chunkyCircle, chunkyPanel, drawSprite, groundShadow, OUTLINE, roundedRect } from '../../ui/draw';
import { starPath } from '../../ui/celebrate';
import { approach, arriveAlpha, arriveScale, springStep } from '../../ui/tween';
import { drawEnterFade, reducedMotion } from '../../ui/motion';
import { drawMascotAt } from '../../ui/mascot';
import { playSfx } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import {
  artName,
  artRequest,
  bakeBackground,
  buttonRadius,
  circleTarget,
  createSoundButton,
  drawTextSprite,
  hoverSounds,
  loadAllArt,
  loadArt,
  makeTextSprite,
  rewardsOrUndefined,
  soundArt,
  syncSoundIcon,
  unseenStickers,
  type ArtRequest,
  type LayoutTarget,
  type TextSprite,
} from './shared';

const BG = 'backgrounds/hub-meadow-beach';
const WAVE = 'mascot/wave';
const IDLE = 'mascot/idle';
const POINT = 'mascot/point';
const SILHOUETTE = 'buttons/avatar-silhouette';
const STICKER_STAR = 'buttons/sticker-star';

const TILE_COLORS = ['#4fd1f5', '#ffd23f', '#a78bfa', '#f9a8d4', '#86efac', '#fdba74'] as const;
const MASCOT_BLUE = '#3b9bff';
const WAVE_SECONDS = 1.5;
/** Pop-in length for tiles, the badge and the mascot. */
const POP_SECONDS = 0.4;
/** Tile hover, press and release spring: a small overshoot on release. */
const TILE_OMEGA = 34;
const TILE_ZETA = 0.55;

/** Sprite name for a game's icon. */
export function gameIconName(id: string): string {
  return `game-icon:${id}`;
}

/** URL for a GameDefinition.icon: 'art/...' and '/...' are site-relative, anything else is under the art root. */
export function gameIconUrl(services: AppServices, icon: string): string {
  if (icon.startsWith(services.base)) return icon;
  if (icon.startsWith('art/')) return `${services.base}${icon}`;
  if (icon.startsWith('/')) return `${services.base}${icon.slice(1)}`;
  return services.art(icon);
}

function hubArt(services: AppServices): ArtRequest[] {
  const reqs: ArtRequest[] = [
    artRequest(services, `${BG}.png`, 'none'),
    artRequest(services, `${WAVE}.png`, 'blob', MASCOT_BLUE),
    artRequest(services, `${IDLE}.png`, 'blob', MASCOT_BLUE),
    artRequest(services, `${POINT}.png`, 'blob', MASCOT_BLUE),
    artRequest(services, `${SILHOUETTE}.png`, 'person', '#ffffff'),
    artRequest(services, `${STICKER_STAR}.png`, 'star', '#ffd23f'),
    ...soundArt(services),
  ];
  const profile = services.profile();
  if (profile) reqs.push({ name: avatarSpriteName(profile.name), url: services.art(avatarPath(profile.name)), kind: 'blob', color: accentFor(profile.name) });
  allGames().forEach((g, i) => {
    reqs.push({ name: gameIconName(g.id), url: gameIconUrl(services, g.icon), kind: 'blob', color: TILE_COLORS[(i + 2) % TILE_COLORS.length] ?? '#ffffff' });
  });
  return reqs;
}

/** Load (or finish loading) everything the hub draws. Never rejects; missing files get placeholders. */
export function loadHubAssets(services: AppServices): Promise<void> {
  return loadAllArt(services, hubArt(services));
}

interface Tile {
  /** Game id, or null for the empty-registry placeholder tile. */
  id: string | null;
  iconName: string;
  color: string;
  /** Centre and side length, logical px. */
  x: number;
  y: number;
  size: number;
  /** Springs: [scale, velocity] and [squash, velocity]. */
  scale: Float32Array;
  squash: Float32Array;
  hover: number;
  wobble: number;
  hovered: boolean;
  pressed: boolean;
  pop: number;
  delay: number;
}

export interface HubLayout {
  targets: LayoutTarget[];
}

function fallbackMeadow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#8fd8ff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3cc6e8';
  ctx.fillRect(0, h * 0.42, w * 0.45, h * 0.3);
  ctx.fillStyle = '#7ed957';
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h);
  ctx.quadraticCurveTo(w * 0.35, h * 0.45, w, h * 0.4);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  ctx.quadraticCurveTo(w * 0.25, h * 0.66, w * 0.34, h * 0.8);
  ctx.lineTo(w * 0.3, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5fc443';
  ctx.fillRect(0, h * 0.9, w, h * 0.1);
  chunkyCircle(ctx, w * 0.62, h * 0.12, h * 0.08, '#ffd23f');
}

export function createHubScene(services: AppServices): Scene {
  const { audio, input, nav } = services;

  let width = services.canvas.width;
  let height = services.canvas.height;
  let bg: HTMLCanvasElement | undefined;
  let bgDirty = true;
  let time = 0;
  let mascotT = 0;
  let cooldown = 0;

  // Layout numbers, filled in by layout().
  let margin = 20;
  let mascotSize = 200;
  let mascotX = 0;
  let mascotGround = 0;
  let nameX = 0;
  let nameY = 0;
  let badgeX = 0;
  let badgeY = 0;
  let badgeR = 22;

  let nameSprite: TextSprite | undefined;
  let badgeSprite: TextSprite | undefined;
  let badgeCount = 0;
  let badgePop = 1;
  let badgeDelay = 0;
  let accent = '#e0e7ff';
  let singleGame = false;

  const avatarButton = createButton({
    x: 0,
    y: 0,
    radius: 64,
    fill: accent,
    icon: artName(SILHOUETTE),
    iconScale: 0.8,
    onPress: () => {
      playSfx(audio, 'button');
      nav.toNameEntry();
    },
  });
  // Kept so the idle wobble can be switched on and off: Button reads options.wobble every update.
  const stickerOptions = {
    x: 0,
    y: 0,
    radius: 60,
    fill: '#8b5cf6',
    icon: artName(STICKER_STAR),
    iconScale: 0.64,
    wobble: false,
    onPress: () => {
      playSfx(audio, 'button');
      nav.toStickerBook();
    },
  };
  const stickerButton = createButton(stickerOptions);
  const soundButton = createSoundButton(services);
  const buttons: Button[] = [avatarButton, stickerButton, soundButton];
  const hoverPrev: boolean[] = [false, false, false];

  const tiles: Tile[] = [];
  let pressedTile: Tile | null = null;

  const layoutInfo: HubLayout = { targets: [] };

  function buildTiles(): void {
    tiles.length = 0;
    const games = allGames();
    if (games.length === 0) {
      tiles.push(newTile(null, '', TILE_COLORS[0]));
    } else {
      games.forEach((g, i) => tiles.push(newTile(g.id, artName(gameIconName(g.id)), TILE_COLORS[i % TILE_COLORS.length] ?? '#ffffff')));
    }
    singleGame = games.length === 1;
  }

  function newTile(id: string | null, iconName: string, color: string): Tile {
    return {
      id,
      iconName,
      color,
      x: 0,
      y: 0,
      size: 200,
      scale: new Float32Array([1, 0]),
      squash: new Float32Array([0, 0]),
      hover: 0,
      wobble: 0,
      hovered: false,
      pressed: false,
      pop: 1,
      delay: 0,
    };
  }

  function layout(): void {
    const w = width;
    const h = height;
    margin = Math.max(16, Math.round(h * 0.03));

    const ar = buttonRadius(h, 0.085, 84);
    avatarButton.radius = ar;
    avatarButton.x = margin + ar;
    avatarButton.y = margin + ar;
    nameX = avatarButton.x + ar + 14;
    nameY = avatarButton.y;

    const br = buttonRadius(h, 0.075, 72);
    soundButton.radius = br;
    soundButton.x = w - margin - br;
    soundButton.y = margin + br;
    stickerButton.radius = br;
    stickerButton.x = soundButton.x - br * 2 - margin;
    stickerButton.y = soundButton.y;
    badgeR = Math.max(20, br * 0.36);
    badgeX = stickerButton.x + br * 0.72;
    badgeY = stickerButton.y - br * 0.72;

    // Mascot art fills about 65 percent of its square with the feet near 83 percent down.
    mascotSize = Math.max(150, Math.min(340, h * 0.36));
    mascotX = margin + mascotSize * 0.4;
    mascotGround = h - margin;

    // Tile band between the top buttons and the mascot.
    const bandTop = margin + ar * 2 + h * 0.05;
    const bandBottom = h * 0.76;
    const bandH = Math.max(100, bandBottom - bandTop);
    const bandW = w - margin * 4;
    const n = tiles.length;
    let size: number;
    if (n === 1) {
      size = Math.min(bandH, w * 0.42);
      const t = tiles[0];
      if (t) {
        t.size = Math.max(96, size);
        t.x = w / 2;
        t.y = bandTop + bandH / 2;
      }
    } else {
      const rows = n > 4 ? 2 : 1;
      const cols = Math.ceil(n / rows);
      const gapFrac = 0.14;
      size = Math.min((bandH / rows) / (1 + (rows > 1 ? gapFrac : 0)), bandW / (cols + (cols - 1) * gapFrac));
      size = Math.max(96, Math.min(size, h * 0.36));
      const gap = size * gapFrac;
      const totalH = rows * size + (rows - 1) * gap;
      const top = bandTop + (bandH - totalH) / 2;
      for (let i = 0; i < n; i++) {
        const t = tiles[i];
        if (!t) continue;
        const row = rows === 1 ? 0 : i < cols ? 0 : 1;
        const inRow = rows === 1 ? n : row === 0 ? cols : n - cols;
        const col = row === 0 ? i : i - cols;
        const rowW = inRow * size + (inRow - 1) * gap;
        t.size = size;
        t.x = (w - rowW) / 2 + col * (size + gap) + size / 2;
        t.y = top + row * (size + gap) + size / 2;
      }
    }

    if (import.meta.env.DEV) {
      layoutInfo.targets = [
        circleTarget('avatar', avatarButton),
        circleTarget('sticker-book', stickerButton),
        circleTarget('sound', soundButton),
        ...tiles.map((t, i) => ({ id: `tile:${t.id ?? `placeholder-${i}`}`, x: t.x - t.size / 2, y: t.y - t.size / 2, w: t.size, h: t.size })),
      ];
    }
    bgDirty = true;
  }

  function refreshProfile(): void {
    const profile = services.profile();
    const dpr = services.canvas.dpr;
    if (profile) {
      accent = accentFor(profile.name);
      avatarButton.fill = accent;
      const avatar = avatarSpriteName(profile.name);
      avatarButton.icon = artName(avatar);
      void loadArt(services, { name: avatar, url: services.art(avatarPath(profile.name)), kind: 'blob', color: accent }).then(() => {
        avatarButton.icon = artName(avatar);
      });
      nameSprite = makeTextSprite(profile.name, Math.round(Math.max(34, Math.min(56, height * 0.06))), dpr);
    } else {
      accent = '#c7d2fe';
      avatarButton.fill = accent;
      avatarButton.icon = artName(SILHOUETTE);
      nameSprite = undefined;
    }
    const bag = rewardsOrUndefined(services);
    const count = bag && Array.isArray(bag.stickers) ? bag.stickers.length : 0;
    if (count !== badgeCount || (count > 0 && !badgeSprite)) {
      badgeSprite = count > 0 ? makeTextSprite(String(count), Math.round(badgeR * 1.1), dpr) : undefined;
    }
    badgeCount = count;
    stickerOptions.wobble = unseenStickers(bag).length > 0;
  }

  function bindArt(): void {
    stickerButton.icon = artName(STICKER_STAR);
    syncSoundIcon(soundButton, services);
    for (const t of tiles) if (t.id) t.iconName = artName(gameIconName(t.id));
    refreshProfile();
    bgDirty = true;
  }

  function tileAt(x: number, y: number): Tile | null {
    for (const t of tiles) {
      const half = t.size / 2;
      if (x >= t.x - half && x <= t.x + half && y >= t.y - half && y <= t.y + half) return t;
    }
    return null;
  }

  function activate(t: Tile): void {
    if (cooldown > 0) return;
    cooldown = 0.6;
    playSfx(audio, 'button');
    if (!t.id) {
      t.wobble = 0;
      return;
    }
    playSfx(audio, 'whoosh');
    nav.toGame(t.id);
  }

  function renderTile(ctx: CanvasRenderingContext2D, t: Tile, i: number): void {
    if (t.delay > 0) return;
    const calm = reducedMotion();
    const alpha = arriveAlpha(t.pop);
    if (alpha <= 0) return;
    const s = t.size;
    const base = (t.scale[0] ?? 1) * arriveScale(t.pop, calm);
    const squash = t.squash[0] ?? 0;
    const sx = base * (1 + 0.08 * squash);
    const sy = base * (1 - 0.12 * squash);
    // Idle sway on its own phase, running from the pop-in on; a quicker wobble while hovered.
    const sway = calm ? 0 : Math.cos(time * 1.1 + i * 1.5);
    const rot = calm ? 0 : Math.sin(t.wobble * 9) * 0.045 * t.hover + sway * 0.02;
    const bob = calm ? 0 : Math.cos(time * 1.3 + i * 1.5 + 0.8) * s * 0.012;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(t.x, t.y + bob);
    if (rot !== 0) ctx.rotate(rot);
    ctx.scale(sx, sy);
    const half = s / 2;
    const radius = s * 0.17;
    chunkyPanel(ctx, -half, -half, s, s, t.color, OUTLINE, radius, Math.max(6, s * 0.03));
    // Flat highlight band, the house style's "gloss".
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, -half + s * 0.07, -half + s * 0.06, s * 0.86, s * 0.16, s * 0.08);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (t.id) {
      drawSprite(ctx, services.sprites, t.iconName, 0, 0, s * 0.75);
    } else {
      starPath(ctx, 0, s * 0.03, s * 0.34);
      ctx.fillStyle = '#ffe14d';
      ctx.fill();
      ctx.lineWidth = Math.max(6, s * 0.035);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    ctx.restore();
  }

  buildTiles();
  layout();
  void loadHubAssets(services).then(bindArt);

  const scene: Scene & { layout?: HubLayout } = {
    pause() {
      /* covered by the break nudge: keep music and layout as they are */
    },
    resume() {
      /* nothing to replay when the nudge closes */
    },
    enter() {
      width = services.canvas.width;
      height = services.canvas.height;
      buildTiles();
      layout();
      bindArt();
      void loadHubAssets(services).then(bindArt);
      time = 0;
      mascotT = 0;
      cooldown = 0;
      pressedTile = null;
      avatarButton.popIn(0);
      stickerButton.popIn(0.04);
      soundButton.popIn(0.08);
      badgePop = 0;
      badgeDelay = 0.45;
      tiles.forEach((t, i) => {
        t.pop = 0;
        t.delay = 0.22 + i * 0.04;
        t.scale[0] = 1;
        t.scale[1] = 0;
        t.squash[0] = 0;
        t.squash[1] = 0;
        t.hover = 0;
        t.pressed = false;
      });
      playSfx(audio, 'whoosh');
      startMusic(audio, 'hub');
    },
    exit() {
      stopMusic(audio);
    },
    update(dt) {
      time += dt;
      mascotT += dt;
      if (cooldown > 0) cooldown -= dt;
      const px = input.pointer.x;
      const py = input.pointer.y;
      const inside = input.pointer.inside;
      for (const b of buttons) b.update(dt, inside ? px : -9999, inside ? py : -9999);
      hoverSounds(services, buttons, hoverPrev);
      syncSoundIcon(soundButton, services);
      if (badgeDelay > 0) badgeDelay -= dt;
      else if (badgePop < 1) badgePop = Math.min(1, badgePop + dt / POP_SECONDS);

      for (const t of tiles) {
        if (t.delay > 0) {
          t.delay -= dt;
          continue;
        }
        if (t.pop < 1) t.pop = Math.min(1, t.pop + dt / POP_SECONDS);
        const half = t.size / 2;
        const over = inside && px >= t.x - half && px <= t.x + half && py >= t.y - half && py <= t.y + half;
        if (over && !t.hovered) playSfx(audio, 'hover');
        t.hovered = over;
        t.hover = approach(t.hover, over ? 1 : 0, 10, dt);
        const zeta = reducedMotion() ? 1 : TILE_ZETA;
        springStep(t.scale, over && !t.pressed ? 1.08 : 1, TILE_OMEGA, zeta, dt);
        springStep(t.squash, t.pressed ? 1 : 0, TILE_OMEGA * 1.4, zeta, dt);
        t.wobble += dt;
      }
    },
    render(view: SceneContext) {
      const { ctx } = view;
      if (bgDirty || !bg) {
        bg = bakeBackground(services, BG, width, height, fallbackMeadow, bg);
        bgDirty = false;
      }
      ctx.drawImage(bg, 0, 0, width, height);

      // Mascot behind the tiles: pops in waving, then idle (or point at a lone game). The bob runs
      // from enter so the pose swap does not jump, and every pose is drawn from its feet.
      const calm = reducedMotion();
      const pose = mascotT < WAVE_SECONDS ? WAVE : singleGame ? POINT : IDLE;
      const lift = calm ? 0 : (Math.sin(time * 2.2) + 1) * mascotSize * 0.025;
      const rot = mascotT < WAVE_SECONDS && !calm ? Math.sin(mascotT * 6) * 0.06 * (1 - mascotT / WAVE_SECONDS) : 0;
      const pop = mascotT / POP_SECONDS;
      const ms = arriveScale(pop, calm);
      const malpha = arriveAlpha(pop);
      ctx.globalAlpha = malpha;
      groundShadow(ctx, mascotX, mascotGround, (mascotSize * 0.3 - lift * 0.6) * ms, mascotSize * 0.055 * ms, 0.2 * malpha);
      drawMascotAt(ctx, services.sprites, artName(pose), pose, mascotX, mascotGround, mascotSize, lift, rot, ms, ms);
      ctx.globalAlpha = 1;

      for (let i = 0; i < tiles.length; i++) renderTile(ctx, tiles[i] as Tile, i);

      for (const b of buttons) b.render(ctx, services.sprites);
      if (nameSprite) drawTextSprite(ctx, nameSprite, nameX, nameY, 'left');
      if (badgeSprite && badgeCount > 0 && badgeDelay <= 0) {
        const s = arriveScale(badgePop, reducedMotion());
        const a = arriveAlpha(badgePop);
        if (a > 0) {
          ctx.save();
          if (a < 1) ctx.globalAlpha = a;
          ctx.translate(badgeX, badgeY);
          ctx.scale(s, s);
          chunkyCircle(ctx, 0, 0, badgeR, '#ef4444', OUTLINE, 5);
          const k = Math.min(1, (badgeR * 1.7) / badgeSprite.w);
          ctx.drawImage(badgeSprite.canvas, (-badgeSprite.w * k) / 2, (-badgeSprite.h * k) / 2, badgeSprite.w * k, badgeSprite.h * k);
          ctx.restore();
        }
      }
      drawEnterFade(ctx, width, height, time);
    },
    handleInput(event: SceneInputEvent) {
      if (event.type === 'pointerdown') {
        const { x, y } = event.info;
        if (dispatchDown(buttons, x, y)) return;
        const t = tileAt(x, y);
        if (t && t.delay <= 0) {
          t.pressed = true;
          pressedTile = t;
        }
      } else if (event.type === 'pointerup') {
        const { x, y } = event.info;
        dispatchUp(buttons, x, y);
        const t = pressedTile;
        if (t) {
          pressedTile = null;
          t.pressed = false;
          if (tileAt(x, y) === t) activate(t);
        }
      }
    },
    resize(w: number, h: number) {
      width = w;
      height = h;
      layout();
      refreshProfile();
    },
  };
  if (import.meta.env.DEV) scene.layout = layoutInfo;
  return scene;
}
