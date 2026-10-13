import { readFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gh } from './trusted-ci.mjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = `v${pkg.version}`;
const notes = `docs/releases/${pkg.version}.md`;
// Existing tags/releases are never replaced or clobbered.
const existing = JSON.parse(gh(['api', `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`]));
if (existing.some((release) => release.tag_name === tag)) throw new Error('release_already_exists');
const assets = JSON.parse(await readFile('artifacts/release-manifest.json', 'utf8')).assets.map((asset) => `artifacts/${asset.name}`);
const args = ['release', 'create', tag, ...assets, 'artifacts/release-manifest.json', '--target', process.env.GITHUB_SHA,
  '--title', `PostField ${pkg.version}`, '--notes-file', notes, '--draft'];
if (process.env.RELEASE_PREVIEW === 'true') args.push('--prerelease');
execFileSync('gh', args, { stdio: 'inherit' });
gh(['release', 'edit', tag, '--draft=false']);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
