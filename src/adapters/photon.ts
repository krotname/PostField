import type { AddressProvider } from '../application/ports.js';
import { ProviderError } from '../application/lookup-postcode.js';
import type { Address, AddressCandidate } from '../core/address.js';
import { isCountryCode } from '../core/address.js';
import { providerJson, record } from './provider-http.js';

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, ms);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}
export class PhotonProvider implements AddressProvider {
  private tail: Promise<unknown> = Promise.resolve();
  private nextRequest = 0;
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  resolve(address: Address, signal?: AbortSignal): Promise<readonly AddressCandidate[]> {
    const request = this.tail.catch(() => {}).then(async () => {
      signal?.throwIfAborted();
      const wait = this.nextRequest - Date.now();
      if (wait > 30_000) throw new ProviderError('quota');
      if (wait > 0) await delay(wait, signal);
      signal?.throwIfAborted();
      this.nextRequest = Date.now() + 1000;
      const url = new URL('https://photon.komoot.io/api/');
      url.search = new URLSearchParams({ q: [address.city, address.street, address.house, address.region, 'Россия'].filter(Boolean).join(', '),
        countrycode: address.country, lang: 'default', limit: '10', dedupe: '0' }).toString();
      const body = await providerJson(this.fetcher, url, { method: 'GET', ...(signal ? { signal } : {}) }, (response) => {
        if (response.status !== 429) return;
        const retry = response.headers.get('Retry-After');
        const seconds = retry && /^\d+$/u.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 3000;
        this.nextRequest = Date.now() + Math.max(1000, Number.isFinite(seconds) ? seconds : 3000);
      });
      if (!record(body) || !Array.isArray(body.features)) throw new ProviderError('invalid_response');
      return body.features.slice(0, 10).flatMap((feature: unknown): AddressCandidate[] => {
        if (!record(feature) || !record(feature.properties)) return [];
        const properties = feature.properties;
        const text = (key: string) => typeof properties[key] === 'string' ? (properties[key] as string).slice(0, 300) : '';
        const country = text('countrycode').toLowerCase();
        if (!isCountryCode(country) || !text('postcode')) return [];
        const city = text('city'), street = text('street'), house = text('housenumber');
        return [{ country, city, street, house, postcode: text('postcode'), resultType: house ? 'building' : 'street',
          ...(text('state') ? { region: text('state') } : {}), formatted: [city, street || text('name'), house].filter(Boolean).join(', '),
          quality: { source: 'photon', explicitAddress: !!city && !!street && !!house } }];
      });
    });
    this.tail = request;
    return request;
  }
}
