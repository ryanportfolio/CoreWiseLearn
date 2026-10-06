/**
 * The hub: avatar bubble, sticker-book and sound buttons, one big tile per
 * game, and the mascot. No text except the child's name and the sticker count.
 */

import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import type { AppServices } from '../../app/services';
import { allGames } from '../../engine/registry';
import { accentFor, avatarPath, avatarSpriteName } from '../../app/avatar';
import { createKeyboardNavigation } from '../../ui/navigation';
import { createButton, dispatchDown, dispatchUp, MIN_HIT, type Button } from '../../ui/button';
import { chunkyCircle, chunkyPanel, drawSprite, groundShadow, OUTLINE, roundedRect } from '../../ui/draw';
import { starPath } from '../../ui/celebrate';
import { approach, arriveAlpha, arriveScale, springStep } from '../../ui/tween';
import { drawEnterFade } from '../../ui/motion';
import { createMascotMotion, drawMascotMoving, loadMascotMouths, pokeMascot, resetMascotMotion, stepMascotMotion } from '../../ui/mascot';
import { WIBBLE, greetedThisSession, hasGameName, markGreeted, sayCommentary, sayGameName, sayTickle, wibbleVoice } from '../../ui/wibble';
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
/** Space between neighbouring buttons in the top row, px. */
const TOP_GAP = 12;
/** Smallest avatar and sound button radius, buttonRadius's floor: over 96 px across. */
const MIN_RADIUS = 52;
/** Space between neighbouring tiles, as a fraction of the tile side. */
const TILE_GAP = 0.14;
/**
 * Mascot size limits, px, and the number of steps the tile layout may shrink it in between.
 * Its full size is MASCOT_SHARE of the window height, within these limits.
 */
const MASCOT_MIN = 150;
const MASCOT_MAX = 420;
const MASCOT_SHARE = 0.42;
const MASCOT_STEPS = 16;
/**
 * Where the mascot's art can appear, as fractions of its size from its feet (mascotX,
 * mascotGround). The idle, wave and point art spans 0.10 to 0.90 of its square across and
 * 0.17 to 0.83 down; this adds the feet offsets, the 5 percent bob, the wave's tilt and the
 * pop-in overshoot. Tiles keep out of this box. Talking and a poke's hop can reach above it for
 * a moment; the mascot is drawn behind the tiles.
 */
const MASCOT_BOX = { left: -0.45, right: 0.47, top: -0.73, bottom: 0.03 } as const;
/**
 * Wibble's press area, an ellipse over its body: centred BODY_Y of its size above the feet,
 * with half-axes BODY_RX across and BODY_RY down, each at least MIN_HIT (96 px across).
 * At MASCOT_MIN that is 120 by 99 px.
 */
const BODY_Y = 0.33;
const BODY_RX = 0.4;
const BODY_RY = 0.33;
/** Seconds a tile must hold the pointer or keyboard focus before Wibble says the game's name. */
const NAME_DWELL = 0.4;
/** Seconds into a visit before Wibble's hello or welcome-back line. */
const LINE_DELAY = 0.6;
/** Chance of a welcome-back line when the child comes back from a game. */
const BACK_CHANCE = 1 / 3;

/**
 * The game the hub last launched, until the hub is left some other way. Every
 * route out of a game leads back to a new hub, which starts its keyboard focus
 * on this game's tile. Module state, because each visit builds a new hub scene.
 */
