import { describe, expect, it } from 'vitest';
import { classifyCandidates, isCompleteAddress, normalizePostcode } from '../../src/core/address-policy.js';
import type { Address, AddressCandidate } from '../../src/core/address.js';

const address: Address = { country: 'ru', city: 'Москва', street: 'Тверская улица', house: '13' };
const exact: AddressCandidate = {
  country: 'ru', city: 'Москва', street: 'Тверская улица', house: '13',
  postcode: '125009', confidence: 1, resultType: 'building', formatted: 'Москва, Тверская улица, 13',
};

describe('postcode decisions', () => {
  it('confirms one exact house match', () => {
    expect(classifyCandidates(address, [exact])).toEqual({ kind: 'confirmed', candidate: exact });
  });
  it.each([
    { house: '15' }, { city: 'Тверь' }, { street: 'Тверской бульвар' },
    { country: 'de' as const }, { confidence: 0.99 }, { resultType: 'street' }, { postcode: '12500' },
  ])('never auto-fills a partial or mismatched result: %s', (difference) => {
    expect(classifyCandidates(address, [{ ...exact, ...difference }]).kind).not.toBe('confirmed');
  });
  it('requires choice for conflicting postcodes even at full confidence', () => {
    expect(classifyCandidates(address, [exact, { ...exact, postcode: '125010' }]).kind).toBe('ambiguous');
  });
  it('does not erase house suffixes while matching', () => {
    expect(classifyCandidates({ ...address, house: '13к1' }, [exact]).kind).not.toBe('confirmed');
  });
  it('deduplicates identical candidate records', () => {
    expect(classifyCandidates(address, [exact, exact]).kind).toBe('confirmed');
  });
  it('reports no result without inventing a postcode', () => {
    expect(classifyCandidates(address, [])).toEqual({ kind: 'not_found' });
  });
  it('accepts common Russian street/house prefixes without removing identifying words', () => {
    expect(classifyCandidates({ ...address, street: 'ул. Тверская', house: 'д. 13' }, [exact]).kind).toBe('confirmed');
  });
  it('needs city, street and house', () => {
    expect(isCompleteAddress(address)).toBe(true);
    expect(isCompleteAddress({ ...address, house: '' })).toBe(false);
  });
  it.each([
    ['ru', '012345', '012345'], ['us', '00501', '00501'], ['us', '12345-6789', '12345-6789'],
    ['ca', 'k1a0b1', 'K1A 0B1'], ['gb', 'sw1a1aa', 'SW1A 1AA'], ['de', '01067', '01067'],
  ] as const)('keeps country formats as strings: %s', (country, input, expected) => {
    expect(normalizePostcode(country, input)).toBe(expected);
  });
  it.each([['ru', '12345'], ['ca', 'D1A 0B1'], ['us', '1234'], ['de', '123456'], ['gb', 'ABC 123']] as const)(
    'rejects invalid formats: %s', (country, input) => expect(normalizePostcode(country, input)).toBeNull(),
  );
});
