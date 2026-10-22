import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import { BROWSERS, manifestFor } from './manifest.mjs';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const artifacts = join(root, 'artifacts');
const dist = join(root, 'dist');
// Only generated directories under this repository may be cleaned.
for (const directory of [artifacts, dist]) {
  if (!directory.startsWith(`${root}\\`) && !directory.startsWith(`${root}/`)) throw new Error('unsafe_output_path');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}
const entries = ['background', 'content', 'popup', 'options'];
const compiled = await build({ entryPoints: entries.map((entry) => join(root, 'src', 'browser', `${entry}.ts`)),
  outdir: dist, bundle: true, format: 'iife', platform: 'browser', target: ['chrome120', 'firefox142'],
  write: false, legalComments: 'inline', charset: 'utf8', minify: false });
const scripts = new Map(compiled.outputFiles.map((file) => [file.path.split(/[\\/]/u).at(-1), file.contents]));
const icon = await readFile(join(root, 'extension', 'icon.svg'));
const icons = new Map();
for (const size of [16, 32, 48, 96, 128]) icons.set(`icons/${size}.png`, await sharp(icon).resize(size, size).png().toBuffer());
const assets = [];
const fixedTime = new Date('2020-01-01T00:00:00Z');
async function archive(name, role, files) {
  const zipped = {};
  for (const [path, bytes] of [...files].sort(([left], [right]) => left.localeCompare(right, 'en'))) zipped[path] = [bytes, { mtime: fixedTime }];
  const bytes = zipSync(zipped, { level: 9 });
  await writeFile(join(artifacts, name), bytes);
  assets.push({ name, role, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
for (const browser of BROWSERS) {
  const directory = join(dist, browser);
  await mkdir(join(directory, 'icons'), { recursive: true });
  await mkdir(join(directory, '_locales', 'ru'), { recursive: true });
  const files = new Map([...scripts, ...icons]);
  files.set('_locales/ru/messages.json', await readFile(join(root, 'extension', '_locales', 'ru', 'messages.json')));
  files.set('manifest.json', Buffer.from(JSON.stringify(manifestFor(browser, pkg.version), null, 2)));
  for (const name of ['popup.html', 'options.html', 'ui.css']) files.set(name, await readFile(join(root, 'extension', name)));
  for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
  await archive(`postfield-${pkg.version}-${browser}.zip`, browser, files);
}
const sourceFiles = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
const source = new Map();
for (const name of [...new Set(sourceFiles)]) {
  if (/^(?:node_modules|dist|artifacts|\.cache|\.local|coverage|test-results|playwright-report)\//u.test(name)) continue;
  if (/(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|crx|log))$/u.test(name)) throw new Error('secret_like_source_file');
  source.set(name, await readFile(join(root, name)));
}
await archive(`postfield-${pkg.version}-sources.zip`, 'sources', source);
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
await writeFile(join(artifacts, 'release-manifest.json'), `${JSON.stringify({ product: 'PostField', publisher: 'Kreout', version: pkg.version,
  source_sha: sourceSha, toolchain: { node: process.version, esbuild: '0.28.2' }, signing: 'store_managed', assets }, null, 2)}\n`);
console.log(`Built ${BROWSERS.join(', ')} and moderator sources for ${pkg.version} (${sourceSha}).`);
