import { execFileSync } from 'node:child_process';

export const measuredPaths = ['src', 'scripts', 'extension', 'tests/fixtures', 'package.json', 'package-lock.json', 'tsconfig.json'];

export function verifyEvidenceRevision(measured, released = 'HEAD', cwd = process.cwd()) {
  try {
    if (typeof measured !== 'string' || !/^[a-f0-9]{40}$/u.test(measured)) throw new Error();
    const options = { cwd, stdio: ['ignore', 'pipe', 'pipe'] };
    execFileSync('git', ['merge-base', '--is-ancestor', measured, released], options);
    execFileSync('git', ['diff', '--quiet', measured, released, '--', ...measuredPaths], options);
  } catch { throw new Error('quality_evidence_revision_mismatch'); }
}
