export const COUNTRY_CODES = ['ru', 'us', 'ca', 'gb', 'de'] as const;
export type CountryCode = typeof COUNTRY_CODES[number];

export interface Address {
  readonly country: CountryCode;
  readonly city: string;
  readonly street: string;
  readonly house: string;
  readonly region?: string;
}

export interface AddressCandidate {
  readonly country: CountryCode;
  readonly city: string;
  readonly street: string;
  readonly house: string;
  readonly region?: string;
  readonly postcode: string;
  readonly confidence: number;
  readonly resultType: string;
  readonly formatted: string;
  readonly requiresPostcodeConfirmation?: boolean;
}

export type LookupErrorCode = 'missing_key' | 'unauthorized' | 'quota' | 'timeout' | 'offline' | 'http' | 'service' | 'storage' | 'invalid_response';
export type LookupResult =
  | { readonly kind: 'confirmed'; readonly candidate: AddressCandidate }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly AddressCandidate[] }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'error'; readonly code: LookupErrorCode };

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && COUNTRY_CODES.some((country) => country === value);
}

export function isAddress(value: unknown): value is Address {
  if (typeof value !== 'object' || value === null) return false;
  const fields = value as Record<string, unknown>;
  return isCountryCode(fields.country)
    && ['city', 'street', 'house'].every((field) => typeof fields[field] === 'string' && (fields[field] as string).length <= 180)
    && (fields.region === undefined || (typeof fields.region === 'string' && fields.region.length <= 180));
}
