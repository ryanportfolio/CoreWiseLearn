/**
 * Shape Workshop: fit paper shapes into a picture's outline; the finished
 * picture comes alive and goes onto the child's gallery shelf. A free-build
 * sheet stamps shapes anywhere. Creative play: nothing to score, everything saved.
 */

import type { AppServices } from '../../app/services';
import type { Scene, SceneContext, SceneInputEvent } from '../../engine/scene';
import { playSfx, type SfxName, type SfxOptions, type SfxVariant } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { createButton, type Button } from '../../ui/button';
import { OUTLINE, drawSprite } from '../../ui/draw';
import { drawEnterFade } from '../../ui/motion';
import { approach, clamp01, easeInOutSine, easeOutCubic, lerp, pulse, slamScale } from '../../ui/tween';
import { artName, artRequest, bakeBackground, createSoundButton, loadAllArt, soundArt, syncSoundIcon } from '../../scenes/hub/shared';
import { PAPER, SHAPES, SWATCHES, TRAY_ASPECT, bakeShape, drawBaked, paintShape, setGrain, tracePath, type Baked, type Shape } from './paper';
import { ALIVE_SECONDS, PICTURES, PICTURE_IDS, partPose, picturePose, pictureById, resetPose, shelfPose, type Face, type Part, type Picture, type PictureId, type Pose } from './pictures';
import { FX_BUBBLE, FX_PUFF, createFx } from './fx';
import { MAX_STAMPS, SHEET_COUNT, STAMP_STRIDE, defaults, sanitize, type Wip, type WorkshopData } from './save';
import { sayShape } from './voice';

export const GAME_ID = 'shape-workshop';
const ART = {
  wall: 'shape-workshop/workshop-wall.webp', grain: 'shape-workshop/paper-grain.webp', hand: 'shape-workshop/hand.webp',
  gallery: 'shape-workshop/gallery.webp', brush: 'shape-workshop/brush.webp', home: 'buttons/home.png',
};
const sprite = (path: string): string => path.replace(/\.[a-z0-9]+$/i, '');
const WALL = sprite(ART.wall), HAND = sprite(ART.hand);

/** Hidden motor tiers: open pieces, picture scale on the sheet, snap reach. */
export const TIERS = [
  { pieces: 3, scale: 1, snap: 1.5, snapMin: 90 },
  { pieces: 5, scale: 0.95, snap: 1.25, snapMin: 75 },
  { pieces: 8, scale: 0.9, snap: 1.1, snapMin: 64 },
] as const;
const GUARD_MS = 320, HINT_IDLE = 9, HINT_REPEAT = 12, ASSIST_SECONDS = 8, LAND_SECONDS = 0.45, FLY_SECONDS = 0.3;
const DONE_SECONDS = 1.1, SEND_SECONDS = 0.85, DEAL_SECONDS = 0.55;
const SHEET_ASPECT = 4 / 3, STAMP_REF = 150, LIVE_STAMPS = 10;
const FRAME_COLORS = [1, 6, 4, 3, 5, 0];

type Mode = 'build' | 'free' | 'gallery';
type Phase = 'deal' | 'play' | 'done' | 'alive' | 'send';
type PieceState = 'tray' | 'held' | 'fly' | 'back' | 'nope' | 'gone';

interface Spot {
  part: Part; open: boolean; placed: boolean; reserved: boolean;
  /** The earlier part this one is glued onto, or -1. It waits off the sheet until that part is in. */
  base: number;
  x: number; y: number; w: number; h: number; rot: number;
  hit: number; reach: number; land: number; baked: Baked | undefined;
}
interface Piece {
  shape: Shape; color: number; extra: boolean; cell: number;
  x: number; y: number; hx: number; hy: number; w: number; h: number;
  state: PieceState; t: number; fromX: number; fromY: number; target: number;
  tried: boolean; drag: boolean; selected: boolean; baked: Baked | undefined;
}
interface Stamp { active: boolean; shape: number; color: number; x: number; y: number; size: number; rot: number; t: number }

/** How a placement was made; only POINTER counts as evidence. */
const HOW_POINTER = 0, HOW_KEY = 1, HOW_DEMO = 2;

export interface WorkshopStats {
  readonly mode: Mode; readonly phase: Phase; readonly phaseTime: number; readonly picture: string; readonly tier: number; readonly level: number;
  readonly handActive: boolean; readonly stamps: number; readonly sheet: number; readonly fx: number;
  readonly workMean: number; readonly workMax: number;
  readonly learnHits: number; readonly learnMisses: number; readonly motorHits: number; readonly motorMisses: number;
  spots(): { x: number; y: number; shape: string; open: boolean; placed: boolean; hit: number; reach: number }[];
  pieces(): { x: number; y: number; shape: string; state: string; extra: boolean; cell: number }[];
  buttons(): { id: string; x: number; y: number; r: number; visible: boolean }[];
  frames(): { id: string; x: number; y: number; size: number; made: boolean }[];
  swatches(): { x: number; y: number; r: number }[];
  shapeCells(): { x: number; y: number; size: number; shape: string }[];
  sheetRect(): { x: number; y: number; w: number; h: number };
  cellSize(): number;
  data(): WorkshopData;
  resetWork(): void;
}
export interface WorkshopScene extends Scene { readonly stats: WorkshopStats }

export async function loadShapeWorkshopArt(services: AppServices): Promise<void> {
  await loadAllArt(services, [
    artRequest(services, ART.wall, 'none'),
    artRequest(services, ART.grain, 'none'),
    artRequest(services, ART.hand, 'none'),
    artRequest(services, ART.gallery, 'star', '#ff9fc4'),
    artRequest(services, ART.brush, 'star', '#ffd166'),
    artRequest(services, ART.home, 'home', '#ffffff'),
    ...soundArt(services),
  ]);
}

