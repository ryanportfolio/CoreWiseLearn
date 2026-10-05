/**
 * Frog Pond learning content: rhyme families, lily-pad sentences and word-pot compound words. Data only, no drawing.
 * Words come from the reader's known-word list plus simple decodable words; all are lower case except a
 * sentence's first word and "I". Every word here is real and kid-safe.
 */

/** Sprite ids the sentence pictures are built from (art in public/art/frog-pond/). */
export const SCENE_VOCAB = [
  'pig', 'frog', 'bug', 'bat', 'cat', 'dog', 'hen', 'fox',
  'jet', 'van', 'box', 'log', 'hat', 'bag', 'cap', 'ball', 'pen', 'lid', 'rock', 'twig',
] as const;
export type SceneId = (typeof SCENE_VOCAB)[number];

/**
 * Where `who` is drawn against `what`: inside it, on top of it, beside it, beneath it,
 * or holding or wearing it (`with`).
 */
export type Relation = 'in' | 'on' | 'by' | 'under' | 'with';

// ---------------------------------------------------------------- Rhyme snack

export interface RhymeFamily {
  /** The shared ending, upper case without the dash (the family "-at" is 'AT'). */
  rime: string;
  /** Words that end in the rime. No word appears in two families, so any other family's word is a safe non-rhyme. */
  words: readonly string[];
}

export const RHYME_FAMILIES: readonly RhymeFamily[] = [
  { rime: 'AT', words: ['bat', 'cat', 'hat', 'mat', 'pat', 'rat', 'sat', 'vat'] },
  { rime: 'AN', words: ['can', 'fan', 'man', 'pan', 'ran', 'tan', 'van'] },
  { rime: 'AP', words: ['cap', 'gap', 'lap', 'map', 'nap', 'tap', 'zap'] },
  { rime: 'IG', words: ['big', 'dig', 'fig', 'jig', 'pig', 'wig', 'twig'] },
  { rime: 'IT', words: ['bit', 'fit', 'kit', 'lit', 'pit', 'sit'] },
  { rime: 'IP', words: ['dip', 'hip', 'lip', 'rip', 'sip', 'tip', 'zip'] },
  { rime: 'IN', words: ['bin', 'fin', 'pin', 'tin', 'win', 'twin'] },
  { rime: 'OG', words: ['dog', 'fog', 'hog', 'jog', 'log', 'frog'] },
  { rime: 'OP', words: ['hop', 'mop', 'pop', 'top', 'stop'] },
  { rime: 'UT', words: ['but', 'cut', 'hut', 'nut', 'shut'] },
  { rime: 'UG', words: ['bug', 'dug', 'hug', 'jug', 'mug', 'rug', 'tug'] },
  { rime: 'ET', words: ['get', 'jet', 'met', 'net', 'pet', 'set', 'vet', 'wet'] },
  { rime: 'EN', words: ['den', 'hen', 'men', 'pen', 'ten'] },
  { rime: 'ID', words: ['did', 'hid', 'kid', 'lid', 'rid'] },
  { rime: 'AG', words: ['bag', 'rag', 'tag', 'wag', 'flag'] },
  { rime: 'OT', words: ['cot', 'dot', 'got', 'hot', 'lot', 'not', 'pot'] },
  { rime: 'UN', words: ['bun', 'fun', 'run', 'sun', 'spun'] },
  { rime: 'ED', words: ['bed', 'fed', 'led', 'red', 'sled'] },
];

// ---------------------------------------------------------------- Lily-pad sentences

export type Difficulty = 1 | 2 | 3;

export interface SceneSpec {
  /** The main character or thing in the picture. */
  who: SceneId;
  /** A second thing in the picture; absent when the sentence names only one. */
  what?: SceneId;
  /** How `who` sits against `what`; present only with `what`. Absent with `what` means side by side. */
  where?: Relation;
}

export interface Sentence {
  /** Words in reading order, first word capitalised, no punctuation. Duplicate words ("The" ... "the") are separate pads. */
  words: readonly string[];
  /** A sentence is a question exactly when its first word is in QUESTION_STARTERS, so the words alone decide this. */
  end: '.' | '?';
  scene: SceneSpec;
  /** 1: three or four words. 2: five words. 3: six or seven words. */
  difficulty: Difficulty;
}

/** First words that make a question. No statement starts with one of these. */
export const QUESTION_STARTERS: readonly string[] = ['Do', 'What', 'Where', 'Is', 'Can'];

