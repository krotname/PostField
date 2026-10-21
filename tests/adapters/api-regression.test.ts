import { expect, it, vi } from 'vitest';
import { GeoapifyProvider } from '../../src/adapters/geoapify.js';
import { LookupPostcode } from '../../src/application/lookup-postcode.js';
const credentials = { read: async () => 'test-key', write: async () => {} };
const address = { country: 'ru' as const, city: 'Тестовый город', street: 'Тестовая', house: '15' };
it('calls the browser fetch function without the provider as its receiver', async () => {
  const fetcher = async function (this: unknown): Promise<Response> {
    if (this !== undefined) throw new TypeError('Illegal invocation');
    return new Response(JSON.stringify({ results: [] }));
  };
  expect(await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(address))
    .toEqual({ kind: 'not_found' });
});
it.each([400, 502, 503])('distinguishes HTTP %s from a network error', async (status) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
  expect(await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(address))
    .toEqual({ kind: 'error', code: 'http' });
});
it('automatically accepts a single exact Russian building outside the correction catalogue', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{
    country_code: 'ru', city: address.city, street: address.street, housenumber: address.house, postcode: '123456',
    result_type: 'building', rank: { confidence: 1 } }] })));
  expect((await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(address)).kind).toBe('confirmed');
});
