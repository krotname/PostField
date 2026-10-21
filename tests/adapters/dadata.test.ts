import { expect, it, vi } from 'vitest';
import { DaDataProvider } from '../../src/adapters/dadata.js';
import { classifyCandidates } from '../../src/core/address-policy.js';

const address = { country: 'ru' as const, city: 'Тестоград', street: 'Тестовая улица', house: '13к2' };
const credentials = { read: async () => JSON.stringify({ token: 'test-token', secret: 'test-secret' }), write: async () => {} };
const house = { country_iso_code: 'RU', city: address.city, street_with_type: address.street, house: '13', block_type: 'к', block: '2',
  postal_code: '123456', house_fias_id: 'house-id', fias_actuality_state: '0', qc: 0, qc_house: 2, qc_complete: 5, result: 'Тестовый адрес' };
it('uses the Clean POST contract with isolated token and secret and verifies house quality', async () => {
  const fetcher = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => Response.json([house]));
  const candidates = await new DaDataProvider(credentials, fetcher).resolve(address);
  const [url, request] = fetcher.mock.calls[0]!;
  expect(String(url)).toBe('https://cleaner.dadata.ru/api/v1/clean/address');
  expect(request).toMatchObject({ method: 'POST', headers: { Authorization: 'Token test-token', 'X-Secret': 'test-secret' } });
  expect(JSON.parse(String(request?.body))).toHaveLength(1);
  expect(classifyCandidates(address, candidates).kind).toBe('confirmed');
});
it.each([{ qc: 1 }, { qc_house: 10 }, { qc_complete: 10 }, { fias_actuality_state: '99' },
  { house_fias_id: null }, { block: null }, { city: null }])('requires choice for deficient house quality %j', async (difference) => {
  const candidates = await new DaDataProvider(credentials, async () => Response.json([{ ...house, ...difference }])).resolve(address);
  expect(classifyCandidates(address, candidates).kind).not.toBe('confirmed');
});
it.each([[401, 'unauthorized'], [403, 'balance'], [429, 'quota'], [503, 'http']] as const)('distinguishes HTTP %s as %s', async (status, code) => {
  await expect(new DaDataProvider(credentials, async () => new Response('', { status })).resolve(address)).rejects.toMatchObject({ code });
});
it('does not issue a paid request without both credentials', async () => {
  const fetcher = vi.fn();
  await expect(new DaDataProvider({ ...credentials, read: async () => JSON.stringify({ token: 'only-token' }) }, fetcher).resolve(address))
    .rejects.toMatchObject({ code: 'missing_key' });
  expect(fetcher).not.toHaveBeenCalled();
});
