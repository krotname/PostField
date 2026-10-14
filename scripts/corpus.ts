import { isAddress } from '../src/core/address.js';
import type { Address } from '../src/core/address.js';
import { correctionAddressKey } from '../src/adapters/russia-postcode-corrections.js';

export interface CorpusCase { readonly address: Address; readonly postcode: string; readonly source: string }
const normalize = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** Reject duplicates before spending provider quota; region coverage is a separate release gate. */
export function inspectCorpus(value: unknown, excludedAddresses: readonly Address[] = []): { rows: readonly CorpusCase[]; uniqueCases: number; regions: number; largestRegionShare: number; eligible: boolean } {
  if (!Array.isArray(value) || value.length === 0) throw new Error('invalid_corpus_case');
  const rows: CorpusCase[] = [];
  const seen = new Set<string>();
  const regions = new Map<string, number>();
  const excluded = new Set(excludedAddresses.map(correctionAddressKey));
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new Error('invalid_corpus_case');
    const row = entry as Record<string, unknown>;
    if (!isAddress(row.address) || row.address.country !== 'ru'
      || [row.address.city, row.address.street, row.address.house].some((field) => !field.trim())
      || typeof row.postcode !== 'string' || !/^\d{6}$/.test(row.postcode)
      || typeof row.source !== 'string') throw new Error('invalid_corpus_case');
    let source: URL;
    try { source = new URL(row.source); } catch { throw new Error('invalid_corpus_case'); }
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('invalid_corpus_case');
    const address = row.address;
    const key = correctionAddressKey(address);
    if (excluded.has(key)) throw new Error('catalogue_corpus_overlap');
    if (seen.has(key)) throw new Error('duplicate_corpus_address');
    seen.add(key);
    if (address.region?.trim()) {
      const region = normalize(address.region);
      regions.set(region, (regions.get(region) ?? 0) + 1);
    }
    rows.push({ address, postcode: row.postcode, source: row.source });
  }
  const largestRegionShare = Math.max(0, ...regions.values()) / rows.length;
  return { rows, uniqueCases: seen.size, regions: regions.size, largestRegionShare,
    eligible: rows.length >= 100 && regions.size >= 10 && largestRegionShare <= 0.2
      && [...regions.values()].reduce((sum, count) => sum + count, 0) === rows.length };
}
