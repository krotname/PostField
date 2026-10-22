import type { Address, AddressCandidate, LookupResult } from '../core/address.js';
import { addressKey, normalizePostcode } from '../core/address-policy.js';

export type FormResult = LookupResult | { readonly kind: 'preserved' } | { readonly kind: 'stale' };

export class FormSession {
  private revision = 0;
  private ownedValue: string | null = null;
  private lastKey: string | null = null;
  private choices: readonly AddressCandidate[] = [];

  constructor(private readonly resolve: (address: Address) => Promise<LookupResult>,
    private readonly readAddress: () => Address | null, private readonly readPostcode: () => string,
    private readonly write: (value: string) => void) {}

  addressChanged(): boolean {
    const address = this.readAddress();
    const key = address ? addressKey(address) : null;
    if (key === this.lastKey) return false;
    this.revision++;
    this.choices = [];
    if (this.ownedValue !== null && this.readPostcode() === this.ownedValue) this.write('');
    this.ownedValue = null;
    this.lastKey = key;
    return true;
  }

  manualPostcodeChanged(): void { this.revision++; this.ownedValue = null; this.choices = []; }

  cancelLookup(): void { this.revision++; }

  async lookup(): Promise<FormResult> {
    this.addressChanged();
    if (this.readPostcode().trim() && this.readPostcode() !== this.ownedValue) return { kind: 'preserved' };
    const address = this.readAddress();
    if (!address) return { kind: 'incomplete' };
    const key = addressKey(address);
    const revision = ++this.revision;
    const result = await this.resolve(address);
    const current = this.readAddress();
    if (revision !== this.revision || !current || addressKey(current) !== key
      || (this.readPostcode().trim() && this.readPostcode() !== this.ownedValue)) return { kind: 'stale' };
    this.choices = result.kind === 'ambiguous' ? result.candidates : [];
    if (result.kind === 'confirmed') this.apply(result.candidate);
    return result;
  }

  choose(candidate: AddressCandidate): boolean {
    const address = this.readAddress();
    if (!address || addressKey(address) !== this.lastKey || !this.choices.includes(candidate)
      || (this.readPostcode().trim() && this.readPostcode() !== this.ownedValue)) return false;
    const applied = this.apply(candidate);
    if (applied) this.revision++;
    return applied;
  }

  private apply(candidate: AddressCandidate): boolean {
    const address = this.readAddress();
    if (!address || candidate.country !== address.country) return false;
    const postcode = normalizePostcode(candidate.country, candidate.postcode);
    if (!postcode) return false;
    this.ownedValue = postcode;
    this.write(postcode);
    this.choices = [];
    return true;
  }
}
