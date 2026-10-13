// Pencil Path's pages are fair for four and five year olds. With the game's own physics, every page:
// - wins with its reference drawing, within its pencil, without touching a no-pencil box;
// - does not win with nothing drawn;
// - still wins for at least MIN_WOBBLY of 300 wobbly copies of that drawing (smooth wobble of up to 0.9 cm along
//   every line, ends up to 1 cm short or long), passed through the shape assist as the game does on pen-up.
// Run: node scripts/check-pencil-path.mjs (Node strips the TypeScript types itself).
import { LEVELS } from '../src/games/pencil-path/levels.ts';
import { inRect, inkLength, simulate, starsFor, tidyStroke } from '../src/games/pencil-path/physics.ts';

const MIN_WOBBLY = 0.65;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function wobbly(strokes) {
  return strokes.map((s) => {
    const pts = [];
    for (let i = 1; i < s.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]) / 0.6));
      for (let k = 0; k < n; k++) pts.push([s[i - 1][0] + ((s[i][0] - s[i - 1][0]) * k) / n, s[i - 1][1] + ((s[i][1] - s[i - 1][1]) * k) / n]);
    }
    pts.push(s[s.length - 1]);
    const ax = rnd() * 6.3, ay = rnd() * 6.3, f = 0.15 + rnd() * 0.25, amp = 0.9 * rnd();
    const out = pts.map((p, i) => [p[0] + Math.sin(i * f + ax) * amp, p[1] + Math.sin(i * f * 1.3 + ay) * amp]);
    const ext = (q, r, d) => {
      const l = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1;
      return [q[0] + ((q[0] - r[0]) / l) * d, q[1] + ((q[1] - r[1]) / l) * d];
    };
    out[0] = ext(out[0], out[1] ?? out[0], (rnd() - 0.5) * 2);
    out[out.length - 1] = ext(out[out.length - 1], out[out.length - 2] ?? out[out.length - 1], (rnd() - 0.5) * 2);
    return out;
  });
}

function touchesZone(level, strokes) {
  return strokes.some((s) => s.some((p, j) => {
    const q = s[Math.max(0, j - 1)], n = Math.max(1, Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 0.3));
    for (let k = 0; k <= n; k++) {
      const x = q[0] + ((p[0] - q[0]) * k) / n, y = q[1] + ((p[1] - q[1]) * k) / n;
      if ((level.noDraw ?? []).some((z) => inRect(x, y, z))) return true;
    }
    return false;
  }));
}

let bad = 0;
LEVELS.forEach((lv, i) => {
  const ink = inkLength(lv.solution);
  const zone = touchesZone(lv, lv.solution);
  const run = simulate(lv, lv.solution);
  const blank = simulate(lv, []);
  let wins = 0;
  for (let k = 0; k < 300; k++) if (simulate(lv, wobbly(lv.solution).map((s) => tidyStroke(lv, s)), 15) === 'win') wins++;
  const rate = wins / 300;
  const ok = run === 'win' && ink <= lv.ink && !zone && blank !== 'win' && rate >= MIN_WOBBLY;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${String(i + 1).padStart(2)} ${lv.name.padEnd(14)} solution=${run} ink=${ink.toFixed(1)}/${lv.ink} stars=${starsFor(lv, ink)} zone=${zone} blank=${blank} wobbly=${(rate * 100).toFixed(0)}%`);
});
process.exitCode = bad ? 1 : 0;
