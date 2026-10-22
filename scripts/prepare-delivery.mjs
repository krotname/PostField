import { appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gh, requireGreenCI } from './trusted-ci.mjs';
const repo = process.env.GITHUB_REPOSITORY;
let tag = process.env.RELEASE_TAG;
if (!tag) {
  const releases = JSON.parse(gh(['api', `repos/${repo}/releases?per_page=100`]));
  tag = releases.find((item) => !item.draft && !item.prerelease)?.tag_name;
  if (!tag) { console.log('No stable release to resume.'); process.exit(0); }
}
if (!/^v\d+\.\d+\.\d+$/u.test(tag)) throw new Error('invalid_release_tag');
const release = JSON.parse(gh(['api', `repos/${repo}/releases/tags/${tag}`]));
if (release.draft || release.prerelease || !release.immutable) throw new Error('release_must_be_stable_and_immutable');
const sha = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim();
execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main']);
requireGreenCI(repo, sha);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\nsha=${sha}\n`);
