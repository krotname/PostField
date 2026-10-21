export const PROVIDER_IDS = ['photon', 'geoapify', 'dadata'] as const;
export type ProviderId = typeof PROVIDER_IDS[number];
export type KeyProviderId = Exclude<ProviderId, 'photon'>;
export type FillMode = 'auto' | 'manual';
export function isProviderId(value: unknown): value is ProviderId {
  return PROVIDER_IDS.some((id) => id === value);
}
export function isFillMode(value: unknown): value is FillMode { return value === 'auto' || value === 'manual'; }
