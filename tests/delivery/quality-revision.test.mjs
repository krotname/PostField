import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { verifyEvidenceRevision } from '../../scripts/quality-revision.mjs';

const directories = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function repository() {
  const cwd = mkdtempSync(join(tmpdir(), 'postfield-evidence-')); directories.push(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
  mkdirSync(join(cwd, 'src')); writeFileSync(join(cwd, 'src', 'policy.ts'), 'export const policy = 1;\n');
  git('add', '.'); git('commit', '-qm', 'policy');
  return { cwd, git, measured: git('rev-parse', 'HEAD') };
}

it('accepts evidence committed after the unchanged measured implementation', () => {
  const { cwd, git, measured } = repository();
  writeFileSync(join(cwd, 'report.json'), '{}'); git('add', '.'); git('commit', '-qm', 'evidence');
  expect(() => verifyEvidenceRevision(measured, 'HEAD', cwd)).not.toThrow();
});
it('rejects changed policy, unrelated history and missing revisions', () => {
  const { cwd, git, measured } = repository();
  writeFileSync(join(cwd, 'src', 'policy.ts'), 'export const policy = 2;\n'); git('add', '.'); git('commit', '-qm', 'changed policy');
  expect(() => verifyEvidenceRevision(measured, 'HEAD', cwd)).toThrow('quality_evidence_revision_mismatch');
  expect(() => verifyEvidenceRevision('f'.repeat(40), 'HEAD', cwd)).toThrow('quality_evidence_revision_mismatch');
  git('checkout', '--orphan', 'unrelated'); git('commit', '-qm', 'unrelated root');
  expect(() => verifyEvidenceRevision(measured, 'HEAD', cwd)).toThrow('quality_evidence_revision_mismatch');
});
