import type { Address, LookupErrorCode, LookupResult, CountryCode } from '../core/address.js';
import { addressKey, classifyCandidates, isCompleteAddress } from '../core/address-policy.js';
import type { AddressProvider } from './ports.js';

export class ProviderError extends Error {
  constructor(readonly code: LookupErrorCode) {
    super(code);
    this.name = 'ProviderError';
  }
}

export class LookupPostcode {
  private readonly cache = new Map<string, { expires: number; result: LookupResult }>();
  private readonly pending = new Map<string, Promise<LookupResult>>();
  private generation = 0;

  constructor(private readonly provider: AddressProvider, private readonly enabledCountries: readonly CountryCode[] = ['ru'],
    private readonly now: () => number = Date.now) {}

  async execute(address: Address, signal?: AbortSignal): Promise<LookupResult> {
    if (!this.enabledCountries.includes(address.country)) return { kind: 'unsupported' };
    if (!isCompleteAddress(address)) return { kind: 'incomplete' };
    const key = addressKey(address);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.result;
    const existing = this.pending.get(key);
    if (existing && !signal) return existing;
    const generation = this.generation;
    const request = this.resolve(address, key, generation, signal);
    if (!signal) this.pending.set(key, request);
    try { return await request; }
    finally { if (this.pending.get(key) === request) this.pending.delete(key); }
  }

  private async resolve(address: Address, key: string, generation: number, signal?: AbortSignal): Promise<LookupResult> {
    try {
      const candidates = await this.provider.resolve(address, signal);
      const result = classifyCandidates(address, candidates);
      if (generation === this.generation && (result.kind === 'confirmed' || result.kind === 'ambiguous')) {
        if (this.cache.size >= 50) this.cache.delete(this.cache.keys().next().value ?? '');
        this.cache.set(key, { expires: this.now() + 300_000, result });
      }
      return result;
    } catch (error: unknown) {
      return { kind: 'error', code: error instanceof ProviderError ? error.code : 'offline' };
    }
  }

  clearCache(): void { this.generation++; this.cache.clear(); this.pending.clear(); }
}
