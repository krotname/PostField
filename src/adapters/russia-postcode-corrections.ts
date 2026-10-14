import type { Address, AddressCandidate } from '../core/address.js';
import { normalizeComponent } from '../core/address-policy.js';
import catalogue from '../data/russia-postcode-corrections.json';

function sameRegion(left: string | undefined, right: string): boolean {
  return !!left && normalizeComponent(left, 'city', 'ru') === normalizeComponent(right, 'city', 'ru');
}

function sameHouse(left: Address, right: Address): boolean {
  return left.country === right.country && (['city', 'street', 'house'] as const)
    .every((part) => normalizeComponent(left[part], part, 'ru') === normalizeComponent(right[part], part, 'ru'));
}

export function correctRussianPostcode(address: Address, candidate: AddressCandidate): AddressCandidate | null {
  if (address.country !== 'ru' || candidate.country !== 'ru') return candidate;
  const correction = catalogue.entries.find((entry) => {
    const house: Address = { ...entry.address, country: 'ru' };
    return sameHouse(address, house)
      && sameRegion(address.region?.trim() || candidate.region, entry.address.region)
      && [entry.observedPostcode, entry.correctPostcode].includes(candidate.postcode);
  });
  if (!correction) return candidate;
  const house: Address = { ...correction.address, country: 'ru' };
  if (!sameHouse(candidate, house) || !sameRegion(candidate.region, correction.address.region)) {
    return candidate.postcode === correction.observedPostcode ? null : candidate;
  }
  return { ...candidate, postcode: correction.correctPostcode, requiresPostcodeConfirmation: false,
    formatted: candidate.formatted.replace(/(?<!\d)\d{6}(?!\d)/gu, (postcode) =>
      postcode === correction.observedPostcode ? correction.correctPostcode : postcode) };
}
