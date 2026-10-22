import { expect, it, vi } from 'vitest';
import { runRussiaBenchmark } from '../../scripts/russia-benchmark.js';
import historical from '../fixtures/russia-corpus.json';

const row = { address: { country: 'ru', city: 'Тестоград', street: 'Тестовая улица', house: '13', region: 'Тестовая область' },
  postcode: '123456', source: 'https://university.test/contact' };
const metadata = { sourceVersion: '0.3.0', sourceRevision: 'a'.repeat(40) };
const photon = { features: [{ properties: { countrycode: 'RU', city: row.address.city, street: row.address.street,
  housenumber: '13', state: row.address.region, postcode: row.postcode } }] };

it('measures the default Photon through the production lookup without a key', async () => {
  const fetcher = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => Response.json(photon));
  const report = await runRussiaBenchmark([row], { ...metadata, env: {}, fetcher });
  expect(report).toMatchObject({ providerId: 'photon', measurement: 'live', ...metadata,
    cases: 1, correctAutomatic: 1, wrongAutomatic: 0, unresolved: 0, errors: 0, status: 'insufficient' });
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('photon.komoot.io');
  expect(JSON.stringify(report)).not.toContain('Тестоград');
  expect(JSON.stringify(report)).not.toContain('123456');
});

it('uses DaData Clean without putting the expected postcode into its request', async () => {
  const fetcher = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => Response.json([{ country_iso_code: 'RU',
    city: row.address.city, street_with_type: row.address.street, house: '13', region_with_type: row.address.region,
    postal_code: row.postcode, house_fias_id: 'test-house', fias_actuality_state: '0', qc: 0, qc_house: 2, qc_complete: 5 }]));
  const report = await runRussiaBenchmark([row], { ...metadata, env: { POSTFIELD_PROVIDER: 'dadata', DADATA_API_KEY: 'test-token', DADATA_SECRET_KEY: 'test-secret' }, fetcher });
  expect(report).toMatchObject({ providerId: 'dadata', correctAutomatic: 1 });
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('cleaner.dadata.ru');
  expect(fetcher.mock.calls[0]?.[1]?.body).not.toContain(row.postcode);
  expect(JSON.stringify(report)).not.toMatch(/test-token|test-secret/);
});

it.each(['geoapify', 'dadata'])('rejects missing %s credentials before HTTP', async (providerId) => {
  const fetcher = vi.fn();
  await expect(runRussiaBenchmark([row], { ...metadata, env: { POSTFIELD_PROVIDER: providerId }, fetcher })).rejects.toThrow(/required/);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects unknown sources and training corpus before credentials or HTTP', async () => {
  const fetcher = vi.fn();
  await expect(runRussiaBenchmark([row], { ...metadata, env: { POSTFIELD_PROVIDER: 'typo' }, fetcher })).rejects.toThrow('invalid_benchmark_provider');
  const env = { POSTFIELD_PROVIDER: 'geoapify', get GEOAPIFY_API_KEY(): string { throw new Error('credential_was_read'); } };
  await expect(runRussiaBenchmark([historical[0]], { ...metadata, env, fetcher })).rejects.toThrow(/corpus_overlap/);
  expect(fetcher).not.toHaveBeenCalled();
});

it('counts a wrong automatic answer without treating it as unresolved', async () => {
  const fetcher = async () => Response.json({ features: [{ properties: { ...photon.features[0]!.properties, postcode: '654321' } }] });
  expect(await runRussiaBenchmark([row], { ...metadata, env: {}, fetcher })).toMatchObject({ wrongAutomatic: 1, correctAutomatic: 0, unresolved: 0, status: 'insufficient' });
});

it('stops on authorization or quota errors without a fallback or further paid calls', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 401 }));
  const other = { ...row, address: { ...row.address, house: '14' } };
  expect(await runRussiaBenchmark([row, other], { ...metadata, env: { POSTFIELD_PROVIDER: 'geoapify', GEOAPIFY_API_KEY: 'test-key' }, fetcher }))
    .toMatchObject({ cases: 2, attempted: 1, skipped: 1, errors: 1, unresolved: 2, status: 'insufficient', errorCounts: { unauthorized: 1 } });
  expect(fetcher).toHaveBeenCalledOnce();
});
