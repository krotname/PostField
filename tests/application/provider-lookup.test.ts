import { expect, it, vi } from 'vitest';
import { ProviderLookup } from '../../src/application/provider-lookup.js';
import type { UserSettings } from '../../src/application/ports.js';
import type { AddressCandidate } from '../../src/core/address.js';

const address = { country: 'ru' as const, city: 'Тестоград', street: 'Тестовая улица', house: '13' };
it('queries only the chosen source, separates its cache and clears it when settings change', async () => {
  let stored: UserSettings = { consent: true, enabledOrigins: [], providerId: 'photon' };
  const candidate: AddressCandidate = { ...address, postcode: '123456', formatted: 'Тестовый адрес', resultType: 'building',
    quality: { source: 'photon', explicitAddress: true } };
  const providers = { photon: { resolve: vi.fn(async () => [candidate]) },
    geoapify: { resolve: vi.fn(async (): Promise<AddressCandidate[]> => [{ ...address, postcode: '654321', formatted: 'Тестовый адрес', resultType: 'building', confidence: 1 }]) },
    dadata: { resolve: vi.fn(async () => []) } };
  const lookup = new ProviderLookup({ read: async () => stored, write: async (next) => { stored = next; } }, providers);
  expect(await lookup.execute(address)).toMatchObject({ kind: 'confirmed', candidate: { postcode: '123456' } });
  await lookup.execute(address);
  expect(providers.photon.resolve).toHaveBeenCalledOnce();
  stored = { ...stored, providerId: 'geoapify' };
  expect(await lookup.execute(address)).toMatchObject({ kind: 'confirmed', candidate: { postcode: '654321' } });
  expect(providers.dadata.resolve).not.toHaveBeenCalled();
  stored = { ...stored, providerId: 'photon' }; lookup.clearCache();
  await lookup.execute(address);
  expect(providers.photon.resolve).toHaveBeenCalledTimes(2);
});
it('never falls back to a paid provider on a public service failure', async () => {
  const paid = { resolve: vi.fn(async () => []) };
  const lookup = new ProviderLookup({ read: async () => ({ consent: true, enabledOrigins: [], providerId: 'photon' }), write: async () => {} },
    { photon: { resolve: async () => { throw new Error('network'); } }, geoapify: paid, dadata: paid });
  expect(await lookup.execute(address)).toEqual({ kind: 'error', code: 'offline' });
  expect(paid.resolve).not.toHaveBeenCalled();
});
