import type { Address, AddressCandidate, LookupResult } from '../core/address.js';
import { addressKey } from '../core/address-policy.js';
import type { FavoritesStore } from './ports.js';

interface LookupPort { execute(address: Address, signal?: AbortSignal): Promise<LookupResult>; clearCache(): void }
export class FavoriteLookup {
  constructor(private readonly favorites: FavoritesStore, private readonly remote: LookupPort) {}
  async execute(address: Address, signal?: AbortSignal): Promise<LookupResult> {
    try {
      const favorite = (await this.favorites.read()).find((item) => addressKey(item.address) === addressKey(address));
      if (signal?.aborted) return { kind: 'error', code: 'service' };
      if (favorite) {
        const candidate: AddressCandidate = { ...favorite.address, postcode: favorite.postcode, resultType: 'favorite',
          formatted: [favorite.address.region, favorite.address.city, favorite.address.street, favorite.address.house].filter(Boolean).join(', '),
          requiresPostcodeConfirmation: favorite.confirm };
        return favorite.confirm ? { kind: 'ambiguous', candidates: [candidate] } : { kind: 'confirmed', candidate };
      }
    } catch { return { kind: 'error', code: 'storage' }; }
    return this.remote.execute(address, signal);
  }
  clearCache(): void { this.remote.clearCache(); }
}