export function createShapeWorkshopScene(services: AppServices): WorkshopScene {
  const { audio, input, sprites } = services;
  const random = (): number => services.random();
  const fx = createFx();
  const sfxOpts: SfxOptions = { index: 0, volume: 1 };
  const work = new Float32Array(240);
  let workHead = 0, workCount = 0, updateMs = 0;

  let data: WorkshopData = defaults();
  let mode: Mode = 'build', phase: Phase = 'deal';
  let W = 1366, H = 768, u = 1, margin = 16, btnR = 52, dpr = 1, portrait = false;
  let areaTop = 0, toolTop = 0, areaBottom = 0, areaLeft = 0, areaRight = 0, swatchCycle = false;
  let time = 0, sceneT = 0, phaseT = 0, inputAfter = 0, lastPlace = 0, lastHint = -99, hintShape = '', hintAt = -99;
  let bg: HTMLCanvasElement | undefined;
  let bgDirty = true;
  let pointerDown = false, downX = 0, downY = 0, kbActive = false, focus = -1;

  // ---------------------------------------------------------------- top buttons
  const press = (fn: () => void) => () => { if (performance.now() < inputAfter) return; fn(); };
  const home = createButton({ x: 0, y: 0, radius: 52, fill: '#a3c9c5', icon: artName(sprite(ART.home)), iconScale: 0.66, onPress: press(() => leave()) });
  const brushBtn = createButton({ x: 0, y: 0, radius: 52, fill: '#ffe08a', icon: artName(sprite(ART.brush)), iconScale: 0.86, onPress: press(() => { sfx('button'); openFree(data.lastSheet); }) });
  const galleryBtn = createButton({ x: 0, y: 0, radius: 52, fill: '#ffc2d9', icon: artName(sprite(ART.gallery)), iconScale: 0.9, onPress: press(() => { sfx('button'); openGallery(); }) });
  const sound = createSoundButton(services);
  const allButtons: Button[] = [home, brushBtn, galleryBtn, sound];
  const visibleButtons: Button[] = [];

  function sfx(name: SfxName, variant?: SfxVariant, index = 0, volume = 1): void {
    sfxOpts.index = index; sfxOpts.volume = volume;
    if (variant) sfxOpts.variant = variant; else delete sfxOpts.variant;
    playSfx(audio, name, sfxOpts);
  }
  const guard = (): void => { inputAfter = performance.now() + GUARD_MS; };
  /** The motor tier in use; ?debug&tier=N forces it. */
  const tierNow = (): 0 | 1 | 2 => services.debug.tier ?? (data.tier === 1 ? 1 : data.tier === 2 ? 2 : 0);
  const save = (): void => services.save.save();

  // ---------------------------------------------------------------- build state
  let pic: Picture = PICTURES[0]!;
  let wip: Wip = { open: [], placed: [] };
  let spots: Spot[] = [];
  let pieces: Piece[] = [];
  let sheet: Baked | undefined, tray: Baked | undefined;
  let board: HTMLCanvasElement | undefined;
  let boardDirty = true, boardSlide = 1;
  let sheetX = 0, sheetY = 0, sheetW = 0, sheetH = 0, boxX = 0, boxY = 0, P = 600;
  let trayX = 0, trayY = 0, trayCols = 2, cell = 120;
  let held: Piece | undefined;
  let keyPiece = 0;
  let learnHits = 0, learnMisses = 0, motorHits = 0, motorMisses = 0, pointerPlacements = 0, keyPlacements = 0;
  let cue = 0;
  const pose: Pose = resetPose({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, open: 0 });
  const ppose: Pose = resetPose({ x: 0, y: 0, rot: 0, sx: 1, sy: 1, open: 0 });
  const dash: number[] = [10, 8];
  const noDash: number[] = [];

  // ---------------------------------------------------------------- free state
  let sheetIndex = 0, selShape = 0, selColor = 0, cursorX = 0.5, cursorY = 0.5, lastStampX = -1e9, lastStampY = -1e9;
  let freeX = 0, freeY = 0, freeW = 0, freeH = 0, freeCell = 110, swatchR = 52;
  let freeSheet: Baked | undefined, layer: HTMLCanvasElement | undefined;
  let layerDirty = true;
  const stampArt: (Baked | undefined)[] = new Array<Baked | undefined>(SHAPES.length * SWATCHES).fill(undefined);
  const trayArt: (Baked | undefined)[] = new Array<Baked | undefined>(SHAPES.length * SWATCHES).fill(undefined);
  const shapeCellX = new Float32Array(SHAPES.length), shapeCellY = new Float32Array(SHAPES.length);
  const swatchX = new Float32Array(SWATCHES), swatchY = new Float32Array(SWATCHES);
  const live: Stamp[] = Array.from({ length: LIVE_STAMPS }, () => ({ active: false, shape: 0, color: 0, x: 0, y: 0, size: 0, rot: 0, t: 0 }));

  // ---------------------------------------------------------------- gallery state
  const frameX = new Float32Array(12), frameY = new Float32Array(12), frameHover = new Float32Array(12);
  let frameSize = 160, galleryFocus = 0;
  /** Thumbnails waiting to be baked; one is baked per frame so opening the shelf never stalls. */
  const thumbDirty = new Uint8Array(12).fill(1);
  const thumbs: (HTMLCanvasElement | undefined)[] = new Array<HTMLCanvasElement | undefined>(12).fill(undefined);
  const frames: (Baked | undefined)[] = new Array<Baked | undefined>(6).fill(undefined);
  let shelf: Baked | undefined;

  // ---------------------------------------------------------------- helper hand
  const KIND_DEMO = 1, KIND_HINT = 2, KIND_FREE = 3;
  const hand = { kind: 0, step: 0, t: 0, dur: 1, x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, press: 0, alpha: 0, piece: -1, spot: -1 };
  function handGo(x: number, y: number, dur: number): void { hand.x0 = hand.x; hand.y0 = hand.y; hand.x1 = x; hand.y1 = y; hand.t = 0; hand.dur = dur; }
  function handStart(kind: number): void {
    hand.kind = kind; hand.step = 0; hand.x = W + 60; hand.y = H + 80; hand.alpha = 0; hand.press = 0;
    handNext();
  }
  function handStop(): void {
    if (hand.kind === KIND_DEMO && hand.piece >= 0) { const p = pieces[hand.piece]; if (p && p.state === 'held') returnPiece(p); }
    hand.kind = 0; hand.piece = -1; hand.spot = -1;
  }

  // ---------------------------------------------------------------- layout
  function layout(width: number, height: number): void {
    W = width; H = height; dpr = services.canvas.dpr;
    u = Math.min(1.5, Math.max(0.5, Math.min(W / 1366, H / 768))) * services.config.uiScale;
    margin = Math.max(10, 16 * u); btnR = Math.max(48, 52 * u);
    portrait = W < H * 0.95;
    const top = margin + btnR;
    home.x = margin + btnR; home.y = top; home.radius = btnR;
    sound.x = W - margin - btnR; sound.y = top; sound.radius = btnR;
    galleryBtn.x = sound.x - btnR * 2 - margin; galleryBtn.y = top; galleryBtn.radius = btnR;
    brushBtn.x = galleryBtn.x - btnR * 2 - margin; brushBtn.y = top; brushBtn.radius = btnR;
    areaTop = top + btnR + margin * 0.6; areaBottom = H - margin; areaLeft = margin; areaRight = W - margin;
    toolTop = areaTop;
    if (W < btnR * 8 + margin * 5) {
      // Too narrow for four buttons in a row: the two mode buttons drop to a second row.
      galleryBtn.x = sound.x; brushBtn.x = sound.x - btnR * 2 - margin;
      galleryBtn.y = brushBtn.y = top + btnR * 2 + margin;
      toolTop = galleryBtn.y + btnR + margin * 0.6;
    }
    bgDirty = true;
    fx.bake(dpr);
    layoutBuild(); layoutFree(); layoutGallery();
  }

  function layoutBuild(): void {
    const n = Math.max(3, pieces.length), availW = areaRight - areaLeft, availH = areaBottom - toolTop;
    let rows = 1;
    if (!portrait) {
      trayCols = 1;
      for (; trayCols <= 4; trayCols++) { rows = Math.ceil(n / trayCols); cell = Math.min(Math.max(112, 150 * u), (availH - 20 * u) / rows); if (cell >= 108) break; }
      trayCols = Math.min(trayCols, 4); rows = Math.ceil(n / trayCols); cell = Math.max(100, Math.min(Math.max(112, 150 * u), (availH - 20 * u) / rows));
      trayX = areaRight - trayCols * cell; trayY = toolTop + (availH - rows * cell) / 2;
      const side = Math.min(trayX - margin - areaLeft, availH);
      sheetW = sheetH = side; sheetX = areaLeft + (trayX - margin - areaLeft - side) / 2; sheetY = toolTop + (availH - side) / 2;
    } else {
      trayCols = Math.max(1, Math.floor(availW / 104)); rows = Math.ceil(n / trayCols);
      cell = Math.max(100, Math.min(130 * u, availW / trayCols));
      trayY = areaBottom - rows * cell; trayX = areaLeft + (availW - trayCols * cell) / 2;
      const side = Math.max(120, Math.min(availW, trayY - margin - toolTop));
      sheetW = sheetH = side; sheetX = areaLeft + (availW - side) / 2; sheetY = toolTop + (trayY - margin - toolTop - side) / 2;
    }
    P = sheetW * 0.86 * TIERS[tierNow()].scale;
    boxX = sheetX + (sheetW - P) / 2; boxY = sheetY + (sheetH - P) / 2;
    sheet = bakeShape('square', PAPER[7], sheetW, sheetH, dpr, { shadow: 9 * u, rim: 4, seed: 11, layer: '#fff8ea' });
    tray = bakeShape('rectangle', '#e6c08f', trayCols * cell + 16 * u, rows * cell + 16 * u, dpr, { shadow: 7 * u, rim: 3, seed: 5 });
    const tier = TIERS[tierNow()];
    for (const s of spots) {
      s.x = boxX + s.part.x / 100 * P; s.y = boxY + s.part.y / 100 * P; s.w = s.part.w / 100 * P; s.h = s.part.h / 100 * P;
      s.rot = s.part.rot * Math.PI / 180;
      const r = Math.max(s.w, s.h) / 2;
      s.hit = Math.max(48, r); s.reach = Math.max(48, tier.snapMin * u, tier.snap * r);
      s.baked = bakeShape(s.part.shape, PAPER[s.part.color]!, s.w, s.h, dpr, { rotation: s.rot, seed: s.part.x * 3 + s.part.y });
    }
    for (const p of pieces) placeInTray(p);
    boardDirty = true;
  }

  function placeInTray(p: Piece): void {
    p.hx = trayX + (p.cell % trayCols + 0.5) * cell; p.hy = trayY + (Math.floor(p.cell / trayCols) + 0.5) * cell;
    const aspect = TRAY_ASPECT[p.shape], s = cell * 0.74;
    p.w = s; p.h = s / aspect;
    p.baked = bakeShape(p.shape, PAPER[p.color]!, p.w, p.h, dpr, { seed: p.cell * 17 + 3 });
    if (p.state === 'tray' || (p.state === 'held' && p.selected)) { p.x = p.hx; p.y = p.hy; }
  }

  function layoutFree(): void {
    const availW = areaRight - areaLeft;
    swatchR = Math.max(48, Math.min(56 * u, availW / 16));
    if (!portrait) {
      const rowTop = areaBottom - swatchR * 2;
      for (let i = 0; i < SWATCHES; i++) { swatchX[i] = W / 2 + (i - 3) * (swatchR * 2 + 14 * u); swatchY[i] = rowTop + swatchR; }
      const gridH = rowTop - margin - toolTop;
      let cols = 2, rows = 4;
      for (; cols <= 4; cols++) { rows = Math.ceil(SHAPES.length / cols); freeCell = Math.min(Math.max(110, 124 * u), gridH / rows); if (freeCell >= 100) break; }
      cols = Math.min(cols, 4); rows = Math.ceil(SHAPES.length / cols); freeCell = Math.max(100, Math.min(Math.max(110, 124 * u), gridH / rows));
      const gx = areaRight - cols * freeCell, gy = toolTop + (gridH - rows * freeCell) / 2;
      for (let i = 0; i < SHAPES.length; i++) { shapeCellX[i] = gx + (i % cols + 0.5) * freeCell; shapeCellY[i] = gy + (Math.floor(i / cols) + 0.5) * freeCell; }
      const aw = gx - margin - areaLeft, ah = gridH;
      freeH = Math.min(ah, aw / SHEET_ASPECT); freeW = freeH * SHEET_ASPECT;
      freeX = areaLeft + (aw - freeW) / 2; freeY = toolTop + (ah - freeH) / 2;
    } else {
      // Portrait: no room for seven swatches, so one swatch cell steps through the colours.
      const cols = Math.max(1, Math.floor(availW / 104)), cells = SHAPES.length + 1, rows = Math.ceil(cells / cols);
      freeCell = Math.max(100, Math.min(120 * u, availW / cols));
      const gy = areaBottom - rows * freeCell;
      for (let i = 0; i < cells; i++) {
        const row = Math.floor(i / cols), inRow = row < rows - 1 ? cols : cells - cols * (rows - 1);
        const x = W / 2 + (i % cols - (inRow - 1) / 2) * freeCell, y = gy + (row + 0.5) * freeCell;
        if (i < SHAPES.length) { shapeCellX[i] = x; shapeCellY[i] = y; } else for (let k = 0; k < SWATCHES; k++) { swatchX[k] = x; swatchY[k] = y; }
      }
      swatchR = 48;
      const ah = Math.max(90, gy - margin - toolTop);
      freeW = Math.min(availW, ah * SHEET_ASPECT); freeH = freeW / SHEET_ASPECT;
      freeX = areaLeft + (availW - freeW) / 2; freeY = toolTop + (ah - freeH) / 2;
    }
    swatchCycle = portrait;
    freeSheet = bakeShape('rectangle', PAPER[10], freeW, freeH, dpr, { shadow: 9 * u, rim: 4, seed: 23, layer: '#fffdf6' });
    trayArt.fill(undefined);
    layerDirty = true;
  }

  function layoutGallery(): void {
    const availW = areaRight - areaLeft, availH = areaBottom - areaTop;
    const cols = portrait ? 3 : 6, rows = 12 / cols, rowFactor = portrait ? 1.16 : 1.32;
    frameSize = Math.max(100, Math.min(200 * u, availW / (cols + (cols - 1) * 0.18 + 0.4), availH / (rows * rowFactor + 0.3)));
    const gap = frameSize * 0.18, rowH = frameSize * rowFactor;
    const top = areaTop + (availH - rows * rowH) / 2 + frameSize * 0.48;
    for (let i = 0; i < 12; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      frameX[i] = W / 2 + (col - (cols - 1) / 2) * (frameSize + gap);
      frameY[i] = top + row * rowH;
    }
    for (let i = 0; i < 6; i++) frames[i] = bakeShape('square', PAPER[FRAME_COLORS[i]!]!, frameSize, frameSize, dpr, { seed: 31 + i });
    shelf = bakeShape('rectangle', '#c9935e', cols * (frameSize + gap) + gap, frameSize * 0.13, dpr, { shadow: 6 * u, seed: 41 });
    thumbDirty.fill(1);
  }

  // ---------------------------------------------------------------- build: pictures and pieces
  function chooseOpen(p: Picture): number[] {
    const count = TIERS[tierNow()].pieces;
    const eligible: number[] = [];
    p.parts.forEach((part, i) => { if (data.level >= 2 || part.rot === 0) eligible.push(i); });
    eligible.sort((a, b) => p.parts[b]!.w * p.parts[b]!.h - p.parts[a]!.w * p.parts[a]!.h);
    const start = ((data.made[p.id] ?? 0) * 2) % Math.max(1, eligible.length);
    const order = eligible.slice(start).concat(eligible.slice(0, start));
    const chosen: number[] = [], shapes = new Set<Shape>();
    for (const i of order) if (chosen.length < count && !shapes.has(p.parts[i]!.shape)) { chosen.push(i); shapes.add(p.parts[i]!.shape); }
    for (const i of order) if (chosen.length < count && !chosen.includes(i)) chosen.push(i);
    return chosen.sort((a, b) => a - b);
  }

  function nextPictureId(after: string): PictureId {
    const start = Math.max(0, PICTURE_IDS.indexOf(after as PictureId));
    for (let k = 1; k <= PICTURE_IDS.length; k++) {
      const id = PICTURE_IDS[(start + k) % PICTURE_IDS.length]!;
      if (!data.made[id]) return id;
    }
    return PICTURE_IDS[(start + 1) % PICTURE_IDS.length]!;
  }

  function startPicture(id: string): void {
    pic = pictureById(id) ?? PICTURES[0]!;
    data.currentId = pic.id;
    const saved = data.wip[pic.id];
    wip = saved ?? { open: chooseOpen(pic), placed: [] };
    data.wip[pic.id] = wip;
    spots = pic.parts.map((part, j) => ({ part, open: wip.open.includes(j), placed: false, reserved: false, base: baseOf(pic, j), x: 0, y: 0, w: 0, h: 0, rot: 0, hit: 48, reach: 48, land: -1, baked: undefined }));
    for (const i of wip.placed) { const s = spots[i]; if (s) s.placed = true; }
    pieces = [];
    for (const i of wip.open) if (!wip.placed.includes(i)) pieces.push(newPiece(pic.parts[i]!.shape, pic.parts[i]!.color, false));
    if (data.level >= 1) {
      const used = new Set(wip.open.map(i => pic.parts[i]!.shape));
      const spare = SHAPES.filter(s => !used.has(s));
      for (let k = 0; k < 2 && spare.length; k++) pieces.push(newPiece(spare.splice(Math.floor(random() * spare.length), 1)[0]!, Math.floor(random() * SWATCHES), true));
    }
    for (let i = pieces.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = pieces[i]!; pieces[i] = pieces[j]!; pieces[j] = t; }
    pieces.forEach((p, i) => { p.cell = i; });
    keyPiece = Math.max(0, pieces.findIndex(p => !p.extra));
    learnHits = learnMisses = motorHits = motorMisses = pointerPlacements = keyPlacements = 0;
    held = undefined; hintAt = -99; lastHint = time; lastPlace = time;
    phase = 'deal'; phaseT = 0; boardSlide = 0; cue = 0;
    sfx('whoosh', 'D', 0, 0.6);
    layoutBuild();
    for (const p of pieces) { p.x = p.hx + W * 0.4; p.y = p.hy; }
    save();
  }

  /** The nearest earlier, bigger part whose box holds this part's centre. */
  function baseOf(p: Picture, j: number): number {
    const a = p.parts[j]!;
    for (let i = j - 1; i >= 0; i--) {
      const b = p.parts[i]!;
      if (b.w * b.h > a.w * a.h && Math.abs(a.x - b.x) <= b.w / 2 && Math.abs(a.y - b.y) <= b.h / 2) return i;
    }
    return -1;
  }

  /** A glued-on part shows once its base is on the sheet. */
  function waiting(s: Spot): boolean {
    const b = s.base >= 0 ? spots[s.base] : undefined;
    return !!b && b.open && !b.placed;
  }

  function newPiece(shape: Shape, color: number, extra: boolean): Piece {
    return { shape, color, extra, cell: 0, x: 0, y: 0, hx: 0, hy: 0, w: 0, h: 0, state: 'tray', t: 0, fromX: 0, fromY: 0, target: -1, tried: false, drag: false, selected: false, baked: undefined };
  }

  function returnPiece(p: Piece): void {
    p.state = 'back'; p.t = 0; p.fromX = p.x; p.fromY = p.y; p.drag = false; p.selected = false;
    if (held === p) held = undefined;
  }

  /** Nearest empty open spot with this shape, or -1. */
  function nearestSpot(shape: Shape | undefined, x: number, y: number, match: boolean): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      if (!s.open || s.placed || s.reserved) continue;
      if (shape !== undefined && (s.part.shape === shape) !== match) continue;
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function assisted(p: Piece): boolean { return hintShape === p.shape && time - hintAt < ASSIST_SECONDS; }

  /** A pointer let go of (or clicked with) a piece at x, y. */
  function tryPlace(p: Piece, x: number, y: number, drag: boolean): void {
    const m = nearestSpot(p.shape, x, y, true);
    const o = nearestSpot(p.shape, x, y, false);
    const dm = m >= 0 ? Math.hypot(x - spots[m]!.x, y - spots[m]!.y) : Infinity;
    const doo = o >= 0 ? Math.hypot(x - spots[o]!.x, y - spots[o]!.y) : Infinity;
    const overOther = o >= 0 && doo <= spots[o]!.hit && doo < dm * 0.85;
    lastHint = time;
    if (m >= 0 && dm <= spots[m]!.reach && !overOther) {
      motorHits++;
      if (!assisted(p)) { if (!p.tried) { learnHits++; evidence(p.shape, 0); } }
      pointerPlacements++;
      place(p, m, HOW_POINTER);
      return;
    }
    if (overOther) {
      // Wrong outline: gentle no, back to the tray. Learning evidence only, never motor.
      if (!assisted(p)) { learnMisses++; evidence(p.shape, 1); }
      p.tried = true; p.state = 'nope'; p.t = 0; p.fromX = x; p.fromY = y; p.x = x; p.y = y; p.drag = false; p.selected = false;
      if (held === p) held = undefined;
      sfx('miss', 'D', 0, 0.8);
      return;
    }
    if (m >= 0 && dm <= spots[m]!.reach * 2.5) motorMisses++;
    if (drag) returnPiece(p);
  }

  function evidence(shape: Shape, slot: 0 | 1): void {
    const e = data.evidence[shape] ?? [0, 0];
    e[slot] = (e[slot] ?? 0) + 1; data.evidence[shape] = e;
  }

  function place(p: Piece, spotIndex: number, how: number): void {
    const s = spots[spotIndex]!;
    s.reserved = true;
    p.state = 'fly'; p.t = 0; p.fromX = p.x; p.fromY = p.y; p.target = spotIndex; p.drag = false; p.selected = false;
    if (held === p) held = undefined;
    if (how === HOW_KEY) keyPlacements++;
    sfx('whoosh', 'C', 0, 0.35);
  }

  function land(p: Piece): void {
    const s = spots[p.target]!;
    s.placed = true; s.reserved = false; s.land = 0;
    p.state = 'gone';
    // Parts glued onto this one pop on with it.
    for (const q of spots) if (q !== s && !q.open && spots[q.base] === s) q.land = 0;
    const index = pic.parts.indexOf(s.part);
    if (!wip.placed.includes(index)) wip.placed.push(index);
    lastPlace = time; lastHint = time;
    sfx('pop', 'C', wip.placed.length - 1); sfx('whoosh', 'C', 1, 0.3);
    sayShape(services, p.shape);
    fx.sparkleRing(s.x, s.y, Math.max(s.w, s.h) * 0.5 + 10 * u, 9, random);
    if (pieces.indexOf(p) === keyPiece) moveKeyPiece(1);
    if (wip.placed.length >= wip.open.length) completePicture(); else save();
  }

  function moveKeyPiece(step: number): void {
    const n = pieces.length;
    for (let k = 1; k <= n; k++) {
      const i = ((keyPiece + step * k) % n + n) % n, p = pieces[i]!;
      if (p.state === 'tray' || p.state === 'held' || p.state === 'back') { keyPiece = i; return; }
    }
  }

  function completePicture(): void {
    // The finished picture is written once, before anything celebrates it.
    data.made[pic.id] = (data.made[pic.id] ?? 0) + 1;
    delete data.wip[pic.id];
    adjustDifficulty();
    services.save.flush();
    thumbDirty[PICTURE_IDS.indexOf(pic.id)] = 1;
    phase = 'done'; phaseT = 0; cue = 0; held = undefined; handStop();
    for (const p of pieces) if (p.state !== 'gone' && p.state !== 'fly') { fx.spawn(FX_PUFF, p.x, p.y, 0, -30 * u, 0.6, p.w * 0.8, -1); p.state = 'gone'; }
  }

  function adjustDifficulty(): void {
    if (services.debug.tier !== undefined) return;
    const attempts = motorHits + motorMisses;
    if (attempts >= 3 && motorMisses / attempts > 0.34) { data.tier = Math.max(0, data.tier - 1); data.motorStreak = 0; }
    else if (motorMisses === 0 && keyPlacements === 0 && pointerPlacements > 0) {
      data.motorStreak++;
      if (data.motorStreak >= 2) { data.tier = Math.min(2, data.tier + 1); data.motorStreak = 0; }
    } else data.motorStreak = 0;
    if (learnHits >= 3 && learnMisses === 0) {
      data.learnStreak++;
      if (data.learnStreak >= 2) { data.level = Math.min(2, data.level + 1); data.learnStreak = 0; }
    } else if (learnMisses >= 3 && learnMisses > learnHits) { data.level = Math.max(0, data.level - 1); data.learnStreak = 0; }
    else data.learnStreak = 0;
  }

  // ---------------------------------------------------------------- modes
  function setMode(next: Mode): void {
    if (mode === 'free') { flushLive(); thumbDirty[6 + sheetIndex] = 1; }
    mode = next; focus = -1; guard(); handStop(); held = undefined; pointerDown = false;
    for (const p of pieces) if (p.state === 'held') returnPiece(p);
    fx.clear();
  }

  function openBuild(id: string): void {
    setMode('build');
    startPicture(id);
  }

  function openFree(index: number): void {
    setMode('free');
    sheetIndex = Math.max(0, Math.min(SHEET_COUNT - 1, index)); data.lastSheet = sheetIndex;
    cursorX = 0.5; cursorY = 0.5; layerDirty = true; save();
    if (!data.freeDemo) handStart(KIND_FREE);
  }

  function openGallery(): void {
    setMode('gallery');
    galleryFocus = Math.max(0, PICTURE_IDS.indexOf(pic.id));
  }

  function leave(): void {
    flushLive(); handStop();
    services.save.flush();
    sfx('button');
    services.nav.toHub();
  }

  // ---------------------------------------------------------------- free build
  function stampBaked(shape: number, color: number): Baked {
    const k = shape * SWATCHES + color;
    let b = stampArt[k];
    if (!b) {
      const s = SHAPES[shape]!, a = TRAY_ASPECT[s];
      b = bakeShape(s, PAPER[color]!, STAMP_REF, STAMP_REF / a, dpr, { seed: k * 7 + 1 });
      stampArt[k] = b;
    }
    return b;
  }

  function trayBaked(shape: number, color: number): Baked {
    const k = shape * SWATCHES + color;
    let b = trayArt[k];
    if (!b) {
      const s = SHAPES[shape]!, size = freeCell * 0.7;
      b = bakeShape(s, PAPER[color]!, size, size / TRAY_ASPECT[s], dpr, { seed: k * 5 + 2 });
      trayArt[k] = b;
    }
    return b;
  }

  function stamps(): number[] { return data.sheets[sheetIndex]!; }

  function stamp(x: number, y: number): void {
    const list = stamps();
    if (list.length >= MAX_STAMPS * STAMP_STRIDE) { fx.sparkleRing(x, y, 30 * u, 6, random); sfx('tick', undefined, 0, 0.6); return; }
    let slot: Stamp | undefined;
    for (const s of live) if (!s.active) { slot = s; break; }
    if (!slot) { flushLive(); slot = live[0]!; }
    const size = Math.round(160 * (0.85 + random() * 0.3)), rot = Math.round((random() - 0.5) * 30);
    const nx = Math.round(clamp01((x - freeX) / freeW) * 1000), ny = Math.round(clamp01((y - freeY) / freeH) * 1000);
    list.push(selShape, selColor, nx, ny, size, rot);
    slot.active = true; slot.shape = selShape; slot.color = selColor; slot.x = nx; slot.y = ny; slot.size = size; slot.rot = rot; slot.t = 0;
    lastStampX = x; lastStampY = y;
    sfx('pop', 'C', selShape * 2 + (selColor % 2));
    fx.sparkleRing(x, y, freeW * size / 1000 * 0.4, 5, random);
    sayShape(services, SHAPES[selShape]!);
    save();
  }

  /** Bake one stamp into the sheet layer. */
  function bakeStamp(ctx: CanvasRenderingContext2D, shape: number, color: number, nx: number, ny: number, size: number, rot: number, ox: number, oy: number, w: number, h: number): void {
    const b = stampBaked(shape, color), scale = w * size / 1000 / STAMP_REF;
    drawBaked(ctx, b, ox + nx / 1000 * w, oy + ny / 1000 * h, rot * Math.PI / 180, scale, scale);
  }

  function rebuildLayer(): void {
    if (!freeSheet) return;
    const pw = Math.ceil(freeSheet.w * dpr), ph = Math.ceil(freeSheet.h * dpr);
    if (!layer || layer.width !== pw || layer.height !== ph) { layer = document.createElement('canvas'); layer.width = pw; layer.height = ph; }
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, freeSheet.w, freeSheet.h);
    ctx.drawImage(freeSheet.canvas, 0, 0, freeSheet.w, freeSheet.h);
    const ox = (freeSheet.w - freeW) / 2, oy = (freeSheet.h - freeH) / 2;
    const list = stamps();
    let liveFrom = list.length;
    for (const s of live) if (s.active) liveFrom -= STAMP_STRIDE;
    for (let i = 0; i < liveFrom; i += STAMP_STRIDE) bakeStamp(ctx, list[i]!, list[i + 1]!, list[i + 2]!, list[i + 3]!, list[i + 4]!, list[i + 5]!, ox, oy, freeW, freeH);
    layerDirty = false;
  }

  function flushLive(): void {
    for (const s of live) s.active = false;
    layerDirty = true;
  }

  // ---------------------------------------------------------------- update
  function updateBuild(dt: number): void {
    phaseT += dt;
    boardSlide = Math.min(1, boardSlide + dt / 0.4);
    for (const s of spots) if (s.land >= 0) { s.land += dt; if (s.land >= LAND_SECONDS) { s.land = -1; boardDirty = true; } }
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      p.t += dt;
      if (p.state === 'tray') {
        const delay = phase === 'deal' ? i * 0.05 : 0;
        if (phase !== 'deal' || phaseT > delay) { p.x = approach(p.x, p.hx, 14, dt); p.y = approach(p.y, p.hy, 14, dt); }
      } else if (p.state === 'held') {
        if (p.drag) { p.x = approach(p.x, input.pointer.x, 32, dt); p.y = approach(p.y, input.pointer.y, 32, dt); }
        else if (hand.kind === KIND_DEMO && hand.piece === i) { p.x = hand.x; p.y = hand.y + p.h * 0.35; }
        else { p.x = approach(p.x, p.hx, 18, dt); p.y = approach(p.y, p.hy - 6 * u, 18, dt); }
      } else if (p.state === 'fly') {
        if (p.t >= FLY_SECONDS) land(p);
      } else if (p.state === 'back') {
        const k = easeOutCubic(p.t / 0.38);
        p.x = lerp(p.fromX, p.hx, k); p.y = lerp(p.fromY, p.hy, k) - Math.sin(Math.PI * clamp01(p.t / 0.38)) * 30 * u;
        if (p.t >= 0.38) { p.state = 'tray'; p.x = p.hx; p.y = p.hy; }
      } else if (p.state === 'nope' && p.t >= 0.34) returnPiece(p);
    }
    if (phase === 'deal' && phaseT >= DEAL_SECONDS) {
      phase = 'play'; phaseT = 0; lastHint = time;
      if (!data.demo) handStart(KIND_DEMO);
    }
    if (phase === 'play') {
      // Idle help: never during a drag, a demonstration, or the first moments.
      const idle = time - Math.max(lastPlace, lastHint);
      if (!hand.kind && !held && !pointerDown && idle > (hintAt < 0 ? HINT_IDLE : HINT_REPEAT)) handStart(KIND_HINT);
    } else if (phase === 'done') {
      if (phaseT >= 0.3 && cue === 0) { cue = 1; sfx('fanfare'); fx.confetti(boxX + P / 2, boxY + P * 0.3, P * 0.35, 36, random); }
      if (phaseT >= DONE_SECONDS) { phase = 'alive'; phaseT = 0; cue = 0; }
    } else if (phase === 'alive') {
      aliveCues(phaseT - dt, phaseT);
      if (phaseT >= ALIVE_SECONDS) { phase = 'send'; phaseT = 0; }
    } else if (phase === 'send' && phaseT >= SEND_SECONDS) {
      galleryBtn.popIn(); fx.sparkleRing(galleryBtn.x, galleryBtn.y, btnR, 10, random); sfx('sticker');
      services.roundBoundary();
      startPicture(nextPictureId(pic.id));
    }
  }

  /** Sounds and puffs for the alive animation, fired as time crosses each cue. */
  let cueT0 = 0, cueT1 = 0;
  const at = (t: number): boolean => cueT0 < t && cueT1 >= t;
  const every = (period: number, from: number, to: number): boolean => cueT1 >= from && cueT1 <= to && Math.floor((cueT1 - from) / period) !== Math.floor((cueT0 - from) / period);
  const px = (x: number): number => boxX + x / 100 * P, py = (y: number): number => boxY + y / 100 * P;
  function aliveCues(t0: number, t1: number): void {
    cueT0 = t0; cueT1 = t1;
    picturePose(pic.id, t1, pose);
    const ox = pose.x / 100 * P, oy = pose.y / 100 * P;
    switch (pic.id) {
      case 'rocket':
        if (at(0.05)) sfx('whoosh', 'C', 0, 0.7);
        if (at(0.6)) sfx('whoosh', 'A');
        if (at(2.55)) sfx('pop', 'B', 0);
        if (every(0.05, 0.3, 1.6)) fx.spawn(FX_PUFF, px(50 + (random() - 0.5) * 14) + ox, py(98) + oy, (random() - 0.5) * 60 * u, 40 * u, 0.9, P * (0.06 + random() * 0.05), -1);
        break;
      case 'fish':
        if (every(0.4, 0.1, 2.8)) { fx.spawn(FX_BUBBLE, px(80) + ox, py(46) + oy, 10 * u, -70 * u, 1.2, P * 0.045, -1); sfx('pop', 'D', cue++ % 5, 0.45); }
        break;
      case 'house':
        if (at(0.4)) sfx('button', 'D');
        if (at(0.75)) sfx('star', 'A', 2, 0.8);
        if (every(0.32, 0.8, 2.9)) fx.spawn(FX_PUFF, px(67) + ox, py(13) + oy, 12 * u, -55 * u, 1.3, P * (0.05 + random() * 0.03), -1);
        break;
      case 'cat':
        if (at(0.2)) sfx('yawn', 'D');
        if (at(2.0)) sfx('pop', 'C', 4, 0.6);
        break;
      case 'car':
        if (at(0.05)) sfx('button', 'C');
        if (at(0.35) || at(1.6)) sfx('whoosh', 'A', 0, 0.8);
        if (at(2.7)) sfx('pop', 'B', 2);
        if (every(0.09, 0.2, 2.6)) fx.spawn(FX_PUFF, px(8) + ox, py(70) + oy, -70 * u, -15 * u, 0.7, P * (0.035 + random() * 0.02), -1);
        break;
      case 'flower':
        if (at(0.1)) sfx('star', 'C', 1);
        if (at(0.7) || at(1.4) || at(2.1)) { fx.sparkleRing(px(50), py(36), P * 0.2, 8, random); sfx('tick', undefined, 0, 0.6); }
        break;
    }
  }

  function updateFree(dt: number): void {
    for (const s of live) if (s.active) { s.t += dt; }
    let done = false;
    for (const s of live) if (s.active && s.t >= 0.32) done = true;
    if (done && !layerDirty && layer) {
      // Bake landed stamps into the sheet layer in order; later live stamps stay live.
      const ctx = layer.getContext('2d');
      const list = stamps();
      let first = list.length;
      for (const s of live) if (s.active) first -= STAMP_STRIDE;
      if (ctx && freeSheet) {
        const ox = (freeSheet.w - freeW) / 2, oy = (freeSheet.h - freeH) / 2;
        for (let i = first; i < list.length; i += STAMP_STRIDE) {
          const s = liveFor(i);
          if (!s || s.t < 0.32) break;
          bakeStamp(ctx, list[i]!, list[i + 1]!, list[i + 2]!, list[i + 3]!, list[i + 4]!, list[i + 5]!, ox, oy, freeW, freeH);
          s.active = false;
        }
      }
    }
    if (kbActive) {
      const speed = 0.55 * dt;
      if (input.isKeyDown('ArrowLeft')) cursorX = Math.max(0.03, cursorX - speed / SHEET_ASPECT);
      if (input.isKeyDown('ArrowRight')) cursorX = Math.min(0.97, cursorX + speed / SHEET_ASPECT);
      if (input.isKeyDown('ArrowUp')) cursorY = Math.max(0.04, cursorY - speed);
      if (input.isKeyDown('ArrowDown')) cursorY = Math.min(0.96, cursorY + speed);
    }
    // A held button on the sheet stamps a trail.
    if (pointerDown && !hand.kind && inSheet(input.pointer.x, input.pointer.y)) {
      const spacing = freeW * 0.16 * 0.8;
      if (Math.hypot(input.pointer.x - lastStampX, input.pointer.y - lastStampY) >= spacing) stamp(input.pointer.x, input.pointer.y);
    }
  }

  /** The live stamp drawing stamp-list entry `index`, matched by values. */
  function liveFor(index: number): Stamp | undefined {
    const list = stamps();
    for (const s of live) if (s.active && s.shape === list[index] && s.color === list[index + 1] && s.x === list[index + 2] && s.y === list[index + 3] && s.size === list[index + 4] && s.rot === list[index + 5]) return s;
    return undefined;
  }

  const inSheet = (x: number, y: number): boolean => x >= freeX && x <= freeX + freeW && y >= freeY && y <= freeY + freeH;

  function updateHand(dt: number): void {
    if (!hand.kind) return;
    hand.t += dt;
    const k = hand.dur > 0 ? clamp01(hand.t / hand.dur) : 1;
    const e = easeInOutSine(k);
    hand.x = lerp(hand.x0, hand.x1, e); hand.y = lerp(hand.y0, hand.y1, e);
    hand.alpha = Math.min(1, hand.alpha + dt * 4);
    if (hand.t >= hand.dur) handNext();
  }

  /** Advance the hand's script one step. Each kind is a short fixed sequence. */
  function handNext(): void {
    const step = hand.step++;
    hand.press = 0;
    if (hand.kind === KIND_DEMO || hand.kind === KIND_HINT) {
      if (step === 0) {
        const pi = pieces.findIndex(p => !p.extra && p.state === 'tray');
        const p = pieces[pi];
        const si = p ? nearestSpot(p.shape, p.hx, p.hy, true) : -1;
        if (!p || si < 0) { handStop(); return; }
        hand.piece = pi; hand.spot = si;
        handGo(p.hx, p.hy, hand.kind === KIND_DEMO ? 0.9 : 0.8);
      } else if (step === 1) {
        hand.press = 1; handGo(hand.x, hand.y, 0.3);
        const p = pieces[hand.piece];
        if (hand.kind === KIND_DEMO && p && p.state === 'tray') { p.state = 'held'; sfx('button', 'B'); }
        else if (p) { hintShape = p.shape; hintAt = time; lastHint = time; sfx('hover'); }
      } else if (step === 2) {
        const s = spots[hand.spot];
        if (!s) { handStop(); return; }
        handGo(s.x, s.y - (hand.kind === KIND_DEMO ? (pieces[hand.piece]?.h ?? 0) * 0.35 : 0), hand.kind === KIND_DEMO ? 1.1 : 0.9);
      } else if (step === 3) {
        hand.press = 1; handGo(hand.x, hand.y, 0.4);
        const p = pieces[hand.piece], s = spots[hand.spot];
        if (hand.kind === KIND_DEMO && p && s && p.state === 'held' && !s.placed && !s.reserved) { place(p, hand.spot, HOW_DEMO); data.demo = true; save(); }
        else if (hand.kind === KIND_HINT) sfx('hover');
        hand.piece = -1;
      } else if (step === 4) handGo(W + 80, H + 100, 0.6);
      else handStop();
    } else if (hand.kind === KIND_FREE) {
      const sx = (k: number): number => freeX + freeW * k, sy = (k: number): number => freeY + freeH * k;
      if (step === 0) handGo(shapeCellX[4]!, shapeCellY[4]!, 0.8);
      else if (step === 1) { hand.press = 1; handGo(hand.x, hand.y, 0.3); selShape = 4; sfx('button', 'B'); }
      else if (step === 2) handGo(sx(0.35), sy(0.45), 0.8);
      else if (step === 3) { hand.press = 1; handGo(hand.x, hand.y, 0.35); stamp(hand.x, hand.y); }
      else if (step === 4) handGo(sx(0.62), sy(0.58), 0.6);
      else if (step === 5) { hand.press = 1; handGo(hand.x, hand.y, 0.35); stamp(hand.x, hand.y); data.freeDemo = true; save(); }
      else if (step === 6) handGo(W + 80, H + 100, 0.6);
      else handStop();
    }
  }

  // ---------------------------------------------------------------- render: shared
  function ensureBackground(): void {
    if (!bgDirty) return;
    bg = bakeBackground(services, WALL, W, H, (ctx, w, h) => { ctx.fillStyle = '#9fd7f2'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e8c48f'; ctx.fillRect(0, h * 0.78, w, h * 0.22); }, bg);
    bgDirty = false;
  }

  function focusRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = 5; ctx.stroke();
  }

  function squareRing(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, strong: boolean): void {
    const h = size / 2 - 4;
    ctx.beginPath(); ctx.rect(x - h, y - h, h * 2, h * 2);
    ctx.lineJoin = 'round';
    if (strong) { ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.stroke(); }
    ctx.strokeStyle = '#fff8da'; ctx.lineWidth = strong ? 5 : 4; ctx.stroke();
  }

  function drawHand(ctx: CanvasRenderingContext2D): void {
    if (!hand.kind) return;
    const img = sprites.get(HAND);
    const size = Math.round(150 * u), s = 1 - 0.12 * (hand.press ? pulse(clamp01(hand.t / Math.max(0.01, hand.dur))) : 0);
    ctx.globalAlpha = hand.alpha;
    if (img) {
      const aspect = img.naturalWidth / img.naturalHeight, hh = size * s, ww = hh * aspect;
      // The fingertip sits about 38 percent across and 3 percent down the image.
      drawSprite(ctx, sprites, HAND, hand.x - ww * 0.38 + ww / 2, hand.y - hh * 0.03 + hh / 2, size, 0, s, s);
    } else {
      ctx.beginPath(); ctx.arc(hand.x, hand.y + 30 * u, 26 * u, 0, Math.PI * 2); ctx.fillStyle = '#f2b48c'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Small faces and details on top of a part, in the part's own centred space. */
  function drawFace(ctx: CanvasRenderingContext2D, face: Face, w: number, h: number, open: number): void {
    ctx.fillStyle = OUTLINE; ctx.strokeStyle = OUTLINE; ctx.lineCap = 'round';
    switch (face) {
      case 'eye':
        ctx.beginPath(); ctx.arc(w * 0.08, h * 0.02, w * 0.26, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * 0.16, -h * 0.08, w * 0.08, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
        break;
      case 'cat': {
        const ex = w * 0.17, ey = -h * 0.08, er = w * 0.065;
        if (open < 0) {
          ctx.lineWidth = Math.max(2, w * 0.03);
          ctx.beginPath(); ctx.moveTo(-ex - er, ey); ctx.lineTo(-ex + er, ey); ctx.moveTo(ex - er, ey); ctx.lineTo(ex + er, ey); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.ellipse(-ex, ey, er, er * 1.25, 0, 0, Math.PI * 2); ctx.ellipse(ex, ey, er, er * 1.25, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(-ex + er * 0.3, ey - er * 0.4, er * 0.35, 0, Math.PI * 2); ctx.arc(ex + er * 0.3, ey - er * 0.4, er * 0.35, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
        }
        ctx.lineWidth = Math.max(1.5, w * 0.018);
        ctx.beginPath();
        for (let side = -1; side <= 1; side += 2) for (let k = -1; k <= 1; k++) { ctx.moveTo(side * w * 0.16, h * 0.17 + k * h * 0.035); ctx.lineTo(side * w * 0.42, h * 0.13 + k * h * 0.08); }
        ctx.stroke();
        if (open > 0.4) { ctx.beginPath(); ctx.ellipse(0, h * 0.4, w * 0.08, h * 0.09 * open, 0, 0, Math.PI * 2); ctx.fillStyle = '#7a3443'; ctx.fill(); }
        else { ctx.lineWidth = Math.max(2, w * 0.025); ctx.beginPath(); ctx.arc(-w * 0.05, h * 0.36, w * 0.05, 0.1 * Math.PI, 0.9 * Math.PI); ctx.moveTo(w * 0.05 + w * 0.05 * Math.cos(0.1 * Math.PI), h * 0.36 + w * 0.05 * Math.sin(0.1 * Math.PI)); ctx.arc(w * 0.05, h * 0.36, w * 0.05, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }
        break;
      }
      case 'smile':
        ctx.beginPath(); ctx.arc(-w * 0.17, -h * 0.1, w * 0.07, 0, Math.PI * 2); ctx.arc(w * 0.17, -h * 0.1, w * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = Math.max(2, w * 0.06);
        ctx.beginPath(); ctx.arc(0, h * 0.04, w * (0.16 + 0.06 * open), 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        break;
      case 'bug':
        // A ladybug seen from above: dark head, a wing line, two spots.
        ctx.beginPath(); ctx.arc(0, -h * 0.4, w * 0.24, Math.PI, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-w * 0.22, h * 0.08); ctx.arc(-w * 0.22, h * 0.08, w * 0.1, 0, Math.PI * 2); ctx.moveTo(w * 0.22, h * 0.08); ctx.arc(w * 0.22, h * 0.08, w * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = Math.max(1, w * 0.04); ctx.beginPath(); ctx.moveTo(0, -h * 0.4); ctx.lineTo(0, h * 0.46); ctx.stroke();
        break;
      case 'hub':
        ctx.beginPath(); ctx.arc(0, 0, w * 0.24, 0, Math.PI * 2); ctx.fillStyle = '#d9d4e4'; ctx.fill();
        ctx.lineWidth = Math.max(2, w * 0.08); ctx.strokeStyle = '#d9d4e4';
        ctx.beginPath(); ctx.moveTo(-w * 0.36, 0); ctx.lineTo(w * 0.36, 0); ctx.moveTo(0, -h * 0.36); ctx.lineTo(0, h * 0.36); ctx.stroke();
        break;
      case 'window':
        if (open > 0) { ctx.globalAlpha = open; ctx.fillStyle = '#ffe58a'; ctx.fillRect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.84); ctx.globalAlpha = 1; }
        ctx.lineWidth = Math.max(2, w * 0.1); ctx.strokeStyle = '#fff3dc';
        ctx.beginPath(); ctx.moveTo(-w * 0.45, 0); ctx.lineTo(w * 0.45, 0); ctx.moveTo(0, -h * 0.45); ctx.lineTo(0, h * 0.45); ctx.stroke();
        break;
    }
  }

  // ---------------------------------------------------------------- render: build
  function bakeBoard(withParts: boolean): void {
    if (!sheet) return;
    const pw = Math.ceil(sheet.w * dpr), ph = Math.ceil(sheet.h * dpr);
    if (!board || board.width !== pw || board.height !== ph) { board = document.createElement('canvas'); board.width = pw; board.height = ph; }
    const ctx = board.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sheet.w, sheet.h);
    ctx.drawImage(sheet.canvas, 0, 0, sheet.w, sheet.h);
    const ox = (sheet.w - sheetW) / 2 - sheetX, oy = (sheet.h - sheetH) / 2 - sheetY;
    if (withParts) {
      for (const s of spots) {
        if (s.open && !s.placed) {
          ctx.save(); ctx.translate(s.x + ox, s.y + oy); ctx.rotate(s.rot);
          tracePath(ctx, s.part.shape, 0, 0, s.w, s.h);
          ctx.fillStyle = 'rgba(120, 92, 64, 0.12)'; ctx.fill();
          dash[0] = 11 * u; dash[1] = 8 * u; ctx.setLineDash(dash);
          ctx.lineWidth = Math.max(2.5, 3.5 * u); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(104, 76, 52, 0.62)'; ctx.stroke();
          ctx.setLineDash(noDash); ctx.restore();
        } else if (s.land < 0 && !s.reserved && s.baked && !waiting(s)) {
          drawBaked(ctx, s.baked, s.x + ox, s.y + oy);
          if (s.part.face) { ctx.save(); ctx.translate(s.x + ox, s.y + oy); drawFace(ctx, s.part.face, s.w, s.h, 0); ctx.restore(); }
        }
      }
    }
    boardDirty = false;
  }

  function drawBoard(ctx: CanvasRenderingContext2D, withParts: boolean): void {
    if (boardDirty) bakeBoard(withParts);
    if (!board || !sheet) return;
    const slide = (1 - easeOutCubic(boardSlide)) * (H - sheetY + 40);
    ctx.drawImage(board, sheetX - (sheet.w - sheetW) / 2, sheetY - (sheet.h - sheetH) / 2 + slide, sheet.w, sheet.h);
  }

  function drawSpotRing(ctx: CanvasRenderingContext2D, s: Spot, strength: number): void {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    const k = 1 + 0.06 * Math.sin(time * 6);
    tracePath(ctx, s.part.shape, 0, 0, s.w * k + 10, s.h * k + 10);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8; ctx.globalAlpha = strength; ctx.stroke();
    ctx.strokeStyle = '#fff6a3'; ctx.lineWidth = 4; ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
  }

  function renderBuild(ctx: CanvasRenderingContext2D): void {
    const livePicture = phase === 'done' || phase === 'alive' || phase === 'send';
    if (tray) drawBaked(ctx, tray, trayX + trayCols * cell / 2, trayY + Math.ceil(Math.max(3, pieces.length) / trayCols) * cell / 2);
    drawBoard(ctx, !livePicture);
    if (livePicture) { renderLivePicture(ctx); return; }
    // Landing pieces: a slam that dips once, drawn live until the board takes them in.
    for (const s of spots) {
      if (s.land < 0 || !s.baked) continue;
      const k = slamScale(clamp01(s.land / LAND_SECONDS), 0.22);
      drawBaked(ctx, s.baked, s.x, s.y, 0, k, k);
      if (s.part.face) { ctx.save(); ctx.translate(s.x, s.y); ctx.scale(k, k); drawFace(ctx, s.part.face, s.w, s.h, 0); ctx.restore(); }
    }
    // Guidance rings: the keyboard target's outline, or the hint's outline.
    const kp = pieces[keyPiece];
    if (phase === 'play' && kbActive && kp && !kp.extra && (kp.state === 'tray' || kp.state === 'held')) {
      const si = nearestSpot(kp.shape, kp.hx, kp.hy, true);
      if (si >= 0) drawSpotRing(ctx, spots[si]!, 0.9);
    }
    if (hand.kind === KIND_HINT && hand.step >= 2 && hand.spot >= 0 && spots[hand.spot]) drawSpotRing(ctx, spots[hand.spot]!, 0.8);
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (p.state === 'gone' || !p.baked) continue;
      if (phase === 'play' && i === keyPiece && (p.state === 'tray' || p.state === 'held') && !hand.kind) squareRing(ctx, p.hx, p.hy, cell, true);
      if (p.state === 'fly') continue;
      const sway = p.state === 'tray' ? Math.cos(time * 1.3 + i * 1.5) * 0.05 : 0;
      let s = 1, rot = sway;
      if (p.state === 'held') { s = p.drag ? 1.14 : 1.1 + 0.03 * Math.sin(time * 7); rot = p.drag ? Math.max(-0.25, Math.min(0.25, (input.pointer.x - p.x) * 0.004)) : sway; }
      else if (p.state === 'nope') { rot = Math.sin(p.t * 38) * 0.22 * (1 - p.t / 0.34); }
      if (hand.kind === KIND_HINT && hand.piece === i && hand.step >= 1 && hand.step <= 3) s *= 1 + 0.1 * Math.abs(Math.sin(time * 6));
      if (p.selected) squareRing(ctx, p.hx, p.hy, cell, false);
      drawBaked(ctx, p.baked, p.x, p.y, rot, s, s);
    }
    // Pieces flying into place: turn and stretch from the tray shape to the outline.
    for (const p of pieces) {
      if (p.state !== 'fly' || !p.baked) continue;
      const s = spots[p.target]!, k = easeOutCubic(clamp01(p.t / FLY_SECONDS));
      const x = lerp(p.fromX, s.x, k), y = lerp(p.fromY, s.y, k) - Math.sin(Math.PI * k) * 24 * u;
      drawBaked(ctx, p.baked, x, y, lerp(0, s.rot, k), lerp(1, s.w / p.w, k), lerp(1, s.h / p.h, k));
    }
  }

  function renderLivePicture(ctx: CanvasRenderingContext2D): void {
    const t = phase === 'alive' ? phaseT : phase === 'send' ? ALIVE_SECONDS : 0;
    if (phase === 'alive') picturePose(pic.id, t, pose); else resetPose(pose);
    let cx = boxX + P / 2 + pose.x / 100 * P, cy = boxY + P / 2 + pose.y / 100 * P, scale = 1, spin = pose.rot;
    if (phase === 'send') {
      const k = easeInOutSine(clamp01(phaseT / SEND_SECONDS));
      cx = lerp(cx, galleryBtn.x, k); cy = lerp(cy, galleryBtn.y, k) - Math.sin(Math.PI * k) * 80 * u;
      scale = lerp(1, btnR * 1.5 / P, k); spin = Math.sin(k * Math.PI) * 0.3;
    }
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(spin); ctx.scale(scale * pose.sx, scale * pose.sy);
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      if (!s.baked) continue;
      if (phase === 'alive') partPose(pic.id, s.part, t, ppose); else resetPose(ppose);
      let jump = 0;
      if (phase === 'done') jump = -Math.sin(Math.PI * clamp01((phaseT - 0.3 - i * 0.06) / 0.3)) * 5;
      const x = (s.part.x - 50 + ppose.x) / 100 * P, y = (s.part.y - 50 + ppose.y + jump) / 100 * P;
      drawBaked(ctx, s.baked, x, y, ppose.rot, ppose.sx, ppose.sy);
      if (s.part.face) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ppose.rot); ctx.scale(ppose.sx, ppose.sy);
        drawFace(ctx, s.part.face, s.w, s.h, ppose.open); ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- render: free
  function renderFree(ctx: CanvasRenderingContext2D): void {
    if (layerDirty) rebuildLayer();
    if (layer && freeSheet) ctx.drawImage(layer, freeX - (freeSheet.w - freeW) / 2, freeY - (freeSheet.h - freeH) / 2, freeSheet.w, freeSheet.h);
    for (const s of live) {
      if (!s.active) continue;
      const k = slamScale(clamp01(s.t / 0.32), 0.3), b = stampBaked(s.shape, s.color), scale = freeW * s.size / 1000 / STAMP_REF * k;
      drawBaked(ctx, b, freeX + s.x / 1000 * freeW, freeY + s.y / 1000 * freeH, s.rot * Math.PI / 180, scale, scale);
    }
    if (!hand.kind) {
      // The keyboard's stamp spot is always shown; it is fainter until a key is used.
      const x = freeX + cursorX * freeW, y = freeY + cursorY * freeH, r = 34 * u;
      ctx.globalAlpha = kbActive ? 1 : 0.45;
      focusRing(ctx, x, y, r);
      ctx.beginPath(); ctx.arc(x, y, 6 * u, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < SHAPES.length; i++) {
      const b = trayBaked(i, selColor), sel = i === selShape;
      if (sel) squareRing(ctx, shapeCellX[i]!, shapeCellY[i]!, freeCell, true);
      const s = sel ? 1.08 + 0.03 * Math.sin(time * 5) : 1;
      drawBaked(ctx, b, shapeCellX[i]!, shapeCellY[i]!, Math.cos(time * 1.2 + i * 1.5) * 0.04, s, s);
    }
    for (let i = 0; i < SWATCHES; i++) {
      if (swatchCycle && i !== selColor) continue;
      const x = swatchX[i]!, y = swatchY[i]!, r = swatchR * (i === selColor ? 0.92 : 0.8);
      ctx.beginPath(); ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(74, 46, 28, 0.26)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r - 4, 0, Math.PI * 2); ctx.fillStyle = PAPER[i]!; ctx.fill();
      if (i === selColor) focusRing(ctx, x, y, r);
    }
  }

  // ---------------------------------------------------------------- render: gallery
  function bakeThumb(i: number): void {
    const inner = frameSize * 0.72;
    let c = thumbs[i];
    const px = Math.ceil(inner * dpr);
    if (!c || c.width !== px) { c = document.createElement('canvas'); c.width = px; c.height = px; thumbs[i] = c; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, inner, inner);
    if (i < 6) {
      const p = PICTURES[i]!, made = (data.made[p.id] ?? 0) > 0, size = inner * 1.04, o = (inner - size) / 2;
      for (const part of p.parts) {
        const x = o + part.x / 100 * size, y = o + part.y / 100 * size, w = part.w / 100 * size, h = part.h / 100 * size;
        if (made) {
          paintShape(ctx, part.shape, PAPER[part.color]!, x, y, w, h, part.rot * Math.PI / 180);
          if (part.face) { ctx.save(); ctx.translate(x, y); drawFace(ctx, part.face, w, h, 0); ctx.restore(); }
        } else {
          ctx.save(); ctx.translate(x, y); ctx.rotate(part.rot * Math.PI / 180);
          tracePath(ctx, part.shape, 0, 0, w, h);
          ctx.fillStyle = 'rgba(120, 92, 64, 0.14)'; ctx.fill();
          dash[0] = 5; dash[1] = 4; ctx.setLineDash(dash); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(104, 76, 52, 0.55)'; ctx.stroke(); ctx.setLineDash(noDash);
          ctx.restore();
        }
      }
    } else {
      const list = data.sheets[i - 6] ?? [], w = inner * 0.96, h = w / SHEET_ASPECT, ox = (inner - w) / 2, oy = (inner - h) / 2;
      ctx.fillStyle = '#fffdf6'; ctx.fillRect(ox, oy, w, h);
      ctx.strokeStyle = 'rgba(104, 76, 52, 0.35)'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, w, h);
      if (!list.length) {
        for (let k = 0; k < 3; k++) {
          ctx.save(); ctx.translate(ox + w * (0.27 + k * 0.23), oy + h * 0.5);
          tracePath(ctx, k === 0 ? 'circle' : k === 1 ? 'star' : 'heart', 0, 0, w * 0.18, w * 0.18);
          dash[0] = 5; dash[1] = 4; ctx.setLineDash(dash); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(104, 76, 52, 0.45)'; ctx.stroke(); ctx.setLineDash(noDash);
          ctx.restore();
        }
      }
      for (let k = 0; k < list.length; k += STAMP_STRIDE) bakeStamp(ctx, list[k]!, list[k + 1]!, list[k + 2]!, list[k + 3]!, list[k + 4]!, list[k + 5]!, ox, oy, w, h);
    }
  }

  function renderGallery(ctx: CanvasRenderingContext2D): void {
    const next = thumbDirty.indexOf(1);
    if (next >= 0) { thumbDirty[next] = 0; bakeThumb(next); }
    const cols = portrait ? 3 : 6;
    for (let row = 0; row < 12 / cols; row++) {
      if (shelf) drawBaked(ctx, shelf, W / 2, frameY[row * cols]! + frameSize * 0.56);
    }
    const inner = frameSize * 0.72;
    for (let i = 0; i < 12; i++) {
      const hover = frameHover[i]!, s = 1 + 0.08 * hover, fb = frames[i % 6];
      const x = frameX[i]!, y = frameY[i]! - hover * 6 * u;
      const tilt = Math.cos(time * 1.1 + i * 1.5) * 0.015 + (i % 2 ? -0.02 : 0.02);
      if (fb) drawBaked(ctx, fb, x, y, tilt, s, s);
      if (i === galleryFocus) squareRing(ctx, x, y, frameSize * s + 24, true);
      ctx.fillStyle = '#fff8ea';
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(s, s);
      ctx.fillRect(-inner / 2 - 4, -inner / 2 - 4, inner + 8, inner + 8);
      const thumb = thumbs[i];
      if (thumb) {
        const id = i < 6 ? PICTURES[i]!.id : undefined;
        if (id && (data.made[id] ?? 0) > 0) shelfPose(id, time + i, pose); else resetPose(pose);
        ctx.save(); ctx.beginPath(); ctx.rect(-inner / 2, -inner / 2, inner, inner); ctx.clip();
        ctx.translate(pose.x / 100 * inner, pose.y / 100 * inner); ctx.rotate(pose.rot); ctx.scale(pose.sx, pose.sy);
        ctx.drawImage(thumb, -inner / 2, -inner / 2, inner, inner);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- input
  function buttonsFor(): Button[] {
    visibleButtons.length = 0;
    visibleButtons.push(home);
    if (mode === 'build') visibleButtons.push(brushBtn);
    if (mode !== 'gallery') visibleButtons.push(galleryBtn);
    visibleButtons.push(sound);
    return visibleButtons;
  }

  function pieceAt(x: number, y: number): number {
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (p.state !== 'tray' && !(p.state === 'held' && p.selected)) continue;
      if (Math.abs(x - p.hx) <= cell / 2 && Math.abs(y - p.hy) <= cell / 2) return i;
    }
    return -1;
  }

  function buildDown(x: number, y: number): void {
    if (phase === 'alive' && phaseT > 1.2) { phase = 'send'; phaseT = 0; return; }
    if (phase !== 'play' && phase !== 'deal') return;
    if (hand.kind === KIND_DEMO) return;
    if (hand.kind === KIND_HINT) handStop();
    lastHint = time;
    const i = pieceAt(x, y);
    const selected = pieces.find(p => p.selected);
    if (i >= 0) {
      const p = pieces[i]!;
      if (selected && selected !== p) { selected.selected = false; selected.state = 'tray'; }
      keyPiece = i;
      if (p.selected) { p.selected = false; p.state = 'tray'; sfx('button', 'B', 0, 0.6); return; }
      held = p; p.state = 'held'; p.drag = false; p.selected = false; p.t = 0;
      downX = x; downY = y;
      sfx('button', 'B'); sfx('whoosh', 'C', 0, 0.3);
      return;
    }
    if (selected) tryPlace(selected, x, y, false);
  }

  function buildMove(x: number, y: number): void {
    if (held && pointerDown && !held.drag && Math.hypot(x - downX, y - downY) > 14) held.drag = true;
  }

  function buildUp(x: number, y: number): void {
    const p = held;
    if (!p || p.state !== 'held') { held = undefined; return; }
    held = undefined;
    if (p.drag) tryPlace(p, x, y, true);
    else { p.selected = true; }
  }

  function buildKey(code: string): void {
    if (phase === 'alive' && phaseT > 1.2) { phase = 'send'; phaseT = 0; return; }
    if (phase !== 'play' || hand.kind === KIND_DEMO) return;
    if (hand.kind === KIND_HINT) handStop();
    lastHint = time;
    if (code.startsWith('Arrow')) {
      const n = pieces.length;
      const p = pieces[keyPiece];
      if (!p) return;
      // Spatial move in the tray grid, skipping empty cells.
      const dc = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0, dr = code === 'ArrowUp' ? -1 : code === 'ArrowDown' ? 1 : 0;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const q = pieces[i]!;
        if (i === keyPiece || (q.state !== 'tray' && q.state !== 'held' && q.state !== 'back')) continue;
        const ddx = (q.cell % trayCols) - (p.cell % trayCols), ddy = Math.floor(q.cell / trayCols) - Math.floor(p.cell / trayCols);
        const along = ddx * dc + ddy * dr;
        if (along <= 0) continue;
        const d = along + Math.abs(ddx * dr + ddy * dc) * 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) moveKeyPiece(dc + dr > 0 ? 1 : -1); else keyPiece = best;
      sfx('hover');
      return;
    }
    const p = pieces[keyPiece];
    if (!p || (p.state !== 'tray' && p.state !== 'held')) { moveKeyPiece(1); return; }
    p.selected = false;
    const si = nearestSpot(p.shape, p.hx, p.hy, true);
    if (si < 0) { p.state = 'nope'; p.t = 0; p.x = p.hx; p.y = p.hy; sfx('miss', 'D', 0, 0.7); return; }
    place(p, si, HOW_KEY);
  }

  function freeDown(x: number, y: number): void {
    if (hand.kind === KIND_FREE) return;
    for (let i = 0; i < SHAPES.length; i++) {
      if (Math.abs(x - shapeCellX[i]!) <= freeCell / 2 && Math.abs(y - shapeCellY[i]!) <= freeCell / 2) {
        selShape = i; sfx('button', 'B'); sayShape(services, SHAPES[i]!); return;
      }
    }
    for (let i = 0; i < SWATCHES; i++) {
      if (Math.hypot(x - swatchX[i]!, y - swatchY[i]!) <= swatchR) { selColor = swatchCycle ? (selColor + 1) % SWATCHES : i; sfx('key', 'D', selColor); return; }
    }
    if (inSheet(x, y)) stamp(x, y);
  }

  function freeKey(code: string): void {
    if (hand.kind === KIND_FREE) return;
    if (code.startsWith('Arrow')) return;
    stamp(freeX + cursorX * freeW, freeY + cursorY * freeH);
    // Each key press drifts the stamp spot a step along a turning path, so mashing keys spreads a collage.
    const a = stamps().length / STAMP_STRIDE * 2.39996;
    cursorX += Math.cos(a) * 0.1; cursorY += Math.sin(a) * 0.13;
    if (cursorX < 0.06 || cursorX > 0.94) cursorX = 0.5 + (0.5 - cursorX) * 0.6;
    if (cursorY < 0.08 || cursorY > 0.92) cursorY = 0.5 + (0.5 - cursorY) * 0.6;
    selShape = (selShape + 1) % SHAPES.length;
    if (selShape === 0 || stamps().length % (STAMP_STRIDE * 3) === 0) selColor = (selColor + 1) % SWATCHES;
  }

  function frameAt(x: number, y: number): number {
    for (let i = 0; i < 12; i++) if (Math.abs(x - frameX[i]!) <= frameSize / 2 && Math.abs(y - frameY[i]!) <= frameSize / 2) return i;
    return -1;
  }

  function openFrame(i: number): void {
    sfx('whoosh', 'D');
    if (i < 6) openBuild(PICTURES[i]!.id); else openFree(i - 6);
  }

  function galleryKey(code: string): void {
    const cols = portrait ? 3 : 6;
    if (code === 'ArrowLeft') galleryFocus = (galleryFocus + 11) % 12;
    else if (code === 'ArrowRight') galleryFocus = (galleryFocus + 1) % 12;
    else if (code === 'ArrowUp') galleryFocus = (galleryFocus - cols + 12) % 12;
    else if (code === 'ArrowDown') galleryFocus = (galleryFocus + cols) % 12;
    else { openFrame(galleryFocus); return; }
    sfx('hover');
  }

  // ---------------------------------------------------------------- stats for checks
  const stats: WorkshopStats = {
    get mode() { return mode; }, get phase() { return phase; }, get phaseTime() { return phaseT; }, get picture() { return pic.id; },
    get tier() { return tierNow(); }, get level() { return data.level; }, get handActive() { return hand.kind !== 0; },
    get stamps() { return mode === 'free' ? stamps().length / STAMP_STRIDE : 0; }, get sheet() { return sheetIndex; }, get fx() { return fx.alive; },
    get learnHits() { return learnHits; }, get learnMisses() { return learnMisses; }, get motorHits() { return motorHits; }, get motorMisses() { return motorMisses; },
    get workMean() { let sum = 0; for (let i = 0; i < workCount; i++) sum += work[i]!; return workCount ? sum / workCount : 0; },
    get workMax() { let max = 0; for (let i = 0; i < workCount; i++) max = Math.max(max, work[i]!); return max; },
    spots() { return spots.map(s => ({ x: s.x, y: s.y, shape: s.part.shape, open: s.open, placed: s.placed, hit: s.hit, reach: s.reach })); },
    pieces() { return pieces.map(p => ({ x: p.hx, y: p.hy, shape: p.shape, state: p.state, extra: p.extra, cell: p.cell })); },
    buttons() { return allButtons.map((b, i) => ({ id: ['home', 'brush', 'gallery', 'sound'][i]!, x: b.x, y: b.y, r: Math.max(48, b.radius), visible: b.visible })); },
    frames() { return Array.from({ length: 12 }, (_, i) => ({ id: i < 6 ? PICTURES[i]!.id : `sheet-${i - 6}`, x: frameX[i]!, y: frameY[i]!, size: frameSize, made: i < 6 ? (data.made[PICTURES[i]!.id] ?? 0) > 0 : (data.sheets[i - 6]?.length ?? 0) > 0 })); },
    swatches() { return Array.from({ length: SWATCHES }, (_, i) => ({ x: swatchX[i]!, y: swatchY[i]!, r: swatchR })); },
    shapeCells() { return SHAPES.map((s, i) => ({ x: shapeCellX[i]!, y: shapeCellY[i]!, size: freeCell, shape: s })); },
    sheetRect() { return mode === 'free' ? { x: freeX, y: freeY, w: freeW, h: freeH } : { x: sheetX, y: sheetY, w: sheetW, h: sheetH }; },
    cellSize() { return cell; },
    data() { return data; },
    resetWork() { workHead = workCount = 0; },
  };

  // ---------------------------------------------------------------- scene
  return {
    stats,
    enter() {
      data = services.save.gameData<WorkshopData>(GAME_ID, defaults());
      sanitize(data, () => services.save.protect());
      sceneT = 0; guard();
      void loadShapeWorkshopArt(services).then(() => {
        setGrain(sprites.get(sprite(ART.grain)));
        home.icon = artName(sprite(ART.home)); brushBtn.icon = artName(sprite(ART.brush)); galleryBtn.icon = artName(sprite(ART.gallery));
        // Rebake everything with the paper grain now that it has loaded.
        layout(services.canvas.width, services.canvas.height); layerDirty = true; thumbDirty.fill(1);
      });
      layout(services.canvas.width, services.canvas.height);
      startPicture(data.currentId || nextPictureId(PICTURE_IDS[PICTURE_IDS.length - 1]!));
      for (const [i, b] of allButtons.entries()) b.popIn(0.05 + i * 0.04);
      startMusic(audio, 'workshop');
      window.__shapeWorkshop = stats;
    },
    pause() { stopMusic(audio); flushLive(); services.save.flush(); pointerDown = false; },
    resume() { guard(); startMusic(audio, 'workshop'); },
    exit() { stopMusic(audio); flushLive(); services.save.flush(); if (window.__shapeWorkshop === stats) delete window.__shapeWorkshop; },
    resize: layout,
    update(dt) {
      const started = performance.now();
      time += dt; sceneT += dt;
      syncSoundIcon(sound, services);
      const buttons = buttonsFor();
      for (const b of allButtons) { b.visible = buttons.includes(b); b.focused = focus >= 0 && buttons[focus] === b; b.update(dt, input.pointer.x, input.pointer.y); }
      updateHand(dt);
      // Warm the stamp art one piece per frame, so thumbnails and stamping never bake many at once.
      if (sceneT > 1) { const k = stampArt.indexOf(undefined); if (k >= 0) stampBaked(Math.floor(k / SWATCHES), k % SWATCHES); }
      if (mode === 'build') updateBuild(dt);
      else if (mode === 'free') updateFree(dt);
      else for (let i = 0; i < 12; i++) frameHover[i] = approach(frameHover[i]!, (i === galleryFocus && (kbActive || frameAt(input.pointer.x, input.pointer.y) === i)) ? 1 : 0, 14, dt);
      fx.update(dt);
      updateMs += performance.now() - started;
    },
    render(view: SceneContext) {
      const started = performance.now(), ctx = view.ctx;
      if (view.width !== W || view.height !== H) layout(view.width, view.height);
      ensureBackground();
      if (bg) ctx.drawImage(bg, 0, 0, W, H);
      if (mode === 'build') renderBuild(ctx); else if (mode === 'free') renderFree(ctx); else renderGallery(ctx);
      fx.render(ctx);
      for (const b of allButtons) b.render(ctx, sprites);
      const fb = visibleButtons[focus];
      if (focus >= 0 && fb) focusRing(ctx, fb.x, fb.y, fb.radius);
      drawHand(ctx);
      drawEnterFade(ctx, W, H, sceneT);
      work[workHead] = updateMs + performance.now() - started; workHead = (workHead + 1) % work.length; workCount = Math.min(work.length, workCount + 1); updateMs = 0;
    },
    handleInput(event: SceneInputEvent) {
      const buttons = visibleButtons;
      if (event.type === 'pointerup') {
        pointerDown = false;
        for (const b of buttons) b.pointerUp(event.info.x, event.info.y);
        if (mode === 'build') buildUp(event.info.x, event.info.y);
        return;
      }
      if (event.type === 'keyup') { for (const b of buttons) b.pointerUp(b.x, b.y); return; }
      if (event.type === 'pointermove') {
        if (Math.hypot(event.info.x - downX, event.info.y - downY) > 40 || pointerDown) kbActive = false;
        if (mode === 'build') buildMove(event.info.x, event.info.y);
        else if (mode === 'gallery') { const i = frameAt(event.info.x, event.info.y); if (i >= 0) galleryFocus = i; }
        return;
      }
      if (event.type === 'pointerdown') {
        focus = -1; kbActive = false; downX = event.info.x; downY = event.info.y;
        for (const b of buttons) if (b.pointerDown(event.info.x, event.info.y)) return;
        if (performance.now() < inputAfter) return;
        pointerDown = true;
        if (mode === 'build') buildDown(event.info.x, event.info.y);
        else if (mode === 'free') freeDown(event.info.x, event.info.y);
        else { const i = frameAt(event.info.x, event.info.y); if (i >= 0) { galleryFocus = i; openFrame(i); } }
        return;
      }
      if (event.type !== 'anykey') return;
      const code = event.info.code;
      kbActive = true;
      if (code === 'Escape') { leave(); return; }
      if (code === 'Tab') { focus = focus + 1 >= buttons.length ? -1 : focus + 1; sfx('hover'); return; }
      if (focus >= 0) {
        const b = buttons[focus];
        if (code.startsWith('Arrow')) { focus = (focus + (code === 'ArrowLeft' || code === 'ArrowUp' ? buttons.length - 1 : 1)) % buttons.length; sfx('hover'); return; }
        if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { if (b) b.pointerDown(b.x, b.y); return; }
        focus = -1;
      }
      if (performance.now() < inputAfter) return;
      if (mode === 'build') buildKey(code); else if (mode === 'free') freeKey(code); else galleryKey(code);
    },
  };
}

declare global { interface Window { __shapeWorkshop?: WorkshopStats } }
