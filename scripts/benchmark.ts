import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runRussiaBenchmark } from './russia-benchmark.js';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const paths = ['src', 'scripts', 'extension', 'tests/fixtures', 'package.json', 'package-lock.json', 'tsconfig.json'];
const dirty = execFileSync('git', ['status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
if (dirty.trim()) throw new Error('benchmark_requires_clean_implementation');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const report = await runRussiaBenchmark(JSON.parse(await readFile(process.env.CORPUS_PATH
  ?? 'tests/fixtures/russia-independent-corpus.json', 'utf8')), {
  env: process.env, sourceVersion: pkg.version, sourceRevision,
});
if (process.env.REPORT_PATH) await writeFile(process.env.REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
