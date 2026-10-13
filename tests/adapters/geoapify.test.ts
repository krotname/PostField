import { describe, expect, it, vi } from 'vitest';
import { GeoapifyProvider } from '../../src/adapters/geoapify.js';
import { ProviderError } from '../../src/application/lookup-postcode.js';
import type { CredentialStore } from '../../src/application/ports.js';

const credentials: CredentialStore = { read: async () => 'test-key', write: async () => {} };
const address = { country: 'ru' as const, city: 'Москва', street: 'Тверская улица', house: '13' };
const raw = { country_code: 'ru', city: 'Москва', street: 'Тверская улица', housenumber: '13', postcode: '125009', result_type: 'building', rank: { confidence: 1 }, formatted: 'Москва, Тверская улица, 13' };

describe('Geoapify HTTP contract', () => {
  it('sends only structured address, explicit country filter and no IP bias', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [raw] })));
    const provider = new GeoapifyProvider(credentials, fetcher);
    const result = await provider.resolve(address);
    const args = fetcher.mock.calls[0];
    expect(args).toBeDefined();
    const url = new URL(String(args?.[0]));
    expect(url.origin).toBe('https://api.geoapify.com');
    expect(url.searchParams.get('filter')).toBe('countrycode:ru');
    expect(url.searchParams.get('bias')).toBe('countrycode:none');
    expect(url.searchParams.get('apiKey')).toBe('test-key');
    expect(url.searchParams.get('housenumber')).toBe('13');
    expect(url.searchParams.has('text')).toBe(false);
    expect(args?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(result[0]).toMatchObject({ postcode: '125009', confidence: 1 });
  });
  it.each([[401, 'unauthorized'], [403, 'unauthorized'], [429, 'quota'], [500, 'offline']] as const)(
    'reports status %s without leaking the key or retrying', async (status, code) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('server secret response', { status }));
      await expect(new GeoapifyProvider(credentials, fetcher).resolve(address)).rejects.toEqual(new ProviderError(code));
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('retains provider state for checking a same-named city in another region', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ ...raw, state: 'Свердловская область' }] })));
    expect((await new GeoapifyProvider(credentials, fetcher).resolve({ ...address, region: 'Свердловская область' }))[0])
      .toMatchObject({ region: 'Свердловская область' });
  });
  it('does not request the provider without a saved key', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new GeoapifyProvider({ ...credentials, read: async () => null }, fetcher).resolve(address)).rejects.toEqual(new ProviderError('missing_key'));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"unexpected": true}'));
    await expect(new GeoapifyProvider(credentials, fetcher).resolve(address)).rejects.toEqual(new ProviderError('invalid_response'));
  });
  it('does not coerce malformed confidence or numeric postcodes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [
      { ...raw, rank: { confidence: '1' } }, { ...raw, postcode: 125009 }, raw,
    ] })));
    expect(await new GeoapifyProvider(credentials, fetcher).resolve(address)).toHaveLength(1);
  });
});
