import type { Address } from '../core/address.js';
import { PROVIDER_IDS } from '../core/providers.js';
import type { ProviderId } from '../core/providers.js';
import type { AddressProvider, SettingsStore } from './ports.js';
import { LookupPostcode } from './lookup-postcode.js';

export class ProviderLookup {
  private readonly lookups: Map<ProviderId, LookupPostcode>;
  constructor(private readonly settings: SettingsStore, providers: Record<ProviderId, AddressProvider>) {
    this.lookups = new Map(PROVIDER_IDS.map((id) => [id, new LookupPostcode(providers[id])]));
  }
  async execute(address: Address, signal?: AbortSignal) {
    const id = (await this.settings.read()).providerId ?? 'geoapify';
    return this.lookups.get(id)!.execute(address, signal);
  }
  clearCache(): void { for (const lookup of this.lookups.values()) lookup.clearCache(); }
}
