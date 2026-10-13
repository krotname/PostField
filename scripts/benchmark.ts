import { readFile, writeFile } from 'node:fs/promises';
import { GeoapifyProvider } from '../src/adapters/geoapify.js';
import { LookupPostcode } from '../src/application/lookup-postcode.js';
import type { Address } from '../src/core/address.js';
const key = process.env.GEOAPIFY_API_KEY;
if (!key) throw new Error('GEOAPIFY_API_KEY_required');
const corpus = JSON.parse(await readFile(process.env.CORPUS_PATH ?? 'tests/fixtures/russia-corpus.json', 'utf8')) as { address: Address; postcode: string; source: string }[];
const provider = new GeoapifyProvider({ read: async () => key, write: async () => { throw new Error('readonly_benchmark'); } });
const lookup = new LookupPostcode(provider);
let correct = 0; let wrongAutomatic = 0; let unresolved = 0; let errors = 0;
for (const row of corpus) {
  const result = await lookup.execute(row.address);
  if (result.kind === 'confirmed') { if (result.candidate.postcode === row.postcode) correct++; else wrongAutomatic++; }
  else { unresolved++; if (result.kind === 'error') errors++; }
}
const confirmedRate = correct / Math.max(1, corpus.length);
const report = { status: wrongAutomatic === 0 && errors === 0 && corpus.length >= 100 && confirmedRate >= 0.9 ? 'passed' : 'insufficient',
  cases: corpus.length, wrongAutomatic, confirmedRate, unresolved, errors, checkedAt: new Date().toISOString() };
if (process.env.REPORT_PATH) await writeFile(process.env.REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
