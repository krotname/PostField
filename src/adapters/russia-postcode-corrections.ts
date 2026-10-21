import type { Address, AddressCandidate } from '../core/address.js';
import { normalizeComponent } from '../core/address-policy.js';
import catalogue from '../data/russia-postcode-corrections.json';

function correctionStreet(value: string): string {
  const street = normalizeComponent(value, 'street', 'ru');
  const aliases: Readonly<Record<string, string>> = { 'пр-кт': 'проспект', 'пр-т': 'проспект', пр: 'проспект',
    проспект: 'проспект', ш: 'шоссе', шоссе: 'шоссе' };
  const words = street.split(' ');
  const first = words[0] ?? '';
  const last = words.at(-1) ?? '';
  if (words.length > 1 && aliases[first]) return `${aliases[first]}/${words.slice(1).join(' ')}`;
  if (words.length > 1 && aliases[last]) return `${aliases[last]}/${words.slice(0, -1).join(' ')}`;
  return street;
}

export function correctionAddressKey(address: Address): string {
  return JSON.stringify([address.country, normalizeComponent(address.city, 'city', address.country), correctionStreet(address.street),
    normalizeComponent(address.house, 'house', address.country), normalizeComponent(address.region ?? '', 'city', address.country)]);
}

function sameRegion(left: string | undefined, right: string): boolean {
  return !!left && normalizeComponent(left, 'city', 'ru') === normalizeComponent(right, 'city', 'ru');
}

function sameHouse(left: Address, right: Address): boolean {
  return left.country === right.country && (['city', 'street', 'house'] as const)
    .every((part) => part === 'street' ? correctionStreet(left.street) === correctionStreet(right.street)
      : normalizeComponent(left[part], part, 'ru') === normalizeComponent(right[part], part, 'ru'));
}

export function correctRussianPostcode(address: Address, candidate: AddressCandidate): AddressCandidate | null {
  if (address.country !== 'ru' || candidate.country !== 'ru') return candidate;
  const correction = catalogue.entries.find((entry) => {
    const house: Address = { ...entry.address, country: 'ru' };
    return sameHouse(address, house)
      && sameRegion(address.region?.trim() || candidate.region, entry.address.region)
      && [entry.observedPostcode, entry.correctPostcode].includes(candidate.postcode);
  });
  if (!correction) {
    // Keep known-problem houses conservative when region or postcode contradicts the catalogue.
    const known = catalogue.entries.some((entry) => sameHouse(address, { ...entry.address, country: 'ru' }));
    return known ? { ...candidate, requiresPostcodeConfirmation: true } : candidate;
  }
  const house: Address = { ...correction.address, country: 'ru' };
  if (!sameHouse(candidate, house) || !sameRegion(candidate.region, correction.address.region)) {
    return candidate.postcode === correction.observedPostcode ? null : candidate;
  }
  const ambiguousType = /(?:^|\s)пр(?:\.|\s|$)/u.test(address.street.toLocaleLowerCase('ru'));
  return { ...candidate, postcode: correction.correctPostcode, requiresPostcodeConfirmation: ambiguousType,
    formatted: candidate.formatted.replace(/(?<!\d)\d{6}(?!\d)/gu, (postcode) =>
      postcode === correction.observedPostcode ? correction.correctPostcode : postcode) };
}
