import { readFile } from 'node:fs/promises';
import { gh, requireGreenCI } from './trusted-ci.mjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.RELEASE_VERSION !== pkg.version) throw new Error('release_version_or_branch_mismatch');
requireGreenCI(process.env.GITHUB_REPOSITORY, process.env.GITHUB_SHA);
if (gh(['api', `repos/${process.env.GITHUB_REPOSITORY}/commits/main`, '--jq', '.sha']) !== process.env.GITHUB_SHA) throw new Error('main_changed');
