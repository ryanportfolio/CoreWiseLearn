/**
 * Frog Pond's spoken words, played on the shared voice channel (src/audio/voice-player.ts). Clips live in
 * public/voice/frog-pond/ (file names and voices in its README); a missing clip is silence with no request.
 *
 * - say-<word>: the Scottish teacher says the target word, and any word while word help is on.
 * - catch-<word>: the northern postman says a rhyme the frog caught.
 * - dodge-<word>: the London lad says the word of a bug that dodged.
 */
import { voiceFolder, voicePlayer, type VoiceFolder } from '../../audio/voice-player';
import type { Audio } from '../../engine/audio';

// Build-time list of the clips that exist. The keys are enough: nothing is imported at runtime.
export const FROG_VOICE: VoiceFolder = voiceFolder('frog-pond', Object.keys(import.meta.glob('/public/voice/frog-pond/*.mp3', { query: '?url', import: 'default' })));

export type WordVoice = 'say' | 'catch' | 'dodge';

export function preloadFrogVoice(audio: Audio): void { voicePlayer(audio).preload(FROG_VOICE); }

/** Say a word in one of the three voices, stopping whatever is being said. Returns false when nothing plays. Called on events, never per frame. */
export function sayWord(audio: Audio, kind: WordVoice, word: string): boolean {
  return voicePlayer(audio).play(FROG_VOICE, `${kind}-${word}`);
}

export function stopFrogVoice(audio: Audio): void { voicePlayer(audio).stop(); }
