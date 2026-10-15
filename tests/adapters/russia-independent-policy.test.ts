import { describe, expect, it, vi } from 'vitest';
import { GeoapifyProvider } from '../../src/adapters/geoapify.js';
import { LookupPostcode } from '../../src/application/lookup-postcode.js';
import { inspectCorpus } from '../../scripts/corpus.js';
import corpus from '../fixtures/russia-independent-corpus.json';
import catalogue from '../../src/data/russia-postcode-corrections.json';
import provenance from '../../docs/evidence/russia-independent-corpus-provenance.json';

describe('unseen Russia addresses', () => {
  it('keeps a separate official corpus outside the historical baseline and correction catalogue', () => {
    const excluded = catalogue.entries.map(entry => ({ ...entry.address, country: 'ru' as const }));
    expect(inspectCorpus(corpus, excluded)).toMatchObject({ eligible: true, uniqueCases: 100, regions: 41, largestRegionShare: 0.09 });
    expect(provenance.providerRequests).toBe(0);
    expect(provenance.evidence).toHaveLength(corpus.length);
    for (const [index, row] of corpus.entries()) {
      const evidence = provenance.evidence[index];
      expect(evidence?.source).toBe(row.source);
      expect(new URL(row.source).hostname).toBe('www.nalog.gov.ru');
      expect(JSON.stringify(evidence)).toContain(row.postcode);
    }
  });

  it('still requires a user choice for every unseen address even with an ideal provider answer', async () => {
    const excluded = catalogue.entries.map(entry => ({ ...entry.address, country: 'ru' as const }));
    const { rows } = inspectCorpus(corpus, excluded);
    for (const { address, postcode } of rows) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{
        country_code: address.country, state: address.region, city: address.city, street: address.street,
        housenumber: address.house, postcode, rank: { confidence: 1 }, result_type: 'building', formatted: postcode,
      }] })));
      const provider = new GeoapifyProvider({ read: async () => 'synthetic-test-key', write: async () => {} }, fetcher);
      const result = await new LookupPostcode(provider).execute(address);
      expect(result.kind).toBe('ambiguous');
      if (result.kind !== 'ambiguous') throw new Error('unseen_postcode_was_not_a_manual_choice');
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({ postcode, requiresPostcodeConfirmation: true });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
});
