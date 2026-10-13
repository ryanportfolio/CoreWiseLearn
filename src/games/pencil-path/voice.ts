/**
 * Spoken clips for Pencil Path, in the narrator voice, rendered from scripts/voice/lines/pencil-path.json (see
 * public/voice/pencil-path/README.md). A clip plays only when its file is in public/voice/pencil-path/ at build time.
 */
import { voiceFolder, type VoiceFolder } from '../../audio/voice-player';

export const PENCIL_VOICE: VoiceFolder = voiceFolder('pencil-path', Object.keys(import.meta.glob('/public/voice/pencil-path/*.mp3', { query: '?url', import: 'default' })));

/** A new page opens: an invitation, never an instruction to read. */
export const START_CLIPS = ['start-1', 'start-2', 'start-3'] as const;
/** The pencil begins its demonstration. */
export const WATCH_CLIPS = ['watch-1', 'watch-2'] as const;
/** The marble lands in the cup. */
export const WIN_CLIPS = ['win-1', 'win-2', 'win-3', 'win-4'] as const;
/** The marble went somewhere else: it pops back onto its pin. Never "wrong". */
export const AGAIN_CLIPS = ['again-1', 'again-2'] as const;
