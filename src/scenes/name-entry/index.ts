/** Icon-led name entry. Profiles retain identity; keyboard focus never depends on the mouse. */
import { REWARDS_GAME_ID, type AppServices } from '../../app/services';
import type { Scene } from '../../engine/scene';
import { normalizeName, type Profile } from '../../engine/save';
import { accentFor, avatarPath, avatarSpriteName } from '../../app/avatar';
import { createParticleSystem, type ParticleSpawn } from '../../engine/particles';
import { createButton, dispatchDown, dispatchUp, type Button } from '../../ui/button';
import { createKeyboardNavigation, drawPageArrow } from '../../ui/navigation';
import { chunkyPanel, drawCover, drawSprite, OUTLINE } from '../../ui/draw';
import { drawEnterFade } from '../../ui/motion';
import { approach } from '../../ui/tween';
import { createMascotMotion, drawMascotMoving, loadMascotMouths, pokeMascot, resetMascotMotion, stepMascotMotion } from '../../ui/mascot';
import { WIBBLE, markGreeted, pickLine, sayLetter, sayTickle, wibbleVoice } from '../../ui/wibble';
import { playSfx, type SfxName } from '../../audio/sfx';
import { startMusic, stopMusic } from '../../audio/music';
import { createSoundButton, soundArt, loadAllArt, syncSoundIcon, makeTextSprite, drawTextSprite, type TextSprite } from '../hub/shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_LETTERS = 10;
const COLORS = ['#ff5a5f', '#ffb627', '#9b5de5', '#2ec27e', '#2f9bff', '#ff7f3f', '#f25cae', '#1fc8db'];
const BG = 'backgrounds/meadow-sky';
const GO = 'buttons/play-arrow';
const BACK = 'buttons/backspace';
const IDLE = 'mascot/idle';
const CHEER = 'mascot/cheer';
const GUEST = 'avatars/bunny';
const SPARKLE_HUES = [0, 35, 55, 130, 200, 280, 320];
/** Label centre below a profile bubble's edge, and the name field's distance below the top buttons, both in px. */
const LABEL_DROP = 22;
const NAME_DROP = 106;
/**
 * Gap between letter keys in key diameters at uiScale 1. It is divided by uiScale (between MIN_KEY_GAP
 * and MAX_KEY_GAP), so a larger uiScale grows the keys into the gaps. A tight window may close it
 * to MIN_KEY_GAP to keep 96 px keys, or further to keep the keys as large as they were before gaps.
 */
const KEY_GAP = 0.2;
const MIN_KEY_GAP = 0.08;
const MAX_KEY_GAP = 0.25;
/** Largest letter key at uiScale 1, in CSS px. */
const MAX_KEY = 200;
/** Letter glyph size as a fraction of the key diameter. */
const GLYPH_RATIO = 0.62;
/** Width the key page arrow takes at the right edge, with its gap to the keys (the old layout's lane, so as many keys fit beside it). */
const ARROW_LANE = 100;
/** Mascot's drawn extent as fractions of its sprite size: width, and height from the feet up (measured from the idle and cheer art). */
const MASCOT_W = 0.8;
const MASCOT_H = 0.66;
/** Mascot sprite sizes: it shrinks to the room the keys leave and hides below MIN_MASCOT. */
const MIN_MASCOT = 80;
const MAX_MASCOT = 300;
/** Spell-back after Go: letters start at least this far apart, and each waits for the one before to end plus SPELL_GAP. */
const SPELL_SPACING = 0.35;
const SPELL_GAP = 0.05;
/** The longest a spell-back may hold the screen before going on to the hub regardless, seconds. */
const SPELL_LIMIT = 15;
/** Wibble's press area, as fractions of its sprite size: an ellipse BODY_Y above the feet with these half-axes, each at least 48 px. */
const BODY_Y = 0.33;
const BODY_RX = 0.4;
const BODY_RY = 0.33;

/** Largest diameter for n keys with n - 1 gaps of `gap` diameters in `span` px. */
const fitKeys = (span: number, n: number, gap: number): number => span / (n + gap * (n - 1));

export function nameEntryArt(): Record<string, string> {
  return { [BG]: `${BG}.webp`, [GO]: `${GO}.png`, [BACK]: `${BACK}.png`, [IDLE]: `${IDLE}.png`, [CHEER]: `${CHEER}.png`, [GUEST]: 'avatars/bunny.png', 'buttons/home': 'buttons/home.png' };
}
export async function loadNameEntryArt(services: AppServices): Promise<void> {
  const paths = Object.fromEntries(Object.entries(nameEntryArt()).map(([key, path]) => [key, services.art(path)]));
  await Promise.all([services.sprites.loadAll(paths).catch(() => undefined), loadAllArt(services, soundArt(services))]);
}

