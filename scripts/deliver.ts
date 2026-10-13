import { readFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { deliver } from '../src/delivery/runner.js';
import { GitHubJournal } from '../src/delivery/github-journal.js';
import { ChromeStore, EdgeStore, MozillaStore, OperaStore } from '../src/delivery/stores.js';
import type { StorePort } from '../src/delivery/ports.js';

const env = (name: string): string => process.env[name] ?? '';
const directory = resolve(env('ARTIFACT_DIR') || 'artifacts');
const store = env('STORE');
if (!['chrome', 'opera', 'edge', 'firefox'].includes(store)) throw new Error('invalid_store');
const manifest = JSON.parse(await readFile(join(directory, 'release-manifest.json'), 'utf8')) as { version: string; source_sha: string; assets: { role: string; name: string; sha256: string }[] };
if (env('RELEASE_SHA') !== manifest.source_sha || env('RELEASE_TAG') !== `v${manifest.version}`) throw new Error('untrusted_release_identity');
async function asset(role: string): Promise<Buffer> {
  const row = manifest.assets.find((item) => item.role === role);
  if (!row || !/^postfield-[\w.-]+\.zip$/u.test(row.name)) throw new Error('missing_release_asset');
  const bytes = await readFile(join(directory, row.name));
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error('release_digest_mismatch');
  return bytes;
}
const bytes = await asset(store);
const sources = await asset('sources');
const adapters: Record<string, () => StorePort> = {
  chrome: () => new ChromeStore({ publisherId: env('CWS_PUBLISHER_ID'), itemId: env('CWS_ITEM_ID'), clientId: env('CWS_CLIENT_ID'), clientSecret: env('CWS_CLIENT_SECRET'), refreshToken: env('CWS_REFRESH_TOKEN') }, bytes, manifest.version),
  edge: () => new EdgeStore({ productId: env('EDGE_PRODUCT_ID'), clientId: env('EDGE_CLIENT_ID'), apiKey: env('EDGE_API_KEY') }, bytes),
  firefox: () => new MozillaStore({ addonId: env('AMO_ADDON_ID'), issuer: env('AMO_JWT_ISSUER'), secret: env('AMO_JWT_SECRET'), license: env('AMO_LICENSE_CONFIGURED') }, bytes, sources, manifest.version),
  opera: () => new OperaStore(),
};
const row = manifest.assets.find((item) => item.role === store)!;
const release = { version: manifest.version, sha: manifest.source_sha, digest: row.sha256 };
const journal = new GitHubJournal(env('GITHUB_REPOSITORY'), env('GH_TOKEN'), env('RELEASE_TAG'), store);
const resume = process.argv.includes('--resume');
const prior = resume ? await journal.read() : null;
if (resume && (!prior || ['requires_setup', 'not_started', 'published', 'rejected', 'needs_readback'].includes(prior.stage))) {
  console.log(`${store}: ${prior?.stage ?? 'not_started'}`);
} else {
  const result = await deliver(release, adapters[store]!(), journal);
  console.log(`${store}: ${result.stage}`);
  if (env('GITHUB_STEP_SUMMARY')) await appendFile(env('GITHUB_STEP_SUMMARY'), `${store}: **${result.stage}** — [journal](https://github.com/${env('GITHUB_REPOSITORY')}/issues?q=${encodeURIComponent(`[delivery] ${env('RELEASE_TAG')} / ${store}`)})\n\n`);
  if (['requires_setup', 'needs_readback', 'rejected'].includes(result.stage)) process.exitCode = 1;
}
