import { isAddress } from './address.js';
import type { Address } from './address.js';
import { isCompleteAddress, normalizePostcode } from './address-policy.js';

export interface FavoriteAddress {
  readonly address: Address;
  readonly postcode: string;
  readonly confirm: boolean;
}

export function parseFavorite(value: unknown): FavoriteAddress | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isAddress(record.address) || record.address.country !== 'ru' || !isCompleteAddress(record.address)
    || typeof record.postcode !== 'string' || typeof record.confirm !== 'boolean') return null;
  const postcode = normalizePostcode(record.address.country, record.postcode);
  if (!postcode) return null;
  const address = record.address;
  return { address: { country: address.country, city: address.city.trim(), street: address.street.trim(), house: address.house.trim(),
    ...(address.region?.trim() ? { region: address.region.trim() } : {}) }, postcode, confirm: record.confirm };
}
