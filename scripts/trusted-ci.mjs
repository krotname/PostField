import { execFileSync } from 'node:child_process';
export const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export function requireGreenCI(repo, sha) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repo) || !/^[a-f0-9]{40}$/u.test(sha)) throw new Error('invalid_release_identity');
  const runs = JSON.parse(gh(['api', `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=20`]));
  if (!runs.workflow_runs?.some((run) => run.head_sha === sha && run.head_branch === 'main' && run.conclusion === 'success')) throw new Error('main_ci_not_green');
}