let launchedGame: string | null = null;

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
    artRequest(services, `${BG}.webp`, 'none'),
    artRequest(services, `${WAVE}.webp`, 'blob', MASCOT_BLUE),
    artRequest(services, `${IDLE}.webp`, 'blob', MASCOT_BLUE),
    artRequest(services, `${POINT}.webp`, 'blob', MASCOT_BLUE),
    artRequest(services, `${SILHOUETTE}.webp`, 'person', '#ffffff'),
    artRequest(services, `${STICKER_STAR}.webp`, 'star', '#ffd23f'),
    ...soundArt(services),
  ];
  const profile = services.profile();
  if (profile) reqs.push({ name: avatarSpriteName(profile), url: services.art(avatarPath(profile)), kind: 'blob', color: accentFor(profile) });
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
  /** Id of the control holding keyboard focus (`tile:<game id>` for a tile). */
  focus?: () => string | undefined;
  /** Box the mascot's art can reach, which tiles keep out of. */
  mascot?: LayoutTarget;
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
  /** Widest the name may draw before it reaches the book button; wider names shrink to fit. */
  let nameMaxW = Infinity;
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

  const voice = wibbleVoice(services);
  const motion = createMascotMotion();
  /** The hello or welcome-back line due this visit, if any; it plays LINE_DELAY seconds in. */
  let lineDue: '' | 'hello' | 'back' = '';
  /** The tile the child is on (by pointer or keyboard), for how long, and the tile whose name was said. */
  let dwellTile: Tile | null = null;
  let dwell = 0;
  let namedTile: Tile | null = null;
  /** The pointer moved, or a key was pressed, during this visit; the later of the two decides which tile counts. */
  let pointerMoved = false;
  let keyUsed = false;
  let lastByKey = false;

  const avatarButton = createButton({
    x: 0,
    y: 0,
    radius: 64,
    fill: accent,
    icon: artName(SILHOUETTE),
    iconScale: 0.8,
    onPress: () => {
      if (cooldown > 0) return; cooldown = 0.6;
      launchedGame = null;
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
      if (cooldown > 0) return; cooldown = 0.6;
      launchedGame = null;
      playSfx(audio, 'button');
      nav.toStickerBook();
    },
  };
  const stickerButton = createButton(stickerOptions);
  const soundButton = createSoundButton(services);
  const renameButton = createButton({ x: 0, y: 0, radius: 48, fill: '#ffd23f', onPress: () => { if (cooldown > 0) return; const profile = services.profile(); if (profile) { cooldown = 0.6; launchedGame = null; nav.toNameEntry(profile.id); } } });
  const buttons: Button[] = [avatarButton, renameButton, stickerButton, soundButton];
  // Wibble joins the keyboard order as one more control, so any activating key pokes it. The scene
  // draws it (not as a round button) and its press area is the ellipse over its body.
  const wibbleButton = createButton({ x: 0, y: 0, radius: MIN_HIT, fill: '', onPress: poke });
  wibbleButton.contains = (px, py) => {
    const dx = (px - mascotX) / Math.max(MIN_HIT, mascotSize * BODY_RX);
    const dy = (py - (mascotGround - mascotSize * BODY_Y)) / Math.max(MIN_HIT, mascotSize * BODY_RY);
    return dx * dx + dy * dy <= 1;
  };
  const hoverPrev: boolean[] = [false, false, false];

  const tiles: Tile[] = [];
  const tileButtons: Button[] = [];
  const keyboard = createKeyboardNavigation(() => [...tileButtons, ...buttons, wibbleButton], { anyKey: true, input });

  /** Wibble jiggles (with the sound off too) and, unless it is already talking, says a ticklish line. */
  function poke(): void {
    pokeMascot(motion);
    sayTickle(services);
  }

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
    tileButtons.length = 0;
    for (const tile of tiles) tileButtons.push(createButton({ x: 0, y: 0, radius: 48, fill: tile.color, onPress: () => activate(tile) }));
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

  function setMascot(size: number): void {
    mascotSize = size;
    mascotX = margin + size * 0.4;
    mascotGround = height - margin;
    // Keyboard arrows aim at the middle of the body.
    wibbleButton.x = mascotX;
    wibbleButton.y = mascotGround - size * BODY_Y;
  }

  /** Lay tiles out in `rows` rows of the same width, the last row centred or, with `alignLast`, flush right. */
  function placeGrid(rows: number, size: number, cx: number, top: number, alignLast: boolean): void {
    const n = tiles.length;
    const cols = Math.ceil(n / rows);
    const gap = size * TILE_GAP;
    const gridW = cols * size + (cols - 1) * gap;
    for (let i = 0; i < n; i++) {
      const t = tiles[i];
      if (!t) continue;
      const row = Math.floor(i / cols);
      const col = i - row * cols;
      const inRow = Math.min(cols, n - row * cols);
      const rowW = inRow * size + (inRow - 1) * gap;
      const rowLeft = alignLast ? cx + gridW / 2 - rowW : cx - rowW / 2;
      t.size = size;
      t.x = rowLeft + col * (size + gap) + size / 2;
      t.y = top + row * (size + gap) + size / 2;
    }
  }

  function overlaps(t: Tile, x0: number, y0: number, x1: number, y1: number): boolean {
    const half = t.size / 2;
    return t.x + half > x0 && t.x - half < x1 && t.y + half > y0 && t.y - half < y1;
  }

  /** Every tile is on screen and clear of the top buttons' press areas and the mascot's art. */
  function tilesFit(): boolean {
    const s = mascotSize;
    for (const t of tiles) {
      const half = t.size / 2;
      if (t.x - half < 0 || t.y - half < 0 || t.x + half > width || t.y + half > height) return false;
      if (overlaps(t, mascotX + MASCOT_BOX.left * s, mascotGround + MASCOT_BOX.top * s, mascotX + MASCOT_BOX.right * s, mascotGround + MASCOT_BOX.bottom * s)) return false;
      for (const b of buttons) {
        const r = Math.max(b.radius, MIN_HIT);
        if (overlaps(t, b.x - r, b.y - r, b.x + r, b.y + r)) return false;
      }
    }
    return true;
  }

  /**
   * Try one grid at one tile size: placement 0 centres it above the mascot; 1 and 2 use the
   * height down to the bottom margin (centred, or from the top) with the last row flush right
   * and the grid nudged right, so the mascot can stand beside a short last row.
   */
  function tryGrid(rows: number, size: number, top: number, placement: number): boolean {
    const n = tiles.length;
    const cols = Math.ceil(n / rows);
    const gap = size * TILE_GAP;
    const gridW = cols * size + (cols - 1) * gap;
    const gridH = rows * size + (rows - 1) * gap;
    const bottom = height - margin;
    if (gridW > width - 2 * margin) return false;
    let cx = width / 2;
    if (placement === 0) {
      const above = Math.min(bottom, mascotGround + MASCOT_BOX.top * mascotSize - gap);
      if (gridH > above - top) return false;
      placeGrid(rows, size, cx, top + (above - top - gridH) / 2, false);
      return tilesFit();
    }
    if (gridH > bottom - top) return false;
    const lastW = (n - (rows - 1) * cols) * (size + gap) - gap;
    const clearX = mascotX + MASCOT_BOX.right * mascotSize + gap;
    cx += Math.max(0, Math.min(clearX - (cx + gridW / 2 - lastW), width - margin - (cx + gridW / 2)));
    placeGrid(rows, size, cx, placement === 1 ? top + (bottom - top - gridH) / 2 : top, true);
    return tilesFit();
  }

  /**
   * Fallback when the usual layout does not fit (narrow or short windows, or many tiles):
   * for each mascot size from full down to MASCOT_MIN, find the largest tiles over every row
   * count (fewer rows win a tie), then keep the biggest mascot whose tiles are within 8 percent
   * of the largest found. Runs on resize only.
   */
  function placeTiles(top: number, fullMascot: number): void {
    const n = tiles.length;
    const found: { mascot: number; size: number; rows: number; placement: number }[] = [];
    let bestSize = 0;
    for (let k = 0; k <= MASCOT_STEPS; k++) {
      const mascot = fullMascot - ((fullMascot - MASCOT_MIN) * k) / MASCOT_STEPS;
      setMascot(mascot);
      let size = 0;
      let rows = 1;
      let placement = 0;
      for (let r = 1; r <= n; r++) {
        const cols = Math.ceil(n / r);
        if (Math.ceil(n / cols) !== r) continue;
        // From the largest size the space allows, down in 2 percent steps to 96 px.
        let s = Math.min((height - margin - top) / (r + (r - 1) * TILE_GAP), (width - 2 * margin) / (cols + (cols - 1) * TILE_GAP), height * 0.36);
        for (; s >= 96 && s > size; s *= 0.98) {
          let p = 0;
          while (p < 3 && !tryGrid(r, s, top, p)) p++;
          if (p < 3) { size = s; rows = r; placement = p; break; }
        }
      }
      found.push({ mascot, size, rows, placement });
      bestSize = Math.max(bestSize, size);
    }
    const pick = found.find((f) => f.size >= 96 && f.size >= bestSize * 0.92);
    if (pick) {
      setMascot(pick.mascot);
      tryGrid(pick.rows, pick.size, top, pick.placement);
      return;
    }
    // Nothing fits (a window far smaller than 390x600): as many 96 px columns as fit across.
    setMascot(MASCOT_MIN);
    const cols = Math.max(1, Math.floor((width - 2 * margin + 96 * TILE_GAP) / (96 * (1 + TILE_GAP))));
    placeGrid(Math.ceil(n / cols), 96, width / 2, top, false);
  }

  function layout(): void {
    const w = width;
    const h = height;
    margin = Math.max(16, Math.round(h * 0.03));

    let ar = buttonRadius(h, 0.085 * services.config.uiScale, 84);
    let br = buttonRadius(h, 0.075 * services.config.uiScale, 72);
    // The top row holds the avatar, the pencil and the sound button side by side. Where it
    // is too narrow for them (a tall, narrow window), the margin shrinks first, then the
    // avatar and sound buttons, never under MIN_RADIUS, so no two buttons overlap.
    const rowFixed = TOP_GAP + renameButton.radius * 2 + TOP_GAP;
    const spare = w - 2 * margin - 2 * ar - 2 * br - rowFixed;
    if (spare < 0) {
      margin = Math.max(16, margin + spare / 2);
      const target = Math.max(MIN_RADIUS * 2, (w - 2 * margin - rowFixed) / 2);
      if (ar + br > target) {
        br = Math.max(MIN_RADIUS, br - (ar + br - target) / 2);
        ar = Math.max(MIN_RADIUS, target - br);
      }
    }
    avatarButton.radius = ar;
    avatarButton.x = margin + ar;
    avatarButton.y = margin + ar;
    renameButton.x = avatarButton.x + ar + TOP_GAP + renameButton.radius; renameButton.y = avatarButton.y;
    nameX = renameButton.x + 62;
    nameY = avatarButton.y;

    soundButton.radius = br;
    soundButton.x = w - margin - br;
    soundButton.y = margin + br;
    stickerButton.radius = br;
    stickerButton.x = soundButton.x - br * 2 - margin;
    stickerButton.y = soundButton.y;
    // Too narrow for one row (390 px wide, for example): the book button moves under the sound button.
    const twoRows = renameButton.x + renameButton.radius + margin > stickerButton.x - br;
    if (twoRows) {
      stickerButton.x = soundButton.x;
      stickerButton.y = soundButton.y + br * 2 + margin;
    }
    badgeR = Math.max(20, br * 0.36);
    badgeX = stickerButton.x + br * 0.72;
    badgeY = stickerButton.y - br * 0.72;

    // Tile band between the top buttons and the mascot.
    let bandTop = margin + ar * 2 + h * 0.05 + (w < 1000 ? 50 : 0);
    if (twoRows) bandTop = Math.max(bandTop, stickerButton.y + br + margin);
    const n = tiles.length;
    const fullMascot = Math.max(MASCOT_MIN, Math.min(MASCOT_MAX, h * MASCOT_SHARE));
    setMascot(fullMascot);

    // First the usual layout: one row up to four tiles, two rows above that, in a band that
    // ends at 76 percent of the height. It stays whenever its tiles are at least 96 px, on
    // screen and clear of the buttons and the mascot (every window from 800x600 up with up to
    // seven tiles). Otherwise placeTiles searches rows, sizes and mascot sizes for what fits.
    const bandBottom = h * 0.76;
    const bandH = Math.max(100, bandBottom - bandTop);
    const bandW = w - margin * 4;
    if (n === 1) {
      const size = Math.min(bandH, w * 0.42);
      placeGrid(1, size, w / 2, bandTop + (bandH - size) / 2, false);
      if (size < 96 || !tilesFit()) placeTiles(bandTop, fullMascot);
    } else {
      const rows = n > 4 ? 2 : 1;
      const cols = Math.ceil(n / rows);
      let size = Math.min((bandH / rows) / (1 + (rows > 1 ? TILE_GAP : 0)), bandW / (cols + (cols - 1) * TILE_GAP));
      size = Math.min(size, h * 0.36);
      const totalH = rows * size + (rows - 1) * size * TILE_GAP;
      placeGrid(rows, size, w / 2, bandTop + (bandH - totalH) / 2, false);
      if (size < 96 || !tilesFit()) placeTiles(bandTop, fullMascot);
    }

    tiles.forEach((t, i) => { const b = tileButtons[i]!; b.x = t.x; b.y = t.y; b.radius = t.size / 2; });
    if (w < 1000) { nameX = margin; nameY = avatarButton.y + ar + 30; }
    nameMaxW = twoRows ? stickerButton.x - br * 1.1 - margin - nameX : Infinity;
    if (import.meta.env.DEV) {
      layoutInfo.targets = [
        circleTarget('avatar', avatarButton),
        circleTarget('rename', renameButton),
        circleTarget('sticker-book', stickerButton),
        circleTarget('sound', soundButton),
        {
          id: 'wibble',
          x: mascotX - Math.max(MIN_HIT, mascotSize * BODY_RX),
          y: mascotGround - mascotSize * BODY_Y - Math.max(MIN_HIT, mascotSize * BODY_RY),
          w: 2 * Math.max(MIN_HIT, mascotSize * BODY_RX),
          h: 2 * Math.max(MIN_HIT, mascotSize * BODY_RY),
        },
        ...tiles.map((t, i) => ({ id: `tile:${t.id ?? `placeholder-${i}`}`, x: t.x - t.size / 2, y: t.y - t.size / 2, w: t.size, h: t.size })),
      ];
      const ms = mascotSize;
      layoutInfo.mascot = { id: 'mascot', x: mascotX + MASCOT_BOX.left * ms, y: mascotGround + MASCOT_BOX.top * ms, w: (MASCOT_BOX.right - MASCOT_BOX.left) * ms, h: (MASCOT_BOX.bottom - MASCOT_BOX.top) * ms };
    }
    bgDirty = true;
  }

  function refreshProfile(): void {
    const profile = services.profile();
    const dpr = services.canvas.dpr;
    if (profile) {
      accent = accentFor(profile);
      avatarButton.fill = accent;
      const avatar = avatarSpriteName(profile);
      avatarButton.icon = artName(avatar);
      void loadArt(services, { name: avatar, url: services.art(avatarPath(profile)), kind: 'blob', color: accent }).then(() => {
        avatarButton.icon = artName(avatar);
      });
      nameSprite = profile.unnamed ? undefined : makeTextSprite(profile.name, Math.round(Math.max(34, Math.min(56, height * 0.06))), dpr);
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
    launchedGame = t.id;
    nav.toGame(t.id);
  }

  /**
   * When the child stays on a tile for NAME_DWELL seconds, by pointer or keyboard (whichever was
   * used last), Wibble says the game's name once. Moving away first cancels it; coming back says it
   * again. The keyboard's starting focus does not count until a key is pressed.
   */
  function updateTileNames(dt: number): void {
    let on: Tile | null = null;
    if (!lastByKey && pointerMoved) {
      for (const t of tiles) if (t.hovered) { on = t; break; }
    } else if (lastByKey && keyUsed) {
      for (let i = 0; i < tiles.length; i++) if (tileButtons[i]?.focused) { on = tiles[i] ?? null; break; }
    }
    if (on !== dwellTile) {
      dwellTile = on;
      dwell = 0;
      namedTile = null;
    }
    if (!on || on === namedTile || !on.id || !hasGameName(on.id)) return;
    dwell += dt;
    if (dwell >= NAME_DWELL) {
      namedTile = on;
      sayGameName(services, on.id);
    }
  }

  function renderTile(ctx: CanvasRenderingContext2D, t: Tile, i: number): void {
    if (t.delay > 0) return;
    const alpha = arriveAlpha(t.pop);
    if (alpha <= 0) return;
    const s = t.size;
    const base = (t.scale[0] ?? 1) * arriveScale(t.pop);
    const squash = t.squash[0] ?? 0;
    const sx = base * (1 + 0.08 * squash);
    const sy = base * (1 - 0.12 * squash);
    // Idle sway on its own phase, running from the pop-in on; a quicker wobble while hovered.
    const sway = Math.cos(time * 1.1 + i * 1.5);
    const rot = Math.sin(t.wobble * 9) * 0.045 * t.hover + sway * 0.02;
    const bob = Math.cos(time * 1.3 + i * 1.5 + 0.8) * s * 0.012;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(t.x, t.y + bob);
    if (rot !== 0) ctx.rotate(rot);
    ctx.scale(sx, sy);
    const half = s / 2;
    const radius = s * 0.17;
    chunkyPanel(ctx, -half, -half, s, s, t.color, OUTLINE, radius, Math.max(6, s * 0.03));
    if (tileButtons[i]?.focused || t.hovered) { ctx.strokeStyle = '#fff8b2'; ctx.lineWidth = 7; roundedRect(ctx, -half + 10, -half + 10, s - 20, s - 20, radius); ctx.stroke(); }
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
      // Covered by the break nudge: music and layout stay; Wibble goes quiet, as the nudge speaks.
      voice.stop();
      lineDue = '';
      dwellTile = namedTile = null;
    },
    resume() {
      cooldown = 0.4;
      // Drops a modifier pressed before the nudge covered the hub.
      keyboard.focus(keyboard.selected);
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
      cooldown = 0.4;
      resetMascotMotion(motion);
      voice.preload(WIBBLE);
      void loadMascotMouths(services, [WAVE, IDLE, POINT]);
      // Hello once a page session, unless name entry already greeted; back from a game, now and then a welcome-back line.
      lineDue = !greetedThisSession() ? 'hello' : launchedGame !== null && services.random() < BACK_CHANCE ? 'back' : '';
      markGreeted();
      dwellTile = namedTile = null;
      dwell = 0;
      pointerMoved = keyUsed = lastByKey = false;
      // Back from a game, focus waits on that game's tile; otherwise on the first tile.
      const returned = launchedGame === null ? -1 : tiles.findIndex((t) => t.id === launchedGame);
      launchedGame = null;
      keyboard.focus(tileButtons[returned] ?? tileButtons[0] ?? avatarButton);
      avatarButton.popIn(0);
      renameButton.popIn(0.02);
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
      // Nothing plays as the child leaves.
      voice.stop();
      lineDue = '';
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
        const focused = tileButtons[tiles.indexOf(t)]?.focused ?? false;
        t.hover = approach(t.hover, over || focused ? 1 : 0, 10, dt);
        springStep(t.scale, (over || focused) && !t.pressed ? 1.08 : 1, TILE_OMEGA, TILE_ZETA, dt);
        springStep(t.squash, t.pressed ? 1 : 0, TILE_OMEGA * 1.4, TILE_ZETA, dt);
        t.wobble += dt;
      }

      wibbleButton.update(dt, inside ? px : -9999, inside ? py : -9999);
      // A line waits for audio to unlock (the first click or key); with the sound off it is dropped.
      if (lineDue && time >= LINE_DELAY && audio.state !== 'waiting') {
        sayCommentary(services, lineDue);
        lineDue = '';
      }
      updateTileNames(dt);
      stepMascotMotion(motion, dt, voice.isSpeaking(), voice.speakingLevel());
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
      const pose = mascotT < WAVE_SECONDS ? WAVE : singleGame ? POINT : IDLE;
      const lift = (Math.sin(time * 2.2) + 1) * mascotSize * 0.025;
      const rot = mascotT < WAVE_SECONDS ? Math.sin(mascotT * 6) * 0.06 * (1 - mascotT / WAVE_SECONDS) : 0;
      const pop = mascotT / POP_SECONDS;
      const ms = arriveScale(pop);
      const malpha = arriveAlpha(pop);
      ctx.globalAlpha = malpha;
      groundShadow(ctx, mascotX, mascotGround, (mascotSize * 0.3 - lift * 0.6) * ms, mascotSize * 0.055 * ms, 0.2 * malpha);
      if (wibbleButton.focused || wibbleButton.hovered) {
        // Focus or hover shows as a ring on the ground around Wibble's feet, the colour of a button's ring.
        ctx.beginPath();
        ctx.ellipse(mascotX, mascotGround, mascotSize * 0.38 * ms, mascotSize * 0.075 * ms, 0, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#fff8b2';
        ctx.stroke();
      }
      drawMascotMoving(ctx, services.sprites, motion, artName(pose), pose, mascotX, mascotGround, mascotSize, lift, rot, ms, ms);
      ctx.globalAlpha = 1;

      for (let i = 0; i < tiles.length; i++) renderTile(ctx, tiles[i] as Tile, i);

      for (const b of buttons) b.render(ctx, services.sprites);
      ctx.save(); ctx.translate(renameButton.x, renameButton.y); ctx.rotate(-Math.PI / 4);
      chunkyPanel(ctx, -10, -26, 20, 45, '#fff4dc', OUTLINE, 4, 4);
      ctx.beginPath(); ctx.moveTo(-10, 19); ctx.lineTo(0, 34); ctx.lineTo(10, 19); ctx.closePath(); ctx.fillStyle = OUTLINE; ctx.fill(); ctx.restore();
      if (nameSprite) {
        if (nameSprite.w <= nameMaxW) drawTextSprite(ctx, nameSprite, nameX, nameY, 'left');
        else {
          const k = nameMaxW / nameSprite.w;
          ctx.drawImage(nameSprite.canvas, nameX, nameY - (nameSprite.h * k) / 2, nameSprite.w * k, nameSprite.h * k);
        }
      }
      if (badgeSprite && badgeCount > 0 && badgeDelay <= 0) {
        const s = arriveScale(badgePop);
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
      if (cooldown > 0) return;
      if (event.type === 'pointerdown') {
        if (dispatchDown(buttons, event.info.x, event.info.y)) return;
        const tile = tileAt(event.info.x, event.info.y);
        if (tile) activate(tile);
        else wibbleButton.pointerDown(event.info.x, event.info.y);
      } else if (event.type === 'pointerup') {
        dispatchUp(buttons, event.info.x, event.info.y);
        wibbleButton.pointerUp(event.info.x, event.info.y);
      } else if (event.type === 'pointermove') {
        pointerMoved = true;
        lastByKey = false;
      } else if (event.type === 'keydown' && !event.info.repeat) {
        keyUsed = lastByKey = true;
        keyboard.key(event.info.key);
      } else if (event.type === 'keyup') {
        keyboard.keyUp(event.info.key);
      }
    },
    resize(w: number, h: number) {
      width = w;
      height = h;
      layout();
      refreshProfile();
    },
    // Tiles are not drawn as Buttons, so they report here; the top-row Buttons report themselves.
    // The tile's lift, glow ring and wobble on hover already run in update and renderTile.
    hoverAt(x: number, y: number) {
      if (cooldown > 0) return null;
      return tileAt(x, y) ? 'press' : null;
    },
  };
  if (import.meta.env.DEV) {
    layoutInfo.focus = () => {
      const i = tileButtons.findIndex((b) => b.focused);
      if (i >= 0) return `tile:${tiles[i]?.id ?? 'placeholder'}`;
      if (wibbleButton.focused) return 'wibble';
      return ['avatar', 'rename', 'sticker-book', 'sound'][buttons.findIndex((b) => b.focused)];
    };
    scene.layout = layoutInfo;
  }
  return scene;
}
