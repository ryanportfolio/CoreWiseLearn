// Explicit offline asset preparation. Never runs in the children's browser.
// node scripts/prepare-art.mjs <input> <output.webp|output.png> [--palette]
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [input, output, ...flags] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: prepare-art <input> <output.webp|output.png> [--palette]');
if (resolve(input) === resolve(output)) throw new Error('Use a different output path; retain the reviewed original.');
const source = sharp(input);
const meta = await source.metadata();
const background = (meta.width ?? 0) > 1000;
await mkdir(dirname(resolve(output)), { recursive: true });
let pipeline = source.rotate().resize({ width: background ? 1366 : 512, height: background ? 768 : 512, fit: 'inside', withoutEnlargement: true });
if (output.toLowerCase().endsWith('.webp')) {
  // The shipped format: the sprites' setting, quality 92 with alpha quality 100.
  pipeline = pipeline.webp({ quality: 92, alphaQuality: 100, effort: 6 });
} else {
  // Palette reduction is an explicit option, appropriate for the current flat art.
  // Preserve true color for future clay and paper worlds.
  pipeline = flags.includes('--palette')
    ? pipeline.png({ palette: true, colours: 256, dither: 0.5, compressionLevel: 9 })
    : pipeline.png({ compressionLevel: 9 });
}
const result = await pipeline.toFile(output);
console.log(JSON.stringify({ input, output, width: result.width, height: result.height, bytes: result.size }));
if (result.size > 1_000_000) process.exitCode = 1;