/** True when a rewards bag holds nothing earned: no stickers, no stars, no finished rounds. */
function nothingEarned(bag: Record<string, unknown>): boolean {
  const { stickers, stars, rounds } = bag;
  return (!Array.isArray(stickers) || stickers.length === 0) && !stars &&
    (!rounds || typeof rounds !== 'object' || Object.values(rounds).every((n) => !n));
}

/**
 * The guest profile the guest button hands out again: the most recent
 * unnamed profile that has not played any game and earned nothing. One
 * that has progress is never reused, so two children who both start as a
 * guest never share stickers or stars.
 */
function unplayedGuest(profiles: readonly Profile[]): Profile | undefined {
  let best: Profile | undefined;
  for (const p of profiles) {
    if (!p.unnamed) continue;
    if (!Object.entries(p.games).every(([id, bag]) => id === REWARDS_GAME_ID && nothingEarned(bag))) continue;
    if (!best || p.lastPlayedAt > best.lastPlayedAt) best = p;
  }
  return best;
}

/** True for one insertion, deletion or substitution. Exact matches use the normal picker. */
function oneEdit(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) === 1;
}

export interface NameEntryDebug {
  readonly name: string; readonly letters: number; readonly leaving: boolean; readonly attract: boolean;
  readonly pose: string; readonly wide: boolean; readonly sfx: Record<string, number>;
  readonly profileIds: string[]; readonly suggestionIds: string[];
  readonly targets: { id: string; x: number; y: number; w: number; h: number }[];
  keyCenter(letter: string): { x: number; y: number } | undefined;
  goCenter(): { x: number; y: number }; backCenter(): { x: number; y: number };
  bubbleCenter(index: number): { x: number; y: number } | undefined;
  art(): { loaded: string[]; missing: string[] };
  /** Name field panel and the mascot's drawn box (empty when hidden), for layout checks. */
  layoutBoxes(): { field: { x: number; y: number; w: number; h: number }; mascot: { x: number; y: number; w: number; h: number }; keySize: number; keyGap: number; glyphPx: number };
}

