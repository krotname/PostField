import type { Address, AddressCandidate, CountryCode, LookupResult } from './address.js';

function normalizeWords(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/gu, 'е').replace(/[.,]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function normalizeComponent(value: string, kind: 'city' | 'street' | 'house', country: CountryCode): string {
  let result = kind === 'house' ? value.normalize('NFKC').toLocaleLowerCase('ru').trim() : normalizeWords(value);
  if (country === 'ru') {
    if (kind === 'city') result = result.replace(/^(?:город|г)\s+/u, '');
    if (kind === 'street') result = result.replace(/^(?:улица|ул)\s+/u, '').replace(/\s+(?:улица|ул)$/u, '');
    if (kind === 'house') result = result.replace(/^(?:дом|д)\.?\s*/u, '').replace(/\s*корпус\s*/gu, 'к').replace(/\s*строение\s*/gu, 'с');
  }
  return kind === 'house' ? result.replace(/\s/gu, '') : result;
}

export function isCompleteAddress(address: Address): boolean {
  return [address.city, address.street, address.house].every((part) => part.trim().length > 0);
}

export function normalizePostcode(country: CountryCode, value: string): string | null {
  const code = value.trim().toUpperCase();
  switch (country) {
    case 'ru': return /^\d{6}$/u.test(code) ? code : null;
    case 'us': return /^\d{5}(?:-\d{4})?$/u.test(code) ? code : null;
    case 'de': return /^\d{5}$/u.test(code) ? code : null;
    case 'ca': {
      const compact = code.replace(/\s/gu, '');
      return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/u.test(compact)
        ? `${compact.slice(0, 3)} ${compact.slice(3)}` : null;
    }
    case 'gb': {
      const compact = code.replace(/\s/gu, '');
      return /^(?:GIR0AA|(?:[A-PR-UWYZ]\d\d?|[A-PR-UWYZ][A-HK-Y]\d\d?|[A-PR-UWYZ]\d[A-HJKPSTUW]|[A-PR-UWYZ][A-HK-Y]\d[ABEHMNPRVWXY])\d[ABD-HJLNP-UW-Z]{2})$/u.test(compact)
        ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : null;
    }
  }
}

export function addressKey(address: Address): string {
  return JSON.stringify([address.country, normalizeComponent(address.city, 'city', address.country),
    normalizeComponent(address.street, 'street', address.country), normalizeComponent(address.house, 'house', address.country), address.region?.trim() ?? '']);
}

export function classifyCandidates(address: Address, candidates: readonly AddressCandidate[]): LookupResult {
  const unique = [...new Map(candidates.filter((candidate) => candidate.country === address.country
    && normalizePostcode(candidate.country, candidate.postcode) !== null)
    .map((candidate) => [JSON.stringify([candidate.country, candidate.city, candidate.street, candidate.house, candidate.region, candidate.postcode,
      candidate.requiresPostcodeConfirmation === true]), candidate])).values()];
  if (unique.length === 0) return { kind: 'not_found' };
  const candidate = unique[0];
  if (unique.length === 1 && candidate && candidate.requiresPostcodeConfirmation !== true && candidate.confidence === 1 && candidate.resultType === 'building'
    && (!address.region?.trim() || (!!candidate.region && normalizeWords(address.region) === normalizeWords(candidate.region)))
    && (['city', 'street', 'house'] as const).every((part) => normalizeComponent(address[part], part, address.country)
      === normalizeComponent(candidate[part], part, address.country))) {
    return { kind: 'confirmed', candidate: { ...candidate, postcode: normalizePostcode(candidate.country, candidate.postcode) ?? candidate.postcode } };
  }
  return { kind: 'ambiguous', candidates: unique };
}
