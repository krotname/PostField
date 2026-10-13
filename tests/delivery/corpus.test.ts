import { describe, expect, it } from 'vitest';
import { inspectCorpus } from '../../scripts/corpus.js';
const row = (index: number, region = `Регион ${index % 10}`) => ({ address: { country: 'ru', city: `Город ${index}`, street: 'улица Мира', house: '1', region }, postcode: '123456', source: 'https://university.test/contact' });
describe('independent Russia corpus', () => {
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