const s = (text: string, end: '.' | '?', scene: SceneSpec): Sentence => {
  const words = text.split(' ');
  const difficulty: Difficulty = words.length <= 4 ? 1 : words.length === 5 ? 2 : 3;
  return { words, end, scene, difficulty };
};

export const SENTENCES: readonly Sentence[] = [
  // Difficulty 1: three or four words.
  s('Cats like hats', '.', { who: 'cat', what: 'hat', where: 'with' }),
  s('Dogs like balls', '.', { who: 'dog', what: 'ball', where: 'with' }),
  s('Frogs like bugs', '.', { who: 'frog', what: 'bug', where: 'by' }),
  s('Hens like twigs', '.', { who: 'hen', what: 'twig', where: 'with' }),
  s('Pigs sit on logs', '.', { who: 'pig', what: 'log', where: 'on' }),
  s('Cats nap on rocks', '.', { who: 'cat', what: 'rock', where: 'on' }),
  s('Bugs hid in hats', '.', { who: 'bug', what: 'hat', where: 'in' }),
  s('The jet is big', '.', { who: 'jet' }),
  s('I see the van', '.', { who: 'van' }),
  s('Can pigs dig', '?', { who: 'pig' }),
  s('Do bugs like rocks', '?', { who: 'bug', what: 'rock', where: 'on' }),
  s('Do dogs like bags', '?', { who: 'dog', what: 'bag', where: 'with' }),
  s('Is it a fox', '?', { who: 'fox' }),
  s('Where is my cap', '?', { who: 'cap', what: 'rock', where: 'under' }),

  // Difficulty 2: five words.
  s('The dog has a ball', '.', { who: 'dog', what: 'ball', where: 'with' }),
  s('The fox has a bag', '.', { who: 'fox', what: 'bag', where: 'with' }),
  s('The pig has a hat', '.', { who: 'pig', what: 'hat', where: 'with' }),
  s('The bat has a cap', '.', { who: 'bat', what: 'cap', where: 'with' }),
  s('The frog can see bugs', '.', { who: 'frog', what: 'bug', where: 'by' }),
  s('I like the big van', '.', { who: 'van' }),
  s('The fox sat on rocks', '.', { who: 'fox', what: 'rock', where: 'on' }),
  s('What is in the box', '?', { who: 'cat', what: 'box', where: 'in' }),
  s('What is on the log', '?', { who: 'frog', what: 'log', where: 'on' }),
  s('What is in the bag', '?', { who: 'ball', what: 'bag', where: 'in' }),
  s('What is under the log', '?', { who: 'bug', what: 'log', where: 'under' }),
  s('Where did the bug go', '?', { who: 'bug', what: 'lid', where: 'under' }),
  s('Can the frog get bugs', '?', { who: 'frog', what: 'bug', where: 'by' }),

  // Difficulty 3: six or seven words.
  s('The pig is in the box', '.', { who: 'pig', what: 'box', where: 'in' }),
  s('The cat sat on the van', '.', { who: 'cat', what: 'van', where: 'on' }),
  s('A bug hid in the hat', '.', { who: 'bug', what: 'hat', where: 'in' }),
  s('The dog ran to the jet', '.', { who: 'dog', what: 'jet', where: 'by' }),
  s('The hen is by the log', '.', { who: 'hen', what: 'log', where: 'by' }),
  s('The bug hid under the rock', '.', { who: 'bug', what: 'rock', where: 'under' }),
  s('The frog sat on a big rock', '.', { who: 'frog', what: 'rock', where: 'on' }),
  s('I like to jog with my dog', '.', { who: 'dog' }),
  s('The cat can sit in the bag', '.', { who: 'cat', what: 'bag', where: 'in' }),
  s('We like to see the jet', '.', { who: 'jet' }),
  s('The van is by the big rock', '.', { who: 'van', what: 'rock', where: 'by' }),
  s('The pig ran to the van', '.', { who: 'pig', what: 'van', where: 'by' }),
  s('The bug is on the pen', '.', { who: 'bug', what: 'pen', where: 'on' }),
  s('Is the pig in the box', '?', { who: 'pig', what: 'box', where: 'in' }),
  s('Is the hat on the cat', '?', { who: 'hat', what: 'cat', where: 'on' }),
  s('Can the dog get the ball', '?', { who: 'dog', what: 'ball', where: 'with' }),
  s('Is the frog on the lid', '?', { who: 'frog', what: 'lid', where: 'on' }),
  s('Can the hen sit on the van', '?', { who: 'hen', what: 'van', where: 'on' }),
  s('Is the bug on the twig', '?', { who: 'bug', what: 'twig', where: 'on' }),
];

