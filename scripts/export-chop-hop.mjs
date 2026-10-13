// Export the existing study output. This never runs the study build or writes into it.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const study = resolve(process.argv[2] || 'C:/Users/Home/CoreWise/slice-master-study');
const target = join(root, 'public/games/chop-hop');
const original = join(study, 'assets/originals/slice-master.game-files.crazygames.com/slice-master/2');
const modified = join(study, 'assets/mod/slice-master.game-files.crazygames.com/slice-master/2');
const base = '/games/chop-hop/';
const textExtensions = /\.(?:html|js|css|json)$/i;
const files = new Map();
function source(name) { return existsSync(join(modified, name)) ? join(modified, name) : join(original, name); }
function add(name, path) {
  name = decodeURIComponent(name.replaceAll('\\', '/').split('?')[0]);
  path ||= source(name);
  if (files.has(name)) return;
  if (!existsSync(path)) throw new Error(`Missing export asset: ${name}`);
  if (name.includes('..') || name.startsWith('/')) throw new Error(`Unsafe asset path: ${name}`);
  files.set(name, readFileSync(path));
}
const top = ['index.html', 'styles.css', 'playcanvas-stable.min.js', '__settings__.js', '__modules__.js', '__start__.js', '__loading__.js', '__game-scripts.js', 'config.json', '1984930.json'];
for (const name of top) add(name);
const config = JSON.parse(files.get('config.json').toString());
function visit(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, next] of Object.entries(value)) {
    if (key === 'url' && typeof next === 'string' && next && !/^https?:/.test(next)) add(next);
    else visit(next);
  }
}
visit(config);
// Ammo's loader paths and owner artwork also live outside the asset registry.
for (const name of ['files/assets/174979883/1/ammo.wasm.js', 'files/assets/174979884/1/ammo.wasm.wasm', 'files/assets/174979882/1/ammo.js']) add(name);
function ownerFiles(folder) {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isDirectory()) ownerFiles(path);
    else add(relative(modified, path).replaceAll('\\', '/'), path);
  }
}
ownerFiles(join(modified, 'files/study'));
// Rebase the absolute paths used by any owner mod. Relative engine URLs stay relative.
function rebase(text) {
  return text.replaceAll('/__study/models/', base + 'models/').replace(/(["'])\/files\//g, '$1' + base + 'files/');
}
function replaceOnce(text, find, replacement) {
  if (text.split(find).length !== 2) throw new Error('PlayCanvas asset URL export anchor must match once');
  return text.replace(find, replacement);
}
for (const [name, bytes] of files) {
  let content = bytes;
  if (textExtensions.test(name)) content = Buffer.from(rebase(bytes.toString()));
  if (name === 'index.html') {
    content = Buffer.from(content.toString()
      .replace(/\s*<link rel="manifest"[^>]*>/, '')
      .replace(/\s*<script src="(?:playcanvas-stable.min.js|__settings__.js|__modules__.js|__start__.js|__loading__.js)"><\/script>/g, '')
      .replace('</body>', '<script src="corewise-bridge.js"></script>\n</body>'));
  }
  if (name === 'playcanvas-stable.min.js') {
    // Workbox caches canonical asset URLs. This exported engine must request those same URLs.
    content = Buffer.from(replaceOnce(content.toString(),
      'if(this.registry&&this.registry.prefix&&!fm.test(e)&&(e=this.registry.prefix+e),"script"!==this.type&&t.hash){var i=-1!==e.indexOf("?")?"&":"?";e+=i+"t="+t.hash}return e',
      'if(this.registry&&this.registry.prefix&&!fm.test(e))e=this.registry.prefix+e;return e'));
  }
  if (name === '__game-scripts.js' || name === '__loading__.js') {
    // Owner image literals carry the study server's immutable md5 query. The SW revisions them.
    content = Buffer.from(content.toString().replace(/\?t=[a-f0-9]{32}(?=["'])/g, ''));
  }
  if (name === '__game-scripts.js') content = Buffer.from(content.toString() + '\nwindow.__corewiseChopHop.installRuntime();\n');
  files.set(name, content);
}
// Owner model paths outside files/study are discovered from the actual exported text.
for (const bytes of files.values()) {
  const text = bytes.toString();
  for (const match of text.matchAll(/\/games\/chop-hop\/models\/([^"'\s?)]+)/g)) {
    const name = 'models/' + match[1];
    if (!files.has(name)) {
      add(name, join(study, 'models/out', match[1]));
    }
  }
}
// The bridge is maintained as ordinary source and survives repeat exports.
if (!existsSync(join(target, 'corewise-bridge.js'))) throw new Error('Missing corewise-bridge.js');
// Reject links before any cleanup, including links in a parent directory. Never follow a junction.
if (relative(root, target).replaceAll('\\', '/') !== 'public/games/chop-hop') throw new Error('Export target must stay inside this worktree');
for (const name of ['public', 'public/games', 'public/games/chop-hop']) {
  if (lstatSync(join(root, name)).isSymbolicLink()) throw new Error('Export target contains a link');
}
const realRoot = realpathSync(root), realTarget = realpathSync(target);
if (relative(realRoot, realTarget).replaceAll('\\', '/') !== 'public/games/chop-hop') throw new Error('Resolved export target leaves this worktree');
function verifyTree(folder) {
  for (const item of readdirSync(folder)) {
    const path = join(folder, item), info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`Refusing export cleanup through link: ${path}`);
    if (info.isDirectory()) verifyTree(path);
  }
}
verifyTree(target);
for (const item of readdirSync(target)) {
  if (item !== 'corewise-bridge.js') rmSync(join(target, item), { recursive: true, force: false });
}
for (const [name, content] of files) {
  const out = join(target, name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
}
const manifest = [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
const bridge = readFileSync(join(target, 'corewise-bridge.js'));
manifest.push({ path: 'corewise-bridge.js', bytes: bridge.length, sha256: createHash('sha256').update(bridge).digest('hex') });
writeFileSync(join(target, 'export-manifest.json'), JSON.stringify({ base, files: manifest }, null, 2) + '\n');
console.log(JSON.stringify({ files: manifest.length, bytes: manifest.reduce((sum, item) => sum + item.bytes, 0), assets: Object.keys(config.assets).length, destination: target }, null, 2));
