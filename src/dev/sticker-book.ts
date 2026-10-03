/**
 * Dev entry for the sticker book. `?seed` writes the MIA test profile with
 * a few stickers, two of them not yet seen; opening the book marks the ones
 * on the first page as seen. `?pages=N` (1 to 8) shows a collection of N
 * full pages, repeating the real stickers, to check the page dots.
 *
 * `?fit` shows test art of different shapes to check every sticker stays
 * inside its dotted circle: wide (3:1 and 2:1), tall (1:3 and 1:2) and square
 * art that fills its corners, plus two real stickers. Each shape appears
 * twice side by side, earned then not earned, under a test profile FIT.
 */

import { STICKERS, stickerSpriteName, type StickerDef } from '../app/stickers';
import { rewards, type AppServices } from '../app/services';
import { createStickerBookScene, loadStickerBookAssets } from '../scenes/sticker-book';
import { bootDev, instrumentWork, seedFromQuery } from '../scenes/hub/dev-support';
import { loadArt } from '../scenes/hub/shared';

const services = bootDev();
seedFromQuery(services);
const query = new URLSearchParams(location.search);

interface TestShape {
  id: string;
  w: number;
  h: number;
  color: string;
  /** Real art path instead of drawn test art. */
  path?: string;
}

const SHAPES: TestShape[] = [
  { id: 'wide-3x1', w: 900, h: 300, color: '#ef4444' },
  { id: 'tall-1x3', w: 300, h: 900, color: '#22c55e' },
  { id: 'square-full', w: 512, h: 512, color: '#3b82f6' },
  { id: 'owl', w: 512, h: 512, color: '#ffffff', path: 'avatars/owl.png' },
  { id: 'wide-2x1', w: 800, h: 400, color: '#f97316' },
  { id: 'tall-1x2', w: 400, h: 800, color: '#a855f7' },
  { id: 'square-round', w: 512, h: 512, color: '#eab308' },
  { id: 'crab', w: 512, h: 512, color: '#ffffff', path: 'creatures/crab.png' },
];

/** Test art: a filled rounded box with an outline and two windows, filling its whole image. */
function testArt(shape: TestShape): string {
  const canvas = document.createElement('canvas');
  canvas.width = shape.w;
  canvas.height = shape.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const line = 16;
  ctx.lineWidth = line;
  ctx.strokeStyle = '#2b1d3a';
  ctx.fillStyle = shape.color;
  ctx.beginPath();
  if (shape.id === 'square-round') ctx.arc(shape.w / 2, shape.h / 2, shape.w / 2 - line / 2, 0, Math.PI * 2);
  else ctx.roundRect(line / 2, line / 2, shape.w - line, shape.h - line, Math.min(shape.w, shape.h) * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const s = Math.min(shape.w, shape.h) * 0.22;
  for (const f of [0.3, 0.7]) {
    const x = shape.w >= shape.h ? shape.w * f : shape.w / 2;
    const y = shape.w >= shape.h ? shape.h / 2 : shape.h * f;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}

async function fitStickers(app: AppServices): Promise<StickerDef[]> {
  const list: StickerDef[] = [];
  for (const shape of SHAPES) {
    for (const suffix of ['earned', 'not-earned']) {
      const id = `fit-${shape.id}-${suffix}`;
      const def: StickerDef = { id, path: shape.path ?? `fit/${shape.id}.png`, game: 'dev' };
      if (!shape.path) await loadArt(app, { name: stickerSpriteName(id), url: testArt(shape), kind: 'blob' });
      list.push(def);
    }
  }
  app.save.selectProfile('FIT');
  const bag = rewards(app);
  bag.stickers = list.filter((def) => !def.id.endsWith('-not-earned')).map((def) => def.id);
  bag['seen'] = list.map((def) => def.id);
  delete bag['positions'];
  app.save.flush();
  return list;
}

const pages = Math.round(Number(query.get('pages') ?? '0'));
let stickers: readonly StickerDef[] | undefined;
if (query.has('fit')) stickers = await fitStickers(services);
else if (pages >= 1 && pages <= 8) {
  stickers = Array.from({ length: pages * 8 }, (_, i) => STICKERS[i % STICKERS.length]!);
}

await loadStickerBookAssets(services, stickers);
instrumentWork(services);
await services.scenes.push(createStickerBookScene(services, stickers ? { stickers } : {}));
services.loop.start();
