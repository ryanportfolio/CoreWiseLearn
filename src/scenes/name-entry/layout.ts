/**
 * Name entry layout. Pure numbers computed from the view size so the scene
 * works from 1024x600 to 1920x1080 (designed at 1366x768).
 *
 * Wide mode: the mascot stands bottom right beside the keyboard.
 * Narrow mode: the keyboard needs the full width, so the mascot moves up to
 * the right end of the tray row.
 */

export const MAX_LETTERS = 10;
export const KEY_ROWS = [9, 9, 8] as const;
const MIN_KEY = 96;
const MAX_KEY = 140;
const GAP_RATIO = 0.1;
const PAD_RATIO = 0.12;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export interface NameEntryLayout {
  width: number;
  height: number;
  margin: number;
  wide: boolean;
  /** Profile bubbles. */
  bubbleR: number;
  bubbleY: number;
  labelSize: number;
  bandBottom: number;
  /** Tray row. */
  rowY: number;
  trayX: number;
  trayY: number;
  trayW: number;
  trayH: number;
  trayPad: number;
  slotPitch: number;
  panelW: number;
  panelH: number;
  backX: number;
  backR: number;
  goX: number;
  goR: number;
  /** Keyboard plate and keys. */
  key: number;
  keyGap: number;
  kbX: number;
  kbY: number;
  kbW: number;
  kbH: number;
  /** Mascot: centre x, feet y, sprite size (longest side). */
  mascotX: number;
  mascotGroundY: number;
  mascotSize: number;
}

export function computeLayout(w: number, h: number, out: NameEntryLayout): NameEntryLayout {
  const m = h < 700 ? 8 : 14;
  out.width = w;
  out.height = h;
  out.margin = m;

  const bubbleR = clamp(h * 0.065, 48, 64);
  const labelSize = clamp(bubbleR * 0.52, 22, 32);
  out.bubbleR = bubbleR;
  out.labelSize = labelSize;
  out.bubbleY = m + bubbleR;
  out.bandBottom = m + bubbleR * 2 + labelSize * 0.8;

  const goR = clamp(h * 0.08, 52, 74);
  const backR = clamp(goR * 0.86, 48, 64);
  const rowH = goR * 2 + 6;
  out.goR = goR;
  out.backR = backR;

  // Keyboard key size from the height left over, then from the width.
  const units = 3 + 2 * GAP_RATIO + 2 * PAD_RATIO;
  const colUnits = 9 + 8 * GAP_RATIO + 2 * PAD_RATIO;
  const kbAvailH = h - out.bandBottom - rowH - m * 4;
  const kFromH = kbAvailH / units;
  const wideMascot = clamp(h * 0.34, 170, 330);
  const wideFoot = wideMascot * 0.72;
  const kWide = Math.min(MAX_KEY, kFromH, (w - wideFoot - m * 3) / colUnits);
  const wide = kWide >= MIN_KEY;
  out.wide = wide;
  const k = wide ? kWide : Math.max(MIN_KEY, Math.min(MAX_KEY, kFromH, (w - m * 2) / colUnits));
  out.key = k;
  out.keyGap = k * GAP_RATIO;
  out.kbW = k * colUnits;
  out.kbH = k * units;
  out.kbY = h - m - out.kbH;
  const kbRegionW = wide ? w - wideFoot - m * 3 : w - m * 2;
  out.kbX = m + (kbRegionW - out.kbW) / 2;

  // Tray row sits midway between the profile band and the keyboard.
  out.rowY = (out.bandBottom + out.kbY) / 2;

  let rowRight = w - m;
  if (wide) {
    out.mascotSize = wideMascot;
    out.mascotX = w - m - wideFoot / 2;
    out.mascotGroundY = h - m;
  } else {
    const s = rowH * 1.35;
    out.mascotSize = s;
    const foot = s * 0.75;
    out.mascotX = w - m - foot / 2;
    out.mascotGroundY = out.rowY + rowH / 2 + 2;
    rowRight = w - m - foot - m;
  }

  // Tray, backspace and GO as one centred group.
  const gap = Math.max(10, m);
  const trayPad = clamp(rowH * 0.1, 8, 14);
  const fixed = gap * 2 + backR * 2 + goR * 2 + trayPad * 2;
  const pitch = Math.min(rowH * 0.8, (rowRight - m - fixed) / MAX_LETTERS);
  out.slotPitch = pitch;
  out.trayPad = trayPad;
  out.panelW = pitch * 0.88;
  out.panelH = Math.min(pitch * 1.05, rowH * 0.78);
  out.trayW = pitch * MAX_LETTERS + trayPad * 2;
  out.trayH = out.panelH + trayPad * 2;
  const groupW = out.trayW + fixed - trayPad * 2;
  const groupX = m + (rowRight - m - groupW) / 2;
  out.trayX = groupX;
  out.trayY = out.rowY - out.trayH / 2;
  out.backX = groupX + out.trayW + gap + backR;
  out.goX = out.backX + backR + gap + goR;
  return out;
}

export function emptyLayout(): NameEntryLayout {
  return {
    width: 0, height: 0, margin: 0, wide: true,
    bubbleR: 0, bubbleY: 0, labelSize: 0, bandBottom: 0,
    rowY: 0, trayX: 0, trayY: 0, trayW: 0, trayH: 0, trayPad: 0, slotPitch: 0, panelW: 0, panelH: 0,
    backX: 0, backR: 0, goX: 0, goR: 0,
    key: 0, keyGap: 0, kbX: 0, kbY: 0, kbW: 0, kbH: 0,
    mascotX: 0, mascotGroundY: 0, mascotSize: 0,
  };
}
