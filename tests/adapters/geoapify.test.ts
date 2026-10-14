import { describe, expect, it, vi } from 'vitest';
import { GeoapifyProvider } from '../../src/adapters/geoapify.js';
import { LookupPostcode, ProviderError } from '../../src/application/lookup-postcode.js';
import type { CredentialStore } from '../../src/application/ports.js';

const credentials: CredentialStore = { read: async () => 'test-key', write: async () => {} };
const address = { country: 'ru' as const, city: 'Москва', street: 'Тверская улица', house: '13' };
const raw = { country_code: 'ru', city: 'Москва', street: 'Тверская улица', housenumber: '13', postcode: '125009', result_type: 'building', rank: { confidence: 1 }, formatted: 'Москва, Тверская улица, 13' };

describe('Geoapify HTTP contract', () => {
  it.each(['185000', '185002'])('uses the verified postcode for an exact catalogue address returning %s', async (postcode) => {
    const input = { country: 'ru' as const, region: 'Республика Карелия', city: 'Петрозаводск', street: 'Чапаева ул', house: '52' };
    const response = { ...raw, state: input.region, city: input.city, street: 'улица Чапаева', housenumber: input.house,
      postcode, formatted: `улица Чапаева 52, Петрозаводск, Россия, ${postcode}` };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).toBe('confirmed');
    if (result.kind === 'confirmed') {
      expect(result.candidate.postcode).toBe('185002');
      expect(result.candidate.formatted).toContain('185002');
      expect(result.candidate.formatted).not.toContain('185000');
    }
  });
  it.each([
    { house: '54' }, { city: 'Москва' }, { street: 'Другая улица' }, { region: 'Московская область' },
  ])('does not apply a catalogue correction to a different address: %j', async (change) => {
    const input = { country: 'ru' as const, region: 'Республика Карелия', city: 'Петрозаводск', street: 'Чапаева ул', house: '52', ...change };
    const response = { ...raw, state: input.region, city: input.city, street: input.street, housenumber: input.house, postcode: '185000' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.candidates[0]).toMatchObject({ postcode: '185000', requiresPostcodeConfirmation: true });
  });
  it('requires confirmation when a known address returns an unrecorded postcode', async () => {
    const input = { country: 'ru' as const, region: 'Республика Карелия', city: 'Петрозаводск', street: 'Чапаева ул', house: '52' };
    const response = { ...raw, state: input.region, city: input.city, street: input.street, housenumber: input.house, postcode: '185099' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.candidates[0]?.postcode).toBe('185099');
  });
  it('filters a recorded wrong postcode when the provider returns a different house for a known address', async () => {
    const input = { country: 'ru' as const, region: 'Республика Карелия', city: 'Петрозаводск', street: 'Чапаева ул', house: '52' };
    const response = { ...raw, state: input.region, city: input.city, street: input.street, housenumber: '50', postcode: '185000' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    expect(await new GeoapifyProvider(credentials, fetcher).resolve(input)).toEqual([]);
  });
  it('requires postcode proof for a Russian house with full geocoding confidence', async () => {
    // ФНС: Чапаева, 52, Петрозаводск — 185002; live Geoapify returned 185000.
    const input = { country: 'ru' as const, city: 'Петрозаводск', street: 'Чапаева ул', house: '52' };
    const response = { ...raw, city: input.city, street: 'улица Чапаева', housenumber: '52', postcode: '185000' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.candidates[0]).toMatchObject({ postcode: '185000', requiresPostcodeConfirmation: true });
  });
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
