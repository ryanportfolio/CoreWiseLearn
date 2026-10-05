/**
 * Wibble, the blue mascot: its voice lines and the rules for when it speaks.
 * Clips live in public/voice/wibble/ (file names in scripts/voice/lines/wibble.json);
 * a clip that is not there is silence.
 *
 * Commentary (hello-N, back-N) is at most one line per COMMENTARY_SECONDS.
 * Lines the child asks for (letters, tickles, game names, the greeting after
 * Go) do not count toward it.
 */

import type { AppServices } from '../app/services';
import { voiceFolder, voicePlayer, type VoiceFolder, type VoicePlayer } from '../audio/voice-player';

// Build-time list of the clips that exist. The keys are enough: nothing is imported at runtime.
export const WIBBLE: VoiceFolder = voiceFolder('wibble', Object.keys(import.meta.glob('/public/voice/wibble/*.mp3', { query: '?url', import: 'default' })));

/** Seconds between two commentary lines. */
const COMMENTARY_SECONDS = 60;
/** performance.now() of the last commentary line, across scenes. */
let lastCommentary = -Infinity;
/** Last tickle line, so a poke never repeats the line before it. */
let lastTickle = '';
/** True once Wibble has greeted the child this session: the greeting after Go, or the hub's hello. */
let greeted = false;

/** Record that the child has been greeted, so the hub skips its hello. */
export function markGreeted(): void {
  greeted = true;
}

/** True once the child has been greeted this session. */
export function greetedThisSession(): boolean {
  return greeted;
}

/** The shared voice channel. */
export function wibbleVoice(services: AppServices): VoicePlayer {
  return voicePlayer(services.audio);
}

/** Clips that exist named `<prefix>-1`, `<prefix>-2`, ... */
function pool(prefix: string): string[] {
  return WIBBLE.clips.filter((c) => c.startsWith(`${prefix}-`) && /^\d+$/.test(c.slice(prefix.length + 1)));
}

/** A random existing clip from a pool, never `avoid`, or '' when the pool is empty. */
export function pickLine(services: AppServices, prefix: string, avoid = ''): string {
  const lines = pool(prefix);
  const choices = lines.length > 1 ? lines.filter((c) => c !== avoid) : lines;
  if (choices.length === 0) return '';
  return choices[Math.floor(services.random() * choices.length) % choices.length] ?? '';
}

/** Say a commentary line from a pool unless one played in the last minute. Returns true when it plays. */
export function sayCommentary(services: AppServices, prefix: 'hello' | 'back'): boolean {
  const now = performance.now();
  if (now - lastCommentary < COMMENTARY_SECONDS * 1000) return false;
  const line = pickLine(services, prefix);
  if (!line || !wibbleVoice(services).play(WIBBLE, line)) return false;
  lastCommentary = now;
  return true;
}

/**
 * A poke: a ticklish line, never the one before it. A poke while Wibble is
 * already talking adds no line, so lines never stack. The caller plays the
 * jiggle either way, also with the sound off.
 */
export function sayTickle(services: AppServices): void {
  const voice = wibbleVoice(services);
  if (voice.busy()) return;
  const line = pickLine(services, 'tickle', lastTickle);
  if (line && voice.play(WIBBLE, line)) lastTickle = line;
}

/** Say a letter's name, 'a' to 'z'. */
export function sayLetter(services: AppServices, letter: string): void {
  wibbleVoice(services).play(WIBBLE, `letter-${letter.toLowerCase()}`);
}

/** True when a game's name clip exists. */
export function hasGameName(id: string): boolean {
  return WIBBLE.has(`game-${id}`);
}

/** Say a game's name, if its clip exists. */
export function sayGameName(services: AppServices, id: string): void {
  if (hasGameName(id)) wibbleVoice(services).play(WIBBLE, `game-${id}`);
}
