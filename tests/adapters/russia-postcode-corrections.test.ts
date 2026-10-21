import { describe, expect, it, vi } from 'vitest';
import { GeoapifyProvider } from '../../src/adapters/geoapify.js';
import { LookupPostcode } from '../../src/application/lookup-postcode.js';
import type { Address } from '../../src/core/address.js';
import catalogue from '../../src/data/russia-postcode-corrections.json';
import corpus from '../fixtures/russia-corpus.json';
import recorded from '../fixtures/russia-known-errors.json';

const credentials = { read: async () => 'synthetic-key', write: async () => {} };

describe('recorded Russian postcode corrections', () => {
  it.each([
    { city: 'Новороссийск', region: 'Краснодарский край', street: 'проспект Дзержинского', house: '211', wrong: '353900', correct: '353925' },
    { city: 'Барнаул', region: 'Алтайский край', street: 'Социалистический проспект', house: '47', wrong: '656000', correct: '656068' },
    { city: 'Оренбург', region: 'Оренбургская область', street: 'Шарлыкское шоссе', house: '1/2', wrong: '460000', correct: '460019' },
  ])('recognizes expanded street types in $city', async (entry) => {
    const input: Address = { country: 'ru', city: entry.city, street: entry.street, house: entry.house, region: entry.region };
    const response = { country_code: 'ru', city: input.city, street: input.street, housenumber: input.house,
      state: input.region, postcode: entry.wrong, formatted: input.street, result_type: 'building', rank: { confidence: 1 } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).toBe('confirmed');
    if (result.kind === 'confirmed') expect(result.candidate.postcode).toBe(entry.correct);
  });
  it.each(['Социалистический улица', 'Социалистический проезд', 'Социалистический пр'])('preserves street type and requires confirmation only for ambiguous abbreviation %s', async (street) => {
    const input: Address = { country: 'ru', region: 'Алтайский край', city: 'Барнаул', street, house: '47' };
    const response = { country_code: 'ru', city: input.city, street, housenumber: input.house, state: input.region,
      postcode: '656000', formatted: street, result_type: 'building', rank: { confidence: 1 } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).toBe(street.endsWith(' пр') ? 'ambiguous' : 'confirmed');
    if (result.kind === 'confirmed') expect(result.candidate.postcode).toBe('656000');
    if (result.kind === 'ambiguous') expect(result.candidates[0]?.postcode).toBe(street.endsWith(' пр') ? '656068' : '656000');
  });
  it.each(recorded.filter((row) => row.baselineAutomatic))('corrects retained provider response for corpus row $corpusIndex', async ({ corpusIndex, response }) => {
    const reference = corpus[corpusIndex];
    expect(reference).toBeDefined();
    if (!reference) throw new Error('Missing independent address reference');
    const input: Address = { ...reference.address, country: 'ru' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).toBe('confirmed');
    if (result.kind === 'confirmed') expect(result.candidate.postcode).toBe(reference.postcode);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(recorded)('removes the recorded wrong postcode from the choices for corpus row $corpusIndex', async ({ corpusIndex, response }) => {
    const reference = corpus[corpusIndex];
    if (!reference) throw new Error('Missing independent address reference');
    const input: Address = { ...reference.address, country: 'ru' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
    const candidates = await new GeoapifyProvider(credentials, fetcher).resolve(input);
    const wrongPostcode = response.results[0]?.postcode;
    expect(candidates.every((candidate) => candidate.postcode !== wrongPostcode)).toBe(true);
  });

  it('keeps catalogue entries unique, sourced and traceable to the independent corpus', () => {
    expect(catalogue.schemaVersion).toBe(1);
    const keys = new Set<string>();
    for (const entry of catalogue.entries) {
      expect(entry.address.country).toBe('ru');
      expect(entry.observedPostcode).toMatch(/^\d{6}$/u);
      expect(entry.correctPostcode).toMatch(/^\d{6}$/u);
      expect(entry.observedPostcode).not.toBe(entry.correctPostcode);
      expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(new URL(entry.source).origin).toBe('https://www.nalog.gov.ru');
      const key = JSON.stringify(entry.address);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      expect(corpus.some((reference) => JSON.stringify(reference.address) === key
        && reference.source === entry.source && reference.postcode === entry.correctPostcode)).toBe(true);
    }
    expect(keys.size).toBe(recorded.length);
  });

  it.each([
    { state: 'Другая область' }, { city: 'Другой город' }, { street: 'Другая улица' }, { housenumber: '54' },
    { rank: { confidence: 0.9 } }, { result_type: 'street' },
  ])('does not automatically confirm a mismatched or weaker provider result: %j', async (change) => {
    const input: Address = { country: 'ru', region: 'Республика Карелия', city: 'Петрозаводск', street: 'Чапаева ул', house: '52' };
    const response = { country_code: 'ru', state: input.region, city: input.city, street: 'улица Чапаева', housenumber: '52',
      postcode: '185000', formatted: 'Петрозаводск, Чапаева 52, 185000', rank: { confidence: 1 }, result_type: 'building', ...change };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [response] })));
    const result = await new LookupPostcode(new GeoapifyProvider(credentials, fetcher)).execute(input);
    expect(result.kind).not.toBe('confirmed');
  });
});
