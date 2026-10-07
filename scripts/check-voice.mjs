// Every game speaks. Run by `npm run build`; fails when a registered game has no voice, or a voice line has no clip.
// The children cannot read, so each game needs Wibble saying its name on the hub and its own clips for the words,
// numbers and letters it teaches. Games that cannot speak yet are listed with a reason in scripts/voice/exempt.json.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const registry = await readFile(join(root, 'src/engine/registry.ts'), 'utf8');
// A game's id is its folder name (each game's GAME_ID matches it).
const games = [...registry.matchAll(/from '\.\.\/games\/([a-z0-9-]+)'/g)].map(match => match[1]);
const exempt = JSON.parse(await readFile(join(root, 'scripts/voice/exempt.json'), 'utf8'));
const linesDir = join(root, 'scripts/voice/lines');
const linesFiles = [];
for (const name of (await readdir(linesDir)).filter(n => n.endsWith('.json')).sort()) {
  linesFiles.push({ name, ...JSON.parse(await readFile(join(linesDir, name), 'utf8')) });
}

const problems = [];
const clip = (folder, file) => existsSync(join(root, 'public/voice', folder, `${file}.mp3`));

// Every line in every lines file has its rendered clip, so nothing written for the voice is silently missing.
let lines = 0;
for (const file of linesFiles) {
  for (const line of file.lines) {
    lines++;
    if (!clip(file.folder, line.file)) problems.push(`${file.name}: "${line.file}" has no public/voice/${file.folder}/${line.file}.mp3 (render it with scripts/voice/generate.mjs)`);
  }
}

const wibble = linesFiles.find(file => file.folder === 'wibble');
for (const id of games) {
  // Wibble names every game on the hub.
  if (!wibble?.lines.some(line => line.file === `game-${id}`)) problems.push(`${id}: no "game-${id}" line in scripts/voice/lines/wibble.json`);
  // The game's own clips.
  const own = linesFiles.filter(file => file.folder === id && file.lines.length > 0);
  if (id in exempt) {
    if (own.length) problems.push(`${id}: has voice lines, so remove it from scripts/voice/exempt.json`);
  } else if (!own.length) {
    problems.push(`${id}: no voice lines (a scripts/voice/lines/*.json with "folder": "${id}"); voice the game, or list it in scripts/voice/exempt.json with the reason`);
  }
}
for (const id of Object.keys(exempt)) if (!games.includes(id)) problems.push(`scripts/voice/exempt.json: "${id}" is not a registered game`);

if (problems.length) {
  console.error(`Voice check failed:\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Voice check: ${games.length} games, ${lines} voice lines, every line has its clip.`);
}
