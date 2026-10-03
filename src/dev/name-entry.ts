/**
 * Dev entry for the name entry scene. Navigation calls are logged and
 * counted on window.__navCalls so a browser script can check them.
 */

import { bootApp } from '../app/boot';
import { createNameEntryScene, loadNameEntryArt } from '../scenes/name-entry';

const navCalls: string[] = [];
(window as unknown as { __navCalls: string[] }).__navCalls = navCalls;

function log(call: string): void {
  navCalls.push(call);
  console.log(`nav.${call}`);
}

const services = bootApp({
  nav: {
    toNameEntry: () => log('toNameEntry()'),
    toHub: () => log('toHub()'),
    toGame: (id) => log(`toGame(${id})`),
    toStickerBook: () => log('toStickerBook()'),
  },
});

await loadNameEntryArt(services);
const scene = createNameEntryScene(services);

// Work time per frame (update + render), separate from loop.stats, which measures the frame interval.
const work = new Float32Array(240);
let workIndex = 0;
let workCount = 0;
let updateMs = 0;
const update = scene.update.bind(scene);
const render = scene.render.bind(scene);
scene.update = (dt) => {
  const t0 = performance.now();
  update(dt);
  updateMs += performance.now() - t0;
};
scene.render = (view, alpha) => {
  const t0 = performance.now();
  render(view, alpha);
  work[workIndex] = updateMs + performance.now() - t0;
  updateMs = 0;
  workIndex = (workIndex + 1) % work.length;
  if (workCount < work.length) workCount++;
};
(window as unknown as { __workStats: () => { mean: number; max: number; count: number } }).__workStats = () => {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < workCount; i++) {
    const v = work[i] ?? 0;
    sum += v;
    if (v > max) max = v;
  }
  return { mean: workCount ? sum / workCount : 0, max, count: workCount };
};

await services.scenes.push(scene);
services.loop.start();
