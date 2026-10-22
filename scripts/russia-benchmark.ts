import type { AddressProvider, CredentialStore } from '../src/application/ports.js';
import { LookupPostcode } from '../src/application/lookup-postcode.js';
import { PhotonProvider } from '../src/adapters/photon.js';
import { GeoapifyProvider } from '../src/adapters/geoapify.js';
import { DaDataProvider } from '../src/adapters/dadata.js';
import { isProviderId } from '../src/core/providers.js';
import { inspectCorpus } from './corpus.js';
import catalogue from '../src/data/russia-postcode-corrections.json';

interface BenchmarkOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly sourceVersion: string;
  readonly sourceRevision: string;
  readonly fetcher?: typeof fetch;
}

/** Expected postcodes never enter provider requests or aggregate reports. */
export async function runRussiaBenchmark(value: unknown, options: BenchmarkOptions) {
  const { env, sourceVersion, sourceRevision } = options;
  const providerId = env.POSTFIELD_PROVIDER ?? 'photon';
  if (!isProviderId(providerId)) throw new Error('invalid_benchmark_provider');
  const excluded = catalogue.entries.map((entry) => ({ ...entry.address, country: 'ru' as const }));
  const { rows, eligible, uniqueCases, regions, largestRegionShare } = inspectCorpus(value, excluded);
  const fetcher = options.fetcher ?? fetch;
  let provider: AddressProvider;
  const credentials = (key: string): CredentialStore => ({ read: async () => key,
    write: async () => { throw new Error('readonly_benchmark'); } });
  if (providerId === 'geoapify') {
    const key = env.GEOAPIFY_API_KEY;
    if (!key) throw new Error('GEOAPIFY_API_KEY_required');
    provider = new GeoapifyProvider(credentials(key), fetcher);
  } else if (providerId === 'dadata') {
    const token = env.DADATA_API_KEY, secret = env.DADATA_SECRET_KEY;
    if (!token || !secret) throw new Error('DADATA_API_KEY_and_DADATA_SECRET_KEY_required');
    provider = new DaDataProvider(credentials(JSON.stringify({ token, secret })), fetcher);
  } else provider = new PhotonProvider(fetcher);

  const startedAt = new Date().toISOString();
  const lookup = new LookupPostcode(provider);
  let correctAutomatic = 0, wrongAutomatic = 0, unresolved = 0, errors = 0, attempted = 0;
  const errorCounts: Record<string, number> = {};
  for (const row of rows) {
    attempted++;
    const result = await lookup.execute(row.address);
    if (result.kind === 'confirmed') {
      if (result.candidate.postcode === row.postcode) correctAutomatic++;
      else wrongAutomatic++;
    } else {
      unresolved++;
      if (result.kind === 'error') {
        errors++; errorCounts[result.code] = (errorCounts[result.code] ?? 0) + 1;
        if (['unauthorized', 'quota', 'balance', 'missing_key'].includes(result.code)) break;
      }
    }
  }
  const skipped = rows.length - attempted;
  unresolved += skipped;
  const confirmedRate = correctAutomatic / Math.max(1, rows.length);
  return { status: eligible && wrongAutomatic === 0 && errors === 0 && skipped === 0 && confirmedRate >= 0.9 ? 'passed' : 'insufficient',
    providerId, measurement: 'live', sourceVersion, sourceRevision, startedAt, checkedAt: new Date().toISOString(),
    cases: rows.length, uniqueCases, regions, largestRegionShare, attempted, skipped,
    correctAutomatic, wrongAutomatic, confirmedRate, unresolved, errors, errorCounts };
}
