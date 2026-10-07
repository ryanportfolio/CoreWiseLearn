/**
 * Market Stall's spoken clips: the money folder (public/voice/money/, rendered from scripts/voice/lines/money.json in
 * the market-stall lad's voice, Gemini's Puck), played on the shared voice channel (src/audio/voice-player.ts), so two
 * clips never sound together. A clip plays only when its file is in that folder at build time; a missing clip is
 * skipped silently and causes no request.
 *
 * Every sentence and every amount is one whole clip; clips are never joined to make one. The customer's lines wait
 * their turn in a short queue: each starts once the clip before it has ended plus that entry's gap. Coin and bill names
 * on pick-up play at once and never cut the customer off (a name asked for while the customer speaks is skipped).
 */
import type { Audio } from '../../engine/audio';
import { voiceFolder, voicePlayer, type VoiceFolder } from '../../audio/voice-player';

export const MONEY_VOICE: VoiceFolder = voiceFolder('money', Object.keys(import.meta.glob('/public/voice/money/*.mp3', { query: '?url', import: 'default' })));

/** Gap after the clip before, in seconds: between the customer's opening lines, and before the change total. */
export const OPENING_GAP = 0.25, TOTAL_GAP = 0.12;

/** Clip for an amount said on its own: "Three cents.", "Two dollars.", "One dollar and five cents." (`amount-N`). */
export function amountClip(cents: number): string {
  if (cents < 100) return `cents-${cents}`;
  return cents % 100 === 0 ? `dollars-${cents / 100}` : `amount-${cents}`;
}
/** "That costs <price>." for a price in cents. */
export const costsClip = (cents: number): string => `costs-${cents}`;
/** "Here's <payment>." for a payment in cents. */
export const payClip = (cents: number): string => `pay-${cents}`;
/** "I'd like the <item>, please." for one item; with a second item, "I'd like the <item> and the <item2>, please." */
export const itemClip = (good: number, good2 = -1): string => (good2 < 0 ? `item-${good}` : `item-${good}-${good2}`);
export const QUESTION_CLIP = 'how-much-change';

/** The queue: clip names and their gaps, oldest first (fixed arrays; nothing allocates while it plays). */
const Q_MAX = 8;
const qClip: string[] = Array<string>(Q_MAX).fill('');
const qGap = new Float32Array(Q_MAX);
let qHead = 0, qLen = 0;
/** Seconds the channel has been quiet (counted while nothing plays), and whether the clip playing came from the queue. */
let quiet = 99, fromQueue = false;
/** With `?debug` in the address: every clip as it starts and ends, for browser checks (window.__msVoice). */
let log: { clip: string; at: number; end: number }[] | undefined, logged = '';

/** Load these clips next, ahead of anything else waiting. Call when a customer arrives, not per frame. */
export function prioritizeVoice(audio: Audio, clips: readonly string[]): void { voicePlayer(audio).prioritize(MONEY_VOICE, clips); }

/** Add a clip to the queue; it plays once the clip before it has ended plus `gap` seconds. A missing clip is skipped. */
export function queueVoice(clip: string, gap: number): void {
  if (!MONEY_VOICE.has(clip) || qLen >= Q_MAX) return;
  const i = (qHead + qLen) % Q_MAX;
  qClip[i] = clip; qGap[i] = gap; qLen++;
}

/** True while a queued line is playing or waiting its turn. */
export function customerSpeaking(audio: Audio): boolean { return qLen > 0 || (fromQueue && voicePlayer(audio).busy()); }

/** True while anything is said or waiting to be said. */
export function voiceBusy(audio: Audio): boolean { return qLen > 0 || voicePlayer(audio).busy(); }

/**
 * Say a coin or bill name now, unless the customer is speaking or about to (then nothing is said). Returns whether it
 * was asked for (a missing clip, sound off or a locked audio context also return false).
 */
export function sayName(audio: Audio, clip: string): boolean {
  if (customerSpeaking(audio)) return false;
  const ok = voicePlayer(audio).play(MONEY_VOICE, clip);
  if (ok) fromQueue = false;
  return ok;
}

/** Once per frame: start the next queued clip when its turn has come. */
export function updateVoice(audio: Audio, dt: number): void {
  const player = voicePlayer(audio);
  const busy = player.busy();
  if (busy) quiet = 0; else quiet += dt;
  if (log) {
    const now = player.current;
    if (now !== logged) {
      const t = Math.round(performance.now());
      if (logged) { const last = log[log.length - 1]; if (last && last.end < 0) last.end = t; }
      if (now) log.push({ clip: now, at: t, end: -1 });
      logged = now;
    }
  }
  if (busy || qLen === 0 || quiet < qGap[qHead]!) return;
  const clip = qClip[qHead]!;
  qHead = (qHead + 1) % Q_MAX; qLen--;
  // Sound off, audio locked or the clip failed to load: it is skipped and the next waits its own gap from now.
  fromQueue = player.play(MONEY_VOICE, clip);
  quiet = 0;
}

/** Stop speech and empty the queue. The scene calls this on pause and exit, so speech never runs on into the hub. */
export function stopVoice(audio: Audio): void {
  voicePlayer(audio).stop();
  qHead = 0; qLen = 0; fromQueue = false; quiet = 99;
}

/** Debug builds only: start recording clips into window.__msVoice. */
export function recordVoice(): void {
  if (log) return;
  log = [];
  (window as unknown as { __msVoice?: unknown }).__msVoice = log;
}
