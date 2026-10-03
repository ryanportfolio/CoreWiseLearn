/**
 * Dev-entry helpers for the hub, sticker book and break nudge pages. Only
 * imported from src/dev/*.ts, so none of this reaches the production build.
 */

import { bootApp } from '../../app/boot';
import { rewards, type AppServices, type Nav } from '../../app/services';
import { artReport } from './shared';

type DevWindow = Window & {
  __navCalls?: string[];
  __workStats?: () => { mean: number; max: number; count: number };
  __art?: () => { found: string[]; missing: string[] };
};

/**
 * Boot with navigation stubs that log and record each call on window.__navCalls.
 * `after` runs a dev page's own action after a call is logged.
 */
export function bootDev(after: Partial<Nav> = {}): AppServices {
  const w = window as DevWindow;
  const calls: string[] = [];
  w.__navCalls = calls;
  const log = (call: string): void => {
    calls.push(call);
    console.log(`nav.${call}`);
  };
  const services = bootApp({
    nav: {
      toNameEntry: (profileId) => { log('toNameEntry()'); after.toNameEntry?.(profileId); },
      toHub: () => { log('toHub()'); after.toHub?.(); },
      toGame: (id) => { log(`toGame(${id})`); after.toGame?.(id); },
      toStickerBook: () => { log('toStickerBook()'); after.toStickerBook?.(); },
    },
  });
  w.__art = artReport;
  return services;
}

/**
 * `?seed` (or `?seed=mia`) writes a test profile MIA with a few stickers, two
 * of them not yet seen in the book. `?seed=empty` clears all save data so
 * there is no active profile.
 */
export function seedFromQuery(services: AppServices): void {
  const seed = new URLSearchParams(location.search).get('seed');
  if (seed === null) return;
  if (seed === 'empty') {
    services.save.reset();
    return;
  }
  services.save.selectProfile('MIA');
  const bag = rewards(services);
  bag.stickers = ['clownfish', 'turtle', 'turtle', 'crab', 'starfish', 'starfish', 'starfish'];
  bag.stars = 9;
  bag.rounds = { 'bubble-pop': 3 };
  bag['seen'] = ['clownfish', 'turtle'];
  services.save.flush();
}

/** Time spent in scene update + render per frame (loop.stats measures the frame interval, not the work). */
export function instrumentWork(services: AppServices): void {
  const scenes = services.scenes;
  const work = new Float32Array(240);
  let index = 0;
  let count = 0;
  let updateMs = 0;
  const update = scenes.update.bind(scenes);
  const render = scenes.render.bind(scenes);
  scenes.update = (dt) => {
    const t0 = performance.now();
    update(dt);
    updateMs += performance.now() - t0;
  };
  scenes.render = (view, alpha) => {
    const t0 = performance.now();
    render(view, alpha);
    work[index] = updateMs + performance.now() - t0;
    updateMs = 0;
    index = (index + 1) % work.length;
    if (count < work.length) count++;
  };
  (window as DevWindow).__workStats = () => {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < count; i++) {
      const v = work[i] ?? 0;
      sum += v;
      if (v > max) max = v;
    }
    return { mean: count ? sum / count : 0, max, count };
  };
}
