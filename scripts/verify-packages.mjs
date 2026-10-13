import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { BROWSERS, manifestFor } from './manifest.mjs';

const root = resolve(import.meta.dirname, '..');
const artifactDir = process.argv[2] ? resolve(process.argv[2]) : join(root, 'artifacts');
const manifest = JSON.parse(await readFile(join(artifactDir, 'release-manifest.json'), 'utf8'));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
assert.equal(manifest.version, version);
assert.match(manifest.source_sha, /^[a-f\d]{40}$/u);
assert.deepEqual(manifest.assets.map((asset) => asset.role).sort(), [...BROWSERS, 'sources'].sort());
for (const asset of manifest.assets) {
  assert.equal(asset.name, `postfield-${version}-${asset.role}.zip`);
  const bytes = await readFile(join(artifactDir, asset.name));
  assert.equal(bytes.length, asset.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  const files = unzipSync(bytes);
  if (asset.role === 'sources') {
    assert.ok(files['package-lock.json'] && files['src/browser/background.ts'] && files['LICENSE']);
    assert.ok(!Object.keys(files).some((name) => /^(?:node_modules|dist|artifacts|\.local|\.cache)\//u.test(name)));
  } else {
    const expected = ['background.js', 'content.js', 'popup.js', 'options.js', 'popup.html', 'options.html', 'ui.css', 'manifest.json',
      ...[16, 32, 48, 96, 128].map((size) => `icons/${size}.png`)];
    assert.deepEqual(Object.keys(files).sort(), expected.sort());
    assert.deepEqual(JSON.parse(strFromU8(files['manifest.json'])), manifestFor(asset.role, version));
    for (const name of ['background.js', 'content.js', 'popup.js', 'options.js']) {
      const js = strFromU8(files[name]);
      assert.ok(!/\beval\s*\(|new Function\s*\(/u.test(js), `${name}: dynamic execution`);
    }
  }
}
console.log(`Verified ${manifest.assets.length} archives, manifests, allowlist and release identity.`);
