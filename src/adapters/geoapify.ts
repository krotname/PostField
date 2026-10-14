import { isCountryCode } from '../core/address.js';
import type { Address, AddressCandidate } from '../core/address.js';
import type { AddressProvider, CredentialStore } from '../application/ports.js';
import { ProviderError } from '../application/lookup-postcode.js';
import { correctRussianPostcode } from './russia-postcode-corrections.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function candidateFrom(value: unknown): AddressCandidate | null {
  if (!isRecord(value) || !isCountryCode(value.country_code) || !isRecord(value.rank)
    || typeof value.rank.confidence !== 'number' || !Number.isFinite(value.rank.confidence)
    || value.rank.confidence < 0 || value.rank.confidence > 1 || typeof value.postcode !== 'string') return null;
  const text = (field: string): string => typeof value[field] === 'string' ? (value[field] as string).slice(0, 300) : '';
  return { country: value.country_code, city: text('city') || text('town') || text('village'), street: text('street'),
    house: text('housenumber'), postcode: value.postcode, confidence: value.rank.confidence,
    ...(text('state') ? { region: text('state') } : {}),
    resultType: text('result_type'), formatted: text('formatted'),
    ...(value.country_code === 'ru' ? { requiresPostcodeConfirmation: true } : {}) };
}

export class GeoapifyProvider implements AddressProvider {
  constructor(private readonly credentials: CredentialStore, private readonly fetcher: typeof fetch = fetch) {}

  async resolve(address: Address, signal?: AbortSignal): Promise<readonly AddressCandidate[]> {
    const key = await this.credentials.read();
    if (!key) throw new ProviderError('missing_key');
    const url = new URL('https://api.geoapify.com/v1/geocode/search');
    url.search = new URLSearchParams({ apiKey: key, city: address.city, street: address.street, housenumber: address.house,
      ...(address.region ? { state: address.region } : {}), filter: `countrycode:${address.country}`,
      bias: 'countrycode:none', format: 'json', limit: '5', lang: address.country === 'ru' ? 'ru' : 'en' }).toString();
    try {
      const timeout = AbortSignal.timeout(10_000);
      const response = await this.fetcher(url, { method: 'GET', credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
      if (response.status === 401 || response.status === 403) throw new ProviderError('unauthorized');
      if (response.status === 429) throw new ProviderError('quota');
      if (!response.ok) throw new ProviderError('offline');
      const body: unknown = await response.json();
      if (!isRecord(body) || !Array.isArray(body.results)) throw new ProviderError('invalid_response');
      return body.results.slice(0, 5).map(candidateFrom).filter((candidate): candidate is AddressCandidate => candidate !== null)
        .map((candidate) => correctRussianPostcode(address, candidate))
        .filter((candidate): candidate is AddressCandidate => candidate !== null);
    } catch (error: unknown) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) throw new ProviderError('invalid_response');
      throw new ProviderError(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'offline');
    }
  }
}
