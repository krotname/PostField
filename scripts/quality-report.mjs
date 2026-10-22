import { readFile, writeFile } from 'node:fs/promises';
import { hasRussiaEvidence } from './quality-gate.mjs';
import { verifyEvidenceRevision } from './quality-revision.mjs';

const files = process.argv.slice(2);
if (files.length !== 3) throw new Error('three_provider_report_paths_required');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const reports = await Promise.all(files.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
const evidence = { schemaVersion: 2, reports };
if (!hasRussiaEvidence(evidence, pkg.version)) throw new Error('russia_quality_gate_not_met');
verifyEvidenceRevision(reports[0].sourceRevision);
await writeFile('docs/evidence/russia-quality.json', `${JSON.stringify(evidence, null, 2)}\n`);