// ---------------------------------------------------------------- Word pot

export interface Compound {
  word: string;
  /** The two halves, in order. */
  parts: readonly [string, string];
}

/** Each has a picture, public/art/frog-pond/cw-<word>.webp. */
export const COMPOUNDS: readonly Compound[] = [
  { word: 'pancake', parts: ['pan', 'cake'] },
  { word: 'football', parts: ['foot', 'ball'] },
  { word: 'starfish', parts: ['star', 'fish'] },
  { word: 'bedtime', parts: ['bed', 'time'] },
  { word: 'seahorse', parts: ['sea', 'horse'] },
  { word: 'baseball', parts: ['base', 'ball'] },
  { word: 'ladybug', parts: ['lady', 'bug'] },
  { word: 'hopscotch', parts: ['hop', 'scotch'] },
  { word: 'treetop', parts: ['tree', 'top'] },
  { word: 'zipline', parts: ['zip', 'line'] },
  { word: 'hairball', parts: ['hair', 'ball'] },
  { word: 'laptop', parts: ['lap', 'top'] },
  { word: 'pigpen', parts: ['pig', 'pen'] },
  { word: 'bedbug', parts: ['bed', 'bug'] },
  { word: 'catfish', parts: ['cat', 'fish'] },
  { word: 'hotdog', parts: ['hot', 'dog'] },
  { word: 'sunset', parts: ['sun', 'set'] },
  { word: 'hilltop', parts: ['hill', 'top'] },
  { word: 'sandbox', parts: ['sand', 'box'] },
  { word: 'bathtub', parts: ['bath', 'tub'] },
];

/**
 * Real one-word compounds that two halves from COMPOUNDS also make, with no picture. A pot that holds both halves of
 * one of these should either accept it as a word or (simpler) never hold both together. Rarer real words that the halves
 * make (panfish, sandfish, ladyfish, pigfish, sunbath, hotfoot, hotbox) are left out: a child will not try them on purpose,
 * and a bonk on them loses nothing.
 */
export const EXTRA_COMPOUNDS: readonly Compound[] = [
  { word: 'footbath', parts: ['foot', 'bath'] },
  { word: 'foothill', parts: ['foot', 'hill'] },
  { word: 'seabed', parts: ['sea', 'bed'] },
  { word: 'sunbed', parts: ['sun', 'bed'] },
  { word: 'sunfish', parts: ['sun', 'fish'] },
  { word: 'lapdog', parts: ['lap', 'dog'] },
  { word: 'bedpan', parts: ['bed', 'pan'] },
  { word: 'hotcake', parts: ['hot', 'cake'] },
  { word: 'hotbed', parts: ['hot', 'bed'] },
  { word: 'hotline', parts: ['hot', 'line'] },
  { word: 'dogfish', parts: ['dog', 'fish'] },
  { word: 'treeline', parts: ['tree', 'line'] },
  { word: 'bathtime', parts: ['bath', 'time'] },
  { word: 'hairline', parts: ['hair', 'line'] },
  { word: 'baseline', parts: ['base', 'line'] },
  { word: 'timeline', parts: ['time', 'line'] },
  { word: 'fishcake', parts: ['fish', 'cake'] },
  { word: 'horsehair', parts: ['horse', 'hair'] },
  { word: 'horsebox', parts: ['horse', 'box'] },
  { word: 'sandhill', parts: ['sand', 'hill'] },
];

/**
 * Bubbles that fit nothing: no decoy joins any COMPOUNDS half, or another decoy, in either order to make a real word.
 * Words that would (cup: cupcake; fan: fanbase; nap: catnap; net: netball; gum: gumball; bag: sandbag; tag: tagline;
 * pot: hotpot; red: redfish; bat: batfish; mop: moptop; log with jam: logjam) were left out on purpose.
 */
export const DECOYS: readonly string[] = [
  'pet', 'jug', 'hen', 'wig', 'lid', 'fox', 'mug', 'van', 'rug', 'jam', 'hug', 'kid', 'dip', 'bib',
];