export function createNameEntryScene(services: AppServices, options: { renameProfileId?: string } = {}): Scene {
  const renaming = options.renameProfileId ? services.save.getProfile(options.renameProfileId) : undefined;
  const { sprites, audio, input } = services;
  let width = services.canvas.width, height = services.canvas.height;
  let time = 0, idle = 0, reaction = 0, leaving = false, leaveTime = 0;
  let name = '', profilePage = 0, keyPage = 0, keyPages = 1, profilePages = 1;
  /** True when the full profile list needs the page arrow; typing that hides it leaves its place reserved. */
  let arrowPlace = false;
  let lastSound = -1, pendingNote = -1, pendingAt = 0, tuneIndex = 0;
  let nameRows = 1, nameColumns = 10, namePitch = 64, compactName = false;
  let nameY = 210, keyTop = 280, keySize = 96, keyGap = 0, mascotSize = 150, fieldX = 0;
  let background: HTMLCanvasElement | undefined;
  let backgroundsReady = false;
  const flashes = new Float32Array(26);
  /** Key a press in the key block's gaps would type, while a mouse rests there; -1 for none. */
  let gapKey = -1;
  /** Fade of the ring drawn on gapKey, 0 to 1. */
  let gapGlow = 0;
  const counts: Record<string, number> = {};
  const particles = createParticleSystem(150);
  /** Key letters, rebuilt by layoutKeys only when the key size changes them. */
  let glyphPx = 62;
  const glyphs = ALPHABET.split('').map((letter) => makeTextSprite(letter, glyphPx, services.canvas.dpr));
  let profileLabels: TextSprite[] = [];
  let profileInitials: TextSprite[] = [];
  let names: Profile[] = [];
  let suggestions = new Set<string>();
  let bubbles: Button[] = [];
  let nameGlyphs: TextSprite[] = [];
  let counter = makeTextSprite('0', 56, services.canvas.dpr);
  const surpriseGlyph = makeTextSprite('✦', 28, services.canvas.dpr, '#fff4ac');
  const questionGlyph = makeTextSprite('?', 40, services.canvas.dpr, '#ffe48c');
  let buttons: Button[] = [];
  const keyboard = createKeyboardNavigation(() => buttons, { input });
  const sound = createSoundButton(services);
  const voice = wibbleVoice(services);
  const motion = createMascotMotion();
  /** True while Go's spell-back is speaking; the hub waits for it. */
  let spelling = false;
  /** Sequence step last seen, and the leave time each name letter bounced at (old timing, or as it was spoken). */
  let spellStep = -1;
  const letterAt = new Float32Array(MAX_LETTERS);
  function sfx(kind: SfxName, index?: number): void {
    counts[kind] = (counts[kind] ?? 0) + 1;
    playSfx(audio, kind, index === undefined ? undefined : { index });
  }
  function active(): void { idle = 0; reaction = 0.35; }
  /**
   * Sparkles spread sideways along the name field and fade within about 0.85 s,
   * before they can drift down over the letter keys.
   */
  function fillSparkle(p: ParticleSpawn, i: number): void {
    const angle = Math.random() * Math.PI * 2;
    const v = 150 + Math.random() * 180;
    p.x = fieldX;
    p.y = nameY;
    p.vx = Math.cos(angle) * v;
    p.vy = Math.sin(angle) * v * 0.25 - 25;
    p.life = 0.55 + Math.random() * 0.3;
    p.size = 6 + Math.random() * 5;
    p.endSize = 2;
    p.gravity = 60;
    p.drag = 0.15;
    p.hue = SPARKLE_HUES[i % SPARKLE_HUES.length] ?? 0;
    p.saturation = 90;
    p.lightness = 58;
    p.alpha = 1;
  }
  function sparkle(n = 5): void {
    active();
    particles.burst(Math.min(n, 80), fillSparkle);
  }
  function refreshName(): void {
    nameGlyphs = name.split('').map((letter) => makeTextSprite(letter, 56, services.canvas.dpr));
    counter = makeTextSprite(String(name.length), 56, services.canvas.dpr);
    profilePage = 0;
    buildProfiles(); layout();
    keyboard.focus(name ? go : guest);
  }
  function typeLetter(index: number): void {
    if (leaving) return;
    active(); flashes[index] = 0.24;
    if (name.length < MAX_LETTERS) { name += ALPHABET[index]; refreshName(); }
    sparkle(5);
    // Input is never throttled. Only notes are coalesced, to at most eight per second; each letter's name always plays.
    pendingNote = index; pendingAt = time;
    sayLetter(services, ALPHABET[index] ?? 'a');
  }
  function backspace(): void {
    if (leaving) return;
    active(); name = name.slice(0, -1); refreshName();
    if (time - lastSound >= 0.125) { sfx('backspace'); lastSound = time; }
  }
  /**
   * Leave for the hub. With `spell`, Wibble spells the typed name back, one letter's name per
   * bouncing letter, then says a greeting, and the hub waits for it; with the sound off or no
   * clips, the letters bounce to their notes on the old quick timing.
   */
  function depart(spell = false): void {
    leaving = true; leaveTime = 0; tuneIndex = 0; pendingNote = -1;
    services.save.save(); sfx('go'); sparkle(32);
    spellStep = -1;
    spelling = false;
    if (spell && name) {
      const clips = name.toLowerCase().split('').map((c) => `letter-${c}`);
      const greet = pickLine(services, 'greet');
      if (greet) clips.push(greet);
      spelling = voice.sequence(WIBBLE, clips, SPELL_SPACING, SPELL_GAP);
      // The greeting stands in for the hub's hello.
      if (spelling && greet) markGreeted();
    }
    for (let i = 0; i < MAX_LETTERS; i++) letterAt[i] = spelling ? 1e6 : i * 0.14;
  }
  function commit(): void {
    if (leaving) return;
    if (!name) { sparkle(); return; }
    if (renaming) {
      if (!services.save.renameProfile(renaming.id, name)) { sparkle(); return; }
      services.save.selectProfile(renaming.id);
    } else services.save.selectProfile(name);
    depart(true);
  }
  function pick(profile: Profile): void {
    if (leaving) return;
    services.save.selectProfile(profile.id); depart();
  }
  const go = createButton({ x: 0, y: 0, radius: 52, fill: '#2ec27e', icon: GO, onPress: commit });
  const back = createButton({ x: 0, y: 0, radius: 48, fill: '#ff9f43', icon: BACK, onPress: backspace });
  function playAsGuest(): void {
    // Decide from the stored progress: another tab may have played as this guest since this one loaded.
    services.save.refreshProfiles();
    const reuse = unplayedGuest(services.save.data.profiles);
    if (reuse) services.save.selectProfile(reuse.id); else services.save.createGuestProfile();
    depart();
  }
  const guest = createButton({ x: 0, y: 0, radius: 48, fill: '#ffe08a', icon: renaming ? 'buttons/home' : GUEST, iconScale: 0.84, onPress: () => { if (!leaving) { if (renaming) { leaving = true; services.nav.toHub(); } else playAsGuest(); } } });
  const profileNext = createButton({ x: 0, y: 0, radius: 48, fill: '#a78bfa', onPress: () => { profilePage = (profilePage + 1) % profilePages; buildProfiles(); layout(); keyboard.focus(profileNext); } });
  const keyNext = createButton({ x: 0, y: 0, radius: 48, fill: '#a78bfa', onPress: () => { keyPage = (keyPage + 1) % keyPages; layout(); keyboard.focus(keyNext); } });
  const keys = ALPHABET.split('').map((_, i) => createButton({ x: 0, y: 0, radius: 48, fill: COLORS[i % COLORS.length]!, onPress: () => typeLetter(i) }));

  function buildProfiles(): void {
    const query = normalizeName(name);
    const sorted = services.save.data.profiles.slice().sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
    const exact = sorted.filter((p) => !query || [p.name, ...(p.aliases ?? [])].some((n) => normalizeName(n).startsWith(query)));
    const near = query.length >= 4 ? sorted.filter((p) => !exact.includes(p) && [p.name, ...(p.aliases ?? [])].some((n) => oneEdit(query, normalizeName(n)))) : [];
    suggestions = new Set(near.map((p) => p.id));
    const matches = renaming ? [] : [...exact, ...near];
    const target = Math.max(96, Math.min(128, 100 * services.config.uiScale));
    const capacity = Math.max(1, Math.min(5, Math.floor((width - 3 * target - 52) / (target + 8))));
    profilePages = Math.max(1, Math.ceil(matches.length / capacity));
    // With an empty name every profile matches, so this is the most the row ever needs while typing.
    arrowPlace = !renaming && services.save.data.profiles.length > capacity;
    profilePage = Math.min(profilePage, profilePages - 1);
    names = matches.slice(profilePage * capacity, (profilePage + 1) * capacity);
    bubbles = names.map((profile) => createButton({ x: 0, y: 0, radius: 48, fill: accentFor(profile), icon: avatarSpriteName(profile), iconScale: 0.76, onPress: () => pick(profile) }));
    profileLabels = names.map((p) => makeTextSprite(p.unnamed ? '' : p.name, 24, services.canvas.dpr));
    profileInitials = names.map((p) => makeTextSprite(p.unnamed ? '' : p.name[0] ?? '', 24, services.canvas.dpr));
    const map = Object.fromEntries(names.map((p) => [avatarSpriteName(p), services.art(avatarPath(p))]));
    void sprites.loadAll(map).catch(() => undefined);
    profileNext.visible = profilePages > 1;
  }

  function layout(): void {
    const scale = services.config.uiScale;
    const target = Math.max(96, Math.min(128, 100 * scale));
    const radius = Math.max(48, Math.min(target / 2, (width - 20) / 8));
    guest.radius = sound.radius = profileNext.radius = radius;
    guest.x = 12 + radius; guest.y = radius + 12;
    sound.x = width - 12 - radius; sound.y = guest.y;
    profileNext.x = sound.x - 2 * radius - 10; profileNext.y = guest.y;
    const profileStart = guest.x + radius + 8;
    // Too narrow for the guest, a profile bubble, the page arrow and the sound button in one row
    // (390 px wide, for example): the arrow takes the sound button's corner, beside the bubbles it
    // pages, and the sound button moves down to the free left end of the Go and Back row (below).
    // The arrow's place depends on the whole profile list, not on what the name matches, so typing
    // that hides the arrow leaves its place empty and no control moves.
    const crowded = arrowPlace && profileStart + 2 * Math.min(radius, 52) + 8 > profileNext.x - radius;
    if (crowded) profileNext.x = sound.x;
    const profileEnd = arrowPlace ? profileNext.x - radius - 8 : sound.x - radius - 8;
    const span = Math.max(96, profileEnd - profileStart);
    bubbles.forEach((b, i) => { b.radius = Math.min(radius, 52); b.x = profileStart + span * (i + 0.5) / Math.max(1, bubbles.length); b.y = guest.y; });
    // Room under the profile bubbles for their name labels, clear of the field.
    nameY = 2 * radius + NAME_DROP;
    go.radius = back.radius = Math.max(48, Math.min(56, target / 2));
    go.x = width - go.radius - 12; go.y = nameY;
    back.x = go.x - go.radius - back.radius - 12; back.y = nameY;
    nameColumns = Math.max(1, Math.floor((back.x - back.radius - 124) / 64));
    compactName = width < 720 || crowded;
    // Reserve the full name before typing so letters cannot push controls offscreen.
    if (compactName) {
      nameColumns = 5; namePitch = Math.min(64, (width - 40) / nameColumns); nameRows = 2;
      go.y = back.y = nameY + 116;
      if (crowded) { sound.x = 12 + radius; sound.y = go.y; }
      keyTop = nameY + 180;
    } else {
      namePitch = 64; nameRows = Math.max(1, Math.ceil(MAX_LETTERS / nameColumns));
      keyTop = nameY + 66 + (nameRows - 1) * 64;
    }
    fieldX = compactName ? width / 2 : (12 + back.x - back.radius - 24) / 2;
    layoutKeys(scale);
    buttons = [guest, ...bubbles, profileNext, go, back, ...keys, keyNext, sound];
    if (!buttons.includes(keyboard.selected as Button) || !keyboard.selected?.visible) keyboard.focus(name ? go : guest);
    background = undefined;
  }
  /**
   * Letter keys fill the free area below the name field: as large as fits, up
   * to MAX_KEY times uiScale, with the uiScale-adjusted KEY_GAP between keys,
   * never under 96 px and never smaller than the touching keys of the layout
   * before gaps. The block is centred (on one page, its last row starts under
   * the first key), and the mascot takes whatever room the keys leave in the
   * bottom-right corner, or hides.
   */
  function layoutKeys(scale: number): void {
    const availH = Math.max(96, height - keyTop - 12);
    const maxKey = Math.max(96, MAX_KEY * scale);
    const gap = Math.min(MAX_KEY_GAP, Math.max(MIN_KEY_GAP, KEY_GAP / scale));
    // The touching-keys layout this replaced, for the same window and uiScale: its key size and rows.
    const oldTarget = Math.max(96, Math.min(128, 100 * scale));
    const oldRows = Math.max(1, Math.min(3, Math.floor(availH / 100)));
    const oldKey = Math.max(96, Math.min(oldTarget, availH / oldRows - 4));
    const qwerty = services.config.keyboardLayout === 'qwerty';
    const order = qwerty ? 'QWERTYUIOPASDFGHJKLZXCVBNM' : ALPHABET;
    const rowSizes = qwerty ? [10, 9, 7] : [9, 9, 8];
    // Keys that fit in a span: 96 px keys with the smallest gap, or the old touching keys where more of
    // those fit (the gap then closes, below), so no page holds fewer keys than the old layout's.
    const count = (span: number, oldCount: number) => Math.max(1, oldCount, Math.floor((span + MIN_KEY_GAP * 96) / (96 * (1 + MIN_KEY_GAP))));
    const across = (span: number) => count(span, Math.floor(span / oldTarget));
    const maxRows = Math.min(3, count(availH, oldRows));
    let areaW = width - 24;
    // One page of the 9/9/8 or 10/9/7 rows whenever they fit the full width; the page arrow's lane is only taken when keys must page.
    const full = maxRows === 3 && across(areaW) >= rowSizes[0]!;
    let cols = rowSizes[0]!, rows = 3, perPage = 26;
    if (!full) {
      // Pages of keys: one page in a grid if the full width allows it, else the fewest pages beside the
      // arrow; then the grid with the largest keys for that many pages.
      let maxCols = Math.min(9, across(areaW));
      if (maxCols * maxRows < 26) { areaW = width - 24 - ARROW_LANE; maxCols = Math.min(9, across(areaW)); }
      const pages = Math.ceil(26 / (maxCols * maxRows));
      let best = -1;
      for (let r = 1; r <= maxRows; r++) for (let c = 1; c <= maxCols; c++) {
        if (Math.ceil(26 / (c * r)) !== pages) continue;
        const d = Math.min(maxKey, fitKeys(areaW, c, gap), fitKeys(availH, r, gap));
        if (d > best + 0.01 || (d > best - 0.01 && c * r > cols * rows)) { best = d; cols = c; rows = r; }
      }
      perPage = cols * rows;
    }
    keyPages = Math.ceil(26 / perPage); keyPage = Math.min(keyPage, keyPages - 1);
    keyNext.visible = keyPages > 1;
    keyNext.x = width - 60; keyNext.y = keyTop + availH / 2;
    const place = (size: number): void => {
      keySize = size;
      keyGap = Math.max(0, Math.min(size * gap, cols > 1 ? (areaW - cols * size) / (cols - 1) : Infinity, rows > 1 ? (availH - rows * size) / (rows - 1) : Infinity));
      const pitch = size + keyGap;
      const top = keyTop + (availH - rows * size - (rows - 1) * keyGap) / 2;
      // Largest mascot whose box, grown from the bottom-right corner, stays below keyTop and clear of every key.
      const pad = 6 + size * 0.05;
      let fit = (height + 10 - keyTop) / MASCOT_H;
      const avoid = (right: number, bottom: number) => { fit = Math.min(fit, Math.max((width - right - pad) / MASCOT_W, (height + 10 - bottom - pad) / MASCOT_H)); };
      keys.forEach((b) => { b.visible = false; });
      for (let index = keyPage * perPage; index < Math.min(26, (keyPage + 1) * perPage); index++) {
        const local = index - keyPage * perPage;
        let row = Math.floor(local / cols), col = local % cols, inRow = Math.min(cols, 26 - keyPage * perPage - row * cols);
        if (full) { row = index < rowSizes[0]! ? 0 : index < rowSizes[0]! + rowSizes[1]! ? 1 : 2; col = index - (row === 0 ? 0 : row === 1 ? rowSizes[0]! : rowSizes[0]! + rowSizes[1]!); inRow = rowSizes[row]!; }
        const b = keys[ALPHABET.indexOf(order[index]!)]!;
        // On one page, the last (shortest) row starts under the first key, leaving the corner beside it to Wibble.
        const lead = full && row === 2 ? rowSizes[0]! : inRow;
        b.x = 12 + (areaW - lead * size - (lead - 1) * keyGap) / 2 + col * pitch + size / 2;
        b.y = top + row * pitch + size / 2;
        b.radius = size / 2; b.visible = true;
        avoid(b.x + size / 2, b.y + size / 2);
      }
      if (keyNext.visible) avoid(keyNext.x + keyNext.radius, keyNext.y + keyNext.radius);
      mascotSize = Math.min(MAX_MASCOT, fit);
    };
    // Where the gap would make keys smaller than the old touching keys, the gap closes instead (as far as the grid fits).
    const size = Math.max(96, Math.min(maxKey, fitKeys(areaW, cols, gap), fitKeys(availH, rows, gap)), Math.min(oldKey, areaW / cols, availH / rows));
    place(size);
    if (mascotSize < MIN_MASCOT) mascotSize = 0;
    const px = Math.round(size * GLYPH_RATIO);
    if (px !== glyphPx) { glyphPx = px; for (let i = 0; i < 26; i++) glyphs[i] = makeTextSprite(ALPHABET[i]!, px, services.canvas.dpr); }
  }
  /**
   * For a press in the gaps of the key block (within half a key pitch of some visible key), the
   * visible key whose centre is nearest, so the whole block stays a target. Farther out, none.
   */
  function keyNear(x: number, y: number): Button | undefined {
    const reach = (keySize + keyGap) / 2;
    let near = false, best: Button | undefined, bestD = Infinity;
    for (const b of keys) {
      if (!b.visible) continue;
      const dx = x - b.x, dy = y - b.y, d = dx * dx + dy * dy;
      if (Math.abs(dx) <= reach && Math.abs(dy) <= reach) near = true;
      if (d < bestD) { bestD = d; best = b; }
    }
    return near ? best : undefined;
  }
  /** Wibble's feet, where render draws it. */
  const wibbleX = (): number => width - mascotSize * 0.4;
  const wibbleGround = (): number => height + 10;
  /**
   * True when (x, y) is on Wibble's body: an ellipse at least 96 px across each way, kept inside
   * the screen (Wibble's feet sit below its bottom edge) so all of it can be pressed.
   */
  function onWibble(x: number, y: number): boolean {
    if (mascotSize <= 0) return false;
    const rx = Math.max(48, mascotSize * BODY_RX), ry = Math.max(48, mascotSize * BODY_RY);
    const cx = Math.min(wibbleX(), width - rx), cy = Math.min(wibbleGround() - mascotSize * BODY_Y, height - ry);
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  /** A click on Wibble: it jiggles (with the sound off too) and, unless it is already talking, says a ticklish line. */
  function poke(): void {
    pokeMascot(motion);
    sayTickle(services);
  }
  function rebuildBackground(): void {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * services.canvas.dpr); canvas.height = Math.round(height * services.canvas.dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.scale(services.canvas.dpr, services.canvas.dpr); const img = sprites.get(BG); if (img) drawCover(ctx, img, width, height); else { ctx.fillStyle = '#8fd8ff'; ctx.fillRect(0, 0, width, height); } }
    background = canvas;
  }
  void loadNameEntryArt(services).then(() => { backgroundsReady = true; background = undefined; });
  const scene: Scene = {
    enter() {
      time = 0; idle = 0; name = renaming && !renaming.unnamed ? renaming.name : ''; leaving = false; profilePage = keyPage = 0; pendingNote = -1;
      particles.clear(); refreshName(); keyboard.focus(name ? go : guest);
      if (renaming) void sprites.load(avatarSpriteName(renaming), services.art(avatarPath(renaming))).catch(() => undefined);
      resetMascotMotion(motion); spelling = false;
      voice.preload(WIBBLE);
      // Letter names and the greeting after Go first; the hub's lines can follow.
      voice.prioritize(WIBBLE, WIBBLE.clips.filter((c) => c.startsWith('greet-') || c.startsWith('letter-')));
      void loadMascotMouths(services, [IDLE, CHEER]);
      startMusic(audio, 'name-entry');
    },
    // Leaving, or being covered, silences Wibble.
    exit() { voice.stop(); stopMusic(audio); },
    pause() { voice.stop(); stopMusic(audio); },
    resume() { time = 0; startMusic(audio, 'name-entry'); },
    resize(w, h) { width = w; height = h; buildProfiles(); layout(); },
    update(dt) {
      time += dt; idle += dt; reaction = Math.max(0, reaction - dt);
      for (let i = 0; i < flashes.length; i++) flashes[i] = Math.max(0, flashes[i]! - dt);
      if (pendingNote >= 0 && time - pendingAt >= 0.03 && time - lastSound >= 0.125) { sfx('key', pendingNote); lastSound = time; pendingNote = -1; }
      for (const b of buttons) b.update(dt, input.pointer.inside ? input.pointer.x : -9999, input.pointer.inside ? input.pointer.y : -9999);
      syncSoundIcon(sound, services); particles.update(dt);
      // Keys light up by themselves when the pointer is on them; in the gaps between keys a press
      // still types the nearest key, so that key gets a soft ring while a mouse rests there.
      let near = -1;
      if (!leaving && time >= 0.4 && input.pointer.inside && input.pointer.type === 'mouse') {
        // A Button under the pointer takes the press first (dispatchDown), so then no ring.
        let onButton = false;
        for (const b of buttons) if (b.hovered) { onButton = true; break; }
        const k = onButton ? undefined : keyNear(input.pointer.x, input.pointer.y);
        if (k) near = keys.indexOf(k);
      }
      if (near >= 0) gapKey = near;
      gapGlow = approach(gapGlow, near >= 0 ? 1 : 0, 10, dt);
      if (gapGlow <= 0) gapKey = -1;
      if (leaving && spelling) {
        leaveTime += dt;
        // Each letter bounces, with its note, as Wibble says its name; then the greeting, then the hub.
        const step = voice.sequenceIndex;
        if (step !== spellStep && step >= 0 && step < name.length) { letterAt[step] = leaveTime; sfx('key', ALPHABET.indexOf(name[step]!)); }
        spellStep = step;
        if ((!voice.busy() && leaveTime > 0.6) || leaveTime > SPELL_LIMIT) { leaveTime = -100; spelling = false; services.nav.toHub(); }
      } else if (leaving) {
        leaveTime += dt;
        if (tuneIndex < name.length && leaveTime > 0.15 + tuneIndex * 0.14) { sfx('key', ALPHABET.indexOf(name[tuneIndex]!)); tuneIndex++; }
        if (leaveTime > Math.max(0.6, name.length * 0.14 + 0.3)) { leaveTime = -100; services.nav.toHub(); }
      }
      stepMascotMotion(motion, dt, voice.isSpeaking(), voice.speakingLevel());
    },
    render({ ctx }) {
      if (!background) rebuildBackground();
      if (background) ctx.drawImage(background, 0, 0, width, height);
      const available = compactName ? width - 12 : back.x - back.radius - 24;
      chunkyPanel(ctx, 12, nameY - 51, Math.max(96, available - 12), compactName ? 102 : 102 + (nameRows - 1) * 64, '#fff4dc', OUTLINE, 24, 5);
      for (let i = 0; i < nameGlyphs.length; i++) {
        const x = (compactName ? (width - nameColumns * namePitch) / 2 : 26) + namePitch * (i % nameColumns + 0.5);
        const y = nameY + (compactName ? -24 + Math.floor(i / nameColumns) * 48 : Math.floor(i / nameColumns) * 64);
        const bounce = leaving ? Math.max(0, Math.sin(Math.min(1, Math.max(0, (leaveTime - letterAt[i]!) / 0.35)) * Math.PI)) * 12 : 0;
        ctx.save(); ctx.translate(x, y - bounce);
        if (compactName) ctx.scale(Math.min(0.58, namePitch / 64), 0.58);
        chunkyPanel(ctx, -29, -38, 58, 76, COLORS[i % COLORS.length]!, OUTLINE, 14, 3);
        drawTextSprite(ctx, nameGlyphs[i]!, 0, 0); ctx.restore();
      }
      if (name.length && !compactName) {
        drawTextSprite(ctx, counter, available - 42, nameY - 6);
        for (let i = 0; i < name.length; i++) { ctx.beginPath(); ctx.arc(available - 66 + i * 6, nameY + 33, 2.2, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill(); }
      }
      for (const b of buttons) b.render(ctx, sprites);
      if (gapKey >= 0 && gapGlow > 0) {
        const b = keys[gapKey]!;
        if (b.visible && !b.hovered) {
          ctx.globalAlpha = 0.4 * gapGlow;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.radius + 9, 0, Math.PI * 2);
          ctx.lineWidth = 12; ctx.strokeStyle = '#fff8b2'; ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      for (let i = 0; i < keys.length; i++) {
        const b = keys[i]!; if (!b.visible) continue;
        if (flashes[i]! > 0) { ctx.beginPath(); ctx.arc(b.x, b.y, b.radius - 5, 0, Math.PI * 2); ctx.lineWidth = Math.max(7, b.radius * 0.1); ctx.strokeStyle = '#fff'; ctx.stroke(); }
        drawTextSprite(ctx, glyphs[i]!, b.x, b.y);
      }
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i]!;
        const p = names[i]!;
        // Label below the bubble with a gap, shrunk to the bubble's width; the initial sits inside the circle's top-left.
        if (profileLabels[i] && !p.unnamed) { const label = profileLabels[i]!; const k = Math.min(1, (b.radius * 2 + 4) / label.w); ctx.drawImage(label.canvas, b.x - label.w * k / 2, b.y + b.radius + LABEL_DROP - label.h * k / 2, label.w * k, label.h * k); }
        if (!p.unnamed) drawTextSprite(ctx, profileInitials[i]!, b.x - b.radius * 0.3, b.y - b.radius * 0.3);
        if (suggestions.has(p.id)) drawTextSprite(ctx, questionGlyph, b.x + b.radius - 6, b.y - b.radius + 8);
      }
      if (!sprites.get(GUEST)) { drawSprite(ctx, sprites, IDLE, guest.x, guest.y, guest.radius * 1.7); }
      // A small surprise glint makes the no-name animal distinct from saved profiles.
      if (!renaming) drawTextSprite(ctx, surpriseGlyph, guest.x + guest.radius * 0.6, guest.y - guest.radius * 0.5);
      else drawSprite(ctx, sprites, avatarSpriteName(renaming), width / 2, guest.y, 100);
      drawPageArrow(ctx, profileNext, 1); drawPageArrow(ctx, keyNext, 1);
      if (name && !leaving) { ctx.beginPath(); ctx.arc(go.x, go.y, go.radius - 5 + Math.sin(time * 3) * 2, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = '#fff8ad'; ctx.stroke(); }
      if (mascotSize > 0) drawMascotMoving(ctx, sprites, motion, reaction > 0 ? CHEER : IDLE, IDLE, wibbleX(), wibbleGround(), mascotSize, Math.sin(time * 2) * 3);
      particles.render(ctx); drawEnterFade(ctx, width, height, time);
    },
    handleInput(event) {
      if (leaving || time < 0.4) return;
      if (event.type === 'pointerdown') {
        active();
        if (!dispatchDown(buttons, event.info.x, event.info.y)) {
          const k = keyNear(event.info.x, event.info.y);
          if (k) k.pointerDown(k.x, k.y);
          // Keys never poke Wibble here: every key types a letter, so Wibble answers clicks only.
          else if (onWibble(event.info.x, event.info.y)) poke();
        }
      }
      else if (event.type === 'pointerup') dispatchUp(buttons, event.info.x, event.info.y);
      else if (event.type === 'keydown') {
        if (event.info.repeat) return;
        const { key } = event.info;
        if (key === ' ') { sparkle(); return; }
        if (key === 'Backspace') { backspace(); return; }
        if (key.length === 1 && /^[a-z]$/i.test(key)) { typeLetter(ALPHABET.indexOf(key.toUpperCase())); return; }
        if (keyboard.key(key)) { active(); return; }
        sparkle(/^\d$/.test(key) ? Number(key) : 5);
      }
    },
    // Every control here is a Button and reports itself. The one press target that is not a
    // Button is the gaps of the key block, where pointerdown types the nearest key.
    hoverAt(x, y) {
      if (leaving || time < 0.4) return null;
      return keyNear(x, y) || onWibble(x, y) ? 'press' : null;
    },
  };
  if (import.meta.env.DEV) {
    const center = (b: Button) => ({ x: b.x, y: b.y });
    const debug: NameEntryDebug = {
      get profileIds() { return names.map((p) => p.id); }, get suggestionIds() { return [...suggestions]; },
      get targets() { return buttons.filter((b) => b.visible).map((b) => { const r = Math.max(48, b.radius); const key = keys.indexOf(b); return { id: key >= 0 ? 'key:' + ALPHABET[key] : b === go ? 'go' : b === back ? 'back' : b === guest ? 'guest' : b === sound ? 'sound' : b === keyNext ? 'key-next' : b === profileNext ? 'profile-next' : 'profile:' + names[bubbles.indexOf(b)]?.id, x: b.x - r, y: b.y - r, w: r * 2, h: r * 2 }; }); },
      get name() { return name; }, get letters() { return name.length; }, get leaving() { return leaving; },
      get attract() { return idle > 5; }, get pose() { return reaction > 0 ? CHEER : IDLE; }, get wide() { return keyPages === 1; }, sfx: counts,
      keyCenter(letter) { const b = keys[ALPHABET.indexOf(letter.toUpperCase())]; return b?.visible ? center(b) : undefined; },
      goCenter: () => center(go), backCenter: () => center(back), bubbleCenter(i) { const b = bubbles[i]; return b ? center(b) : undefined; },
      layoutBoxes() {
        const available = compactName ? width - 12 : back.x - back.radius - 24;
        return {
          field: { x: 12, y: nameY - 51, w: Math.max(96, available - 12), h: compactName ? 102 : 102 + (nameRows - 1) * 64 },
          mascot: { x: width - mascotSize * MASCOT_W, y: height + 10 - mascotSize * MASCOT_H, w: mascotSize * MASCOT_W, h: mascotSize * MASCOT_H },
          keySize, keyGap, glyphPx,
        };
      },
      art() { const all = Object.keys(nameEntryArt()); return { loaded: all.filter((n) => sprites.get(n)), missing: backgroundsReady ? all.filter((n) => !sprites.get(n)) : [] }; },
    };
    Object.assign(window, { __nameEntry: debug });
  }
  return scene;
}
