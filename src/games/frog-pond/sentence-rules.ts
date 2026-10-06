/** Lily-pad sentences round planning: which sentence, the scrambled pad order, and the hidden tiers. Pure logic. */
import type { Tier } from '../../engine/difficulty';
import { QUESTION_STARTERS, SENTENCES, type Difficulty, type Sentence } from './content';

export interface SentenceTier {
  /** Sentence length tag from content.ts: 1 three or four words, 2 five, 3 six or seven. */
  difficulty: Difficulty;
  /** How far the floating pads drift side to side, in layout px at 1366x768. */
  drift: number;
}

export const SENTENCE_TIERS: readonly SentenceTier[] = [
  { difficulty: 1, drift: 8 },
  { difficulty: 2, drift: 12 },
  { difficulty: 3, drift: 16 },
];
/** The first round ever: a short statement with a clear picture, pads drifting least. */
export const SENTENCE_INTRO: SentenceTier = { difficulty: 1, drift: 6 };
/** The introduction's sentence: a pig sitting on a log. */
export const INTRO_SENTENCE = 'Pigs sit on logs';

export interface SentencePlan {
  /** Index into SENTENCES. */
  index: number;
  sentence: Sentence;
  /** Word indexes in the order the pads float, never the reading order. */
  order: number[];
}

export function sentenceTier(tier: Tier, intro: boolean): SentenceTier {
  return intro ? SENTENCE_INTRO : SENTENCE_TIERS[tier]!;
}

/** The end mark the words decide: a question starts with a question word. */
export const endFor = (words: readonly string[]): '.' | '?' => (QUESTION_STARTERS.includes(words[0] ?? '') ? '?' : '.');

/** Clip name of the postman reading a sentence: read-the-pig-is-in-the-box. */
export const readClip = (s: Sentence): string => `read-${s.words.join('-').toLowerCase()}`;
/** Clip name of the teacher saying one word: say-the, say-i. */
export const wordClip = (word: string): string => `say-${word.toLowerCase()}`;

/**
 * One round: a sentence of the tier's difficulty other than the last one (`last` is its index plus one, 0 for none),
 * and a scrambled pad order that differs from the reading order and does not start with the first word. `force` (a debug
 * option) names the sentence by index.
 */
export function planSentence(params: SentenceTier, last: number, random: () => number, intro: boolean, force = -1): SentencePlan {
  let index = force >= 0 && force < SENTENCES.length ? force : intro ? SENTENCES.findIndex(s => s.words.join(' ') === INTRO_SENTENCE) : -1;
  if (index < 0) {
    const pool: number[] = [];
    for (let i = 0; i < SENTENCES.length; i++) if (SENTENCES[i]!.difficulty === params.difficulty && i !== last - 1) pool.push(i);
    index = pool[Math.floor(random() * pool.length) % pool.length] ?? 0;
  }
  const sentence = SENTENCES[index]!;
  const n = sentence.words.length, order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i);
  for (let tries = 0; tries < 20; tries++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)) % (i + 1); const t = order[i]!; order[i] = order[j]!; order[j] = t; }
    // The first pad on the water is never the sentence's first word, so the order is plainly not the answer.
    if (sentence.words[order[0]!] !== sentence.words[0]) break;
  }
  return { index, sentence, order };
}
