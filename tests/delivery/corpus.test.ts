import { describe, expect, it } from 'vitest';
import { inspectCorpus } from '../../scripts/corpus.js';
import baseline from '../fixtures/russia-corpus.json';
import catalogue from '../../src/data/russia-postcode-corrections.json';
import { correctionAddressKey } from '../../src/adapters/russia-postcode-corrections.js';
const row = (index: number, region = `Регион ${index % 10}`) => ({ address: { country: 'ru', city: `Город ${index}`, street: 'улица Мира', house: '1', region }, postcode: '123456', source: 'https://university.test/contact' });
describe('independent Russia corpus', () => {
  it.each([
    ['Самара', 'Брусчатый переулок'],
    ['Тольятти', 'ул. Татищева'],
  ])('rejects historical source reuse despite alternate street spelling in %s', (city, street) => {
    const historical = baseline.find(entry => entry.address.city === city && /Брусчат|Татищев/u.test(entry.address.street));
    expect(historical).toBeDefined();
    if (!historical) return;
    const alias = { ...historical, source: `${historical.source}?view=print#address`,
      address: { ...historical.address, street } };
    expect(() => inspectCorpus([alias])).toThrow('historical_corpus_overlap');
  });
  it('rejects a historical baseline address even when it is absent from the corrections catalogue', () => {
    const catalogueKeys = new Set(catalogue.entries.map((entry) => correctionAddressKey({ ...entry.address, country: 'ru' })));
    const historical = baseline.find((entry) => !catalogueKeys.has(correctionAddressKey({ ...entry.address, country: 'ru' })));
    expect(historical).toBeDefined();
    expect(() => inspectCorpus([historical])).toThrow('historical_corpus_overlap');
  });
  it('rejects historical baseline aliases before any provider evaluation', () => {
    const historical = baseline.find((entry) => /ул$/u.test(entry.address.street));
    expect(historical).toBeDefined();
    if (!historical) return;
    const alias = { ...historical, address: { ...historical.address, city: `г. ${historical.address.city}`,
      street: `улица ${historical.address.street.replace(/\s+ул$/u, '')}` } };
    expect(() => inspectCorpus([alias])).toThrow('historical_corpus_overlap');
  });
  it('rejects a catalogue address before it can count as independent evidence', () => {
    const excluded = [{ ...row(0).address, country: 'ru' as const }];
    expect(() => inspectCorpus([row(0)], excluded)).toThrow('catalogue_corpus_overlap');
    expect(inspectCorpus([row(1)], excluded).uniqueCases).toBe(1);
  });
  it('recognizes training addresses despite street-type spelling changes', () => {
    const source = { ...row(0), address: { ...row(0).address, street: 'Дзержинского пр-кт' } };
    const excluded = [{ ...source.address, country: 'ru' as const, street: 'проспект Дзержинского' }];
    expect(() => inspectCorpus([source], excluded)).toThrow('catalogue_corpus_overlap');
  });
  it('rejects copies of the same normalized address before provider calls', () => {
    const rows = Array.from({ length: 100 }, () => row(0));
    expect(() => inspectCorpus(rows)).toThrow('duplicate_corpus_address');
    expect(() => inspectCorpus([row(0), { ...row(0), address: { ...row(0).address, city: '  ГОРОД 0 ' } }])).toThrow('duplicate_corpus_address');
  });
  it('requires at least ten regions and limits any region to twenty percent', () => {
    expect(inspectCorpus(Array.from({ length: 100 }, (_, i) => row(i)))).toMatchObject({ eligible: true, uniqueCases: 100, regions: 10, largestRegionShare: 0.1 });
    expect(inspectCorpus(Array.from({ length: 100 }, (_, i) => row(i, 'Один регион'))).eligible).toBe(false);
    expect(inspectCorpus(Array.from({ length: 100 }, (_, i) => row(i, i < 30 ? 'Большой регион' : `Регион ${i % 10}`))).eligible).toBe(false);
  });
  it('rejects foreign cases, missing official source and malformed expected postcode', () => {
    for (const invalid of [{ ...row(0), source: '' }, { ...row(0), postcode: '12345' }, { ...row(0), address: { ...row(0).address, country: 'us' } }]) expect(() => inspectCorpus([invalid])).toThrow('invalid_corpus_case');
  });
});
