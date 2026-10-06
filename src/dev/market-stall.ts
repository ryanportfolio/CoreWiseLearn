/** Market Stall dev page: ?debug&tier=0..2&step=1..9&rounds=N&seed=N (rounds=0 replays the introduction). */
import { bootApp } from '../app/boot';
import { createMarketStallScene, loadMarketStallArt, type MarketStallStats } from '../games/market-stall/scene';
import {
  accepts, B1, DEMO_PLAN_STEPS, demoPlan, goalCustomer, PENNY, planCustomer, taughtCustomer, valueOf, type CustomerPlan,
} from '../games/market-stall/rules';
import type { Tier } from '../engine/difficulty';

const services = bootApp({
  nav: {
    toNameEntry: () => console.log('[dev] nav.toNameEntry'),
    toHub: () => console.log('[dev] nav.toHub'),
    toGame: id => console.log(`[dev] nav.toGame ${id}`),
    toStickerBook: () => console.log('[dev] nav.toStickerBook'),
  },
});
services.save.selectProfile('LEO');
const missing = await loadMarketStallArt(services);
if (missing.length) console.warn(`[dev] missing Market Stall art: ${[...new Set(missing)].join(', ')}`);
const scene = createMarketStallScene(services);
window.__marketStall = scene.stats;
window.__marketStallChangeCheck = changeCheck;
await services.scenes.push(scene);
services.loop.start();

interface ChangeCheck {
  plans: number; amounts: number; deadEnds: string[]; turnedAway: string[]; noUnitPiece: string[];
  prices: Record<string, string>; control: { plans: number; deadEnds: number };
}
/**
 * The change can always be finished (round RD2). For every step 1 to 9 and tier 0 to 2, `samples` customers from
 * planCustomer (seeded), plus every fixed customer (introduction, demonstrations), each kept once. For each plan, every
 * amount still owed that some sequence of accepted pieces can reach is visited (the amount owed is the whole state, so
 * this covers every order of pieces): a dead end is an amount above 0 where no till kind is accepted. `turnedAway`
 * lists amounts where a piece no bigger than the amount owed is still refused (accepts' till rule), `noUnitPiece` tills
 * without a penny (or a $1 bill at the $ steps). `control` runs the search with the old rule (any piece up to the amount
 * owed is taken) and pennies taken out of the step-8 tills, counting the plans that can get stuck, to show the search
 * finds the dead end round RD2 fixed.
 */
function changeCheck(samples = 4000): ChangeCheck {
  const out: ChangeCheck = { plans: 0, amounts: 0, deadEnds: [], turnedAway: [], noUnitPiece: [], prices: {}, control: { plans: 0, deadEnds: 0 } };
  let seed = 20261006;
  const rnd = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const label = (p: CustomerPlan, t: number): string => `step ${p.content} tier ${t} ${p.dollars ? '$' : ''}${p.parts.join('+')}${p.dollars ? '' : 'c'} pay [${p.pay}] change ${p.change} till [${p.till}]`;
  /** Visit every reachable amount owed; returns the dead ends found (and adds to out unless `quiet`). */
  const search = (p: CustomerPlan, t: number, till: readonly number[], quiet: boolean, naive = false): number => {
    const seen = new Set<number>(), stack = [p.change];
    let dead = 0;
    while (stack.length) {
      const left = stack.pop()!;
      if (seen.has(left)) continue;
      seen.add(left);
      if (!quiet) out.amounts++;
      if (left === 0) continue;
      let any = false;
      for (const k of till) {
        const ok = naive ? valueOf(k, p.dollars) <= left : accepts(k, left, till, till.length, p.dollars);
        if (ok) { any = true; stack.push(left - valueOf(k, p.dollars)); }
        else if (!quiet && valueOf(k, p.dollars) <= left) out.turnedAway.push(`${label(p, t)}: ${k} refused at ${left} owed`);
      }
      if (!any) { dead++; if (!quiet) out.deadEnds.push(`${label(p, t)}: stuck at ${left} owed`); }
    }
    return dead;
  };
  for (let t = 0; t < 3; t++) {
    const tier = t as Tier;
    for (let step = 1; step <= 9; step++) {
      const plans = new Map<string, CustomerPlan>(), prices = new Set<number>();
      const add = (p: CustomerPlan): void => { plans.set(JSON.stringify([p.content, p.dollars, p.parts, p.pay, p.till]), p); };
      if (step === 1) { add(goalCustomer()); add(taughtCustomer(tier)); }
      if ((DEMO_PLAN_STEPS as readonly number[]).includes(step)) add(demoPlan(step, step, tier));
      for (let n = 0; n < samples; n++) add(planCustomer(step, tier, rnd, -1));
      for (const p of plans.values()) {
        out.plans++; prices.add(p.price);
        if (!p.till.includes(p.dollars ? B1 : PENNY)) out.noUnitPiece.push(label(p, t));
        search(p, t, p.till, false);
        if (step === 8 && !p.dollars) {
          out.control.plans++;
          const till = p.till.filter(k => k !== PENNY);
          if (till.length) out.control.deadEnds += search(p, t, till, true, true) > 0 ? 1 : 0;
        }
      }
      const list = [...prices].sort((a, b) => a - b);
      out.prices[`step ${step} tier ${t}`] = `${list.length} prices ${list[0]} to ${list[list.length - 1]}`;
    }
  }
  return out;
}
declare global { interface Window { __marketStall?: MarketStallStats; __marketStallChangeCheck?: (samples?: number) => ChangeCheck } }
