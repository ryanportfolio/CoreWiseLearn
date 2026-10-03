import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}
const sw = await readFile(join(root, 'dist/sw.js'), 'utf8');
const entries = [...sw.matchAll(/\{url:\s*["']([^"']+)["'],revision:/g)].map(match => match[1]);
if (!entries.length) throw new Error('No generated precache entries found; inspect the service worker format.');
const missing = [];
for (const path of await files(join(root, 'public'))) {
  const name = relative(join(root, 'public'), path).replaceAll('\\', '/');
  if (!entries.includes(name) && !entries.includes(`/CoreWiseLearn/${name}`)) missing.push(name);
}
let bytes = 0;
for (const entry of new Set(entries)) {
  const local = entry.replace(/^\/CoreWiseLearn\//, '');
  const path = resolve(root, 'dist', local);
  if (!path.startsWith(resolve(root, 'dist') + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Unexpected precache path');
  bytes += (await stat(path)).size;
}
// src/app/config.ts reads config.json?fresh=<time> so an adult's edit applies on the
// next load; the precached copy is only the offline fallback. A precache option that
// strips query parameters would serve the build-time config.json forever.
const configBypass = !/ignoreURLParametersMatching/.test(sw);
console.log(JSON.stringify({ entries: entries.length, bytes, megabytes: +(bytes / 1_000_000).toFixed(3), missing, configBypass }, null, 2));
if (missing.length || !configBypass) process.exitCode = 1;
