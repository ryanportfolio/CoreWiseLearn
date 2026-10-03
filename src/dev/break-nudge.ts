/**
 * Dev entry for the break nudge. A plain coloured stand-in scene runs
 * underneath (an orbiting ball and a counter of its updates, exposed as
 * window.__belowUpdates) so a check can confirm it freezes under the
 * overlay and resumes after. Press N on the stand-in to open the nudge again.
 *
 * `?fresh` pushes the nudge before the stand-in has drawn a frame, as when a
 * game restores straight into its rest screen: the stand-in then runs live
 * under the dim for about a second before the snapshot freezes it.
 */

import type { Scene } from '../engine/scene';
import { chunkyCircle } from '../ui/draw';
import { createBreakNudgeScene, loadBreakNudgeAssets } from '../scenes/break-nudge';
import { bootDev, instrumentWork, seedFromQuery } from '../scenes/hub/dev-support';

const services = bootDev();
seedFromQuery(services);

const state = { updates: 0 };
(window as unknown as { __belowUpdates: () => number }).__belowUpdates = () => state.updates;

function createStandIn(): Scene {
  let angle = 0;
  return {
    update(dt) {
      state.updates++;
      angle += dt * 1.5;
    },
    render({ ctx, width, height }) {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#86efac';
      ctx.fillRect(0, height * 0.7, width, height * 0.3);
      const r = Math.min(width, height) * 0.25;
      chunkyCircle(ctx, width / 2 + Math.cos(angle) * r, height / 2 + Math.sin(angle) * r, 50, '#f97316');
    },
    handleInput(event) {
      if (event.type === 'anykey' && event.info.code === 'KeyN') void services.scenes.push(createBreakNudgeScene(services));
    },
  };
}

await loadBreakNudgeAssets(services);
instrumentWork(services);
await services.scenes.push(createStandIn());
services.loop.start();
// Without ?fresh, let the stand-in run past the nudge's settle time so the snapshot is taken at once.
if (!new URLSearchParams(location.search).has('fresh')) await new Promise((resolve) => setTimeout(resolve, 1200));
await services.scenes.push(createBreakNudgeScene(services));
