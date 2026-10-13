/**
 * Spoken clips for Pencil Path, in the narrator voice, rendered from scripts/voice/lines/pencil-path.json (see
 * public/voice/pencil-path/README.md). A clip plays only when its file is in public/voice/pencil-path/ at build time.
 */
import { voiceFolder, type VoiceFolder } from '../../audio/voice-player';

export const PENCIL_VOICE: VoiceFolder = voiceFolder('pencil-path', Object.keys(import.meta.glob('/public/voice/pencil-path/*.mp3', { query: '?url', import: 'default' })));

/** Page 1 opens, once per visit: the one invitation. */
export const START_CLIP = 'start';
/** The pencil begins its demonstration. */
export const WATCH_CLIPS = ['watch-1', 'watch-2'] as const;
/** The marble went somewhere else: it pops back onto its pin. Never "wrong". */
export const AGAIN_CLIPS = ['again-1', 'again-2'] as const;
