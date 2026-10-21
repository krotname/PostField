import type { AddressProvider, CredentialStore } from '../application/ports.js';
import { ProviderError } from '../application/lookup-postcode.js';
import type { Address, AddressCandidate } from '../core/address.js';
import { providerJson, record } from './provider-http.js';

export function parseDaDataCredentials(value: string | null): { token: string; secret: string } {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    return record(parsed) ? { token: typeof parsed.token === 'string' ? parsed.token : '', secret: typeof parsed.secret === 'string' ? parsed.secret : '' }
      : { token: '', secret: '' };
  } catch { return { token: '', secret: '' }; }
}
export class DaDataProvider implements AddressProvider {
  constructor(private readonly credentials: CredentialStore, private readonly fetcher: typeof fetch = fetch) {}
  async resolve(address: Address, signal?: AbortSignal): Promise<readonly AddressCandidate[]> {
    let saved: string | null;
    try { saved = await this.credentials.read('dadata'); } catch { throw new ProviderError('storage'); }
    const { token, secret } = parseDaDataCredentials(saved);
    if (!token || !secret) throw new ProviderError('missing_key');
    const body = await providerJson(this.fetcher, 'https://cleaner.dadata.ru/api/v1/clean/address', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${token}`, 'X-Secret': secret },
      body: JSON.stringify([[address.region, address.city, address.street, address.house].filter(Boolean).join(', ')].map((value) => `Россия, ${value}`)),
      ...(signal ? { signal } : {}),
    }, (response) => { if (response.status === 403) throw new ProviderError('balance'); });
    if (!Array.isArray(body)) throw new ProviderError('invalid_response');
    return body.slice(0, 5).flatMap((value: unknown): AddressCandidate[] => {
      if (!record(value)) return [];
      const text = (key: string) => typeof value[key] === 'string' ? (value[key] as string).slice(0, 300) : '';
      if (text('country_iso_code').toLowerCase() !== 'ru' || !text('postal_code')) return [];
      const city = text('city') || text('settlement');
      const house = `${text('house')}${text('block') ? `${text('block_type') || '?'}${text('block')}` : ''}`;
      return [{ country: 'ru', city, street: text('street_with_type') || text('street'), house,
        ...(text('region_with_type') ? { region: text('region_with_type') } : {}),
        postcode: text('postal_code'), resultType: text('house') ? 'building' : 'street', formatted: text('result'),
        quality: { source: 'dadata', qc: Number(value.qc ?? -1), qcHouse: Number(value.qc_house ?? -1), qcComplete: Number(value.qc_complete ?? -1),
          actuality: text('fias_actuality_state'), houseId: text('house_fias_id'), unparsed: !!text('unparsed_parts') } }];
    });
  }
}
