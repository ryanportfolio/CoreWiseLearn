/** Letter Train learning content: stages, letter picks and train plans. Pure functions, no drawing. */

export const STAGE_SAME_UPPER = 0, STAGE_SAME_LOWER = 1, STAGE_PAIRS = 2, STAGE_NAME = 3, STAGE_WORDS = 4;
export type Stage = 0 | 1 | 2 | 3 | 4;
export const TOP_STAGE: Stage = 4;

/** No word puts two look-alike letters (LOOKALIKES) on one train. */
export const WORDS = ['cat', 'dog', 'hen', 'bus', 'hat', 'cup', 'pig', 'fox'] as const;
export type Word = (typeof WORDS)[number];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Letters that look alike in some case never share a train. */
const LOOKALIKES = ['BDPQ', 'MW', 'NU', 'IL'];
/** Letters whose capital and small forms have the same shape; the capital-to-small stage leaves them out. */
const SAME_SHAPE = 'CKOPSUVWXZ';
const PAIR_ALPHABET = ALPHABET.split('').filter(l => !SAME_SHAPE.includes(l)).join('');

export interface TrainPlan {
  stage: Stage;
  /** What each car shows, left to right. */
  cars: string[];
  /** What each block shows, in car order (shuffled onto the platform by the scene). */
  blocks: string[];
  /** Cars must be filled left to right. */
  ordered: boolean;
  word?: Word;
  /** Name trains: which part of the name this train carries. */
  nameChunk?: boolean;
}

export const toStage = (n: unknown): Stage => (n === 1 || n === 2 || n === 3 || n === 4 ? n : 0);

/** Letters of a profile name usable on blocks (A to Z only), upper case. */
export function nameLetters(name: string | undefined): string {
  if (!name) return '';
  return name.normalize('NFKD').toUpperCase().replace(/[^A-Z]/g, '');
}

/** Next stage up, skipping the name stage when there is no usable name. */
export function stageUp(stage: Stage, hasName: boolean): Stage {
  let next = Math.min(TOP_STAGE, stage + 1) as Stage;
  if (next === STAGE_NAME && !hasName) next = STAGE_WORDS;
  return next;
}
export function stageDown(stage: Stage, hasName: boolean): Stage {
  let next = Math.max(0, stage - 1) as Stage;
  if (next === STAGE_NAME && !hasName) next = STAGE_PAIRS;
  return next;
}

/**
 * `count` distinct letters with no two look-alikes. Letters in `used` (already on an earlier train of the round)
 * are left out while enough others remain; only a pool too small for the train lets them back in.
 */
function pickLetters(count: number, random: () => number, alphabet = ALPHABET, used: Set<string> = new Set()): string[] {
  const picked: string[] = [];
  const fresh = alphabet.split('').filter(l => !used.has(l)).join('');
  for (const pool of [fresh, alphabet]) {
    for (let guard = 0; picked.length < count && pool && guard < 400; guard++) {
      const letter = pool[Math.floor(random() * pool.length)]!;
      if (picked.includes(letter)) continue;
      if (LOOKALIKES.some(group => group.includes(letter) && picked.some(p => group.includes(p)))) continue;
      picked.push(letter);
    }
  }
  for (const l of picked) used.add(l);
  return picked;
}

/** One train of single letters for stages 0 to 2. `used` collects the round's letters so later trains avoid them. */
export function letterTrain(stage: Stage, count: number, random: () => number, used?: Set<string>): TrainPlan {
  // Capital to small only asks for the pairing when the two forms look different.
  const letters = pickLetters(count, random, stage === STAGE_PAIRS ? PAIR_ALPHABET : ALPHABET, used);
  const lower = letters.map(l => l.toLowerCase());
  if (stage === STAGE_SAME_LOWER) return { stage, cars: lower, blocks: lower.slice(), ordered: false };
  if (stage === STAGE_PAIRS) return { stage, cars: lower, blocks: letters, ordered: false };
  return { stage: STAGE_SAME_UPPER, cars: letters, blocks: letters.slice(), ordered: false };
}

/** Split a name into trains of at most `perTrain` letters, as evenly as possible. */
export function nameTrains(name: string, perTrain: number): TrainPlan[] {
  const letters = nameLetters(name);
  if (!letters) return [];
  const trains = Math.ceil(letters.length / Math.max(1, perTrain));
  const size = Math.ceil(letters.length / trains);
  const plans: TrainPlan[] = [];
  for (let i = 0; i < letters.length; i += size) {
    const part = letters.slice(i, i + size).split('');
    plans.push({ stage: STAGE_NAME, cars: part, blocks: part.slice(), ordered: true, nameChunk: true });
  }
  return plans;
}

export function wordTrain(word: Word): TrainPlan {
  const letters = word.split('');
  return { stage: STAGE_WORDS, cars: letters, blocks: letters.slice(), ordered: true, word };
}

/**
 * The trains of one round. Three trains, except that a name train split in
 * parts keeps its parts together.
 */
export function planRound(stage: Stage, cars: number, perTrain: number, name: string, random: () => number, recentWords: readonly string[]): TrainPlan[] {
  const hasName = nameLetters(name).length > 0;
  if (stage === STAGE_NAME && !hasName) stage = STAGE_WORDS;
  const plans: TrainPlan[] = [];
  // No letter rides twice in one round while the stage's letters allow it.
  const used = new Set<string>();
  if (stage <= STAGE_PAIRS) {
    for (let i = 0; i < 3; i++) plans.push(letterTrain(stage, cars, random, used));
    return plans;
  }
  if (stage === STAGE_NAME) {
    plans.push(...nameTrains(name, perTrain));
    for (const l of nameLetters(name)) used.add(l);
    while (plans.length < 3) plans.push(letterTrain(STAGE_PAIRS, cars, random, used));
    return plans;
  }
  const fresh = WORDS.filter(w => !recentWords.includes(w));
  const pool = fresh.length >= 2 ? fresh : WORDS.slice();
  // The name rides last; a name split over several trains keeps all its parts.
  const nameParts = hasName ? nameTrains(name, perTrain).slice(0, 3) : [];
  const wordCount = 3 - nameParts.length;
  for (let i = 0; i < wordCount && pool.length; i++) plans.push(wordTrain(pool.splice(Math.floor(random() * pool.length), 1)[0]!));
  plans.push(...nameParts);
  return plans.slice(-3);
}

/** True when a block letter belongs on a car letter. Case only differs in the pairs stage. */
export function matches(block: string, car: string): boolean {
  return block.toLowerCase() === car.toLowerCase();
}

/** Alphabet index 0..25 for pitch and voice clips; -1 for anything else. */
export function letterIndex(letter: string): number {
  return ALPHABET.indexOf(letter.toUpperCase());
}
