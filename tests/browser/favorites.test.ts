import { expect, it, vi } from 'vitest';
import { MessageService } from '../../src/browser/message-service.js';
import { LocalFavorites } from '../../src/adapters/favorites-storage.js';

const address = { country: 'ru' as const, city: 'Тестоград', street: 'Тестовая', house: '7' };
const favorite = { address, postcode: '123456', confirm: false };
const privileged = { id: 'test', url: 'chrome-extension://test/options.html' };
const content = { id: 'test', url: 'https://shop.test/', tab: { id: 7 } };
function setup() {
  const data: Record<string, unknown> = {};
  const favorites = new LocalFavorites({ get: async () => data, set: async (value) => { Object.assign(data, value); } });
  const lookup = { execute: vi.fn(async () => ({ kind: 'not_found' as const })), clearCache: vi.fn() };
  const browser = { activeTab: async () => null, inject: vi.fn(), fill: async () => ({ forms: 0 }),
    map: async () => ({ started: false }), sync: vi.fn(async () => {}), permitted: async () => true };
  const service = new MessageService({ read: async () => ({ consent: true, enabledOrigins: [], providerId: 'geoapify' }), write: vi.fn() },
    { read: async () => null, write: vi.fn() }, lookup, browser, 'chrome-extension://test/', 'test', Date.now, favorites);
  return { favorites, service, lookup };
}
it('allows explicit save, update and delete from options and invalidates pending lookups', async () => {
  const { favorites, service, lookup } = setup();
  expect(await service.handle({ type: 'FAVORITE_SAVE', favorite }, privileged)).toMatchObject({ ok: true });
  await service.handle({ type: 'FAVORITE_SAVE', favorite: { ...favorite, postcode: '654321', confirm: true } }, privileged);
  expect(await favorites.read()).toEqual([{ ...favorite, postcode: '654321', confirm: true }]);
  expect(await service.handle({ type: 'CONTEXT' }, content)).toMatchObject({ data: { automatic: true } });
  const { addressKey } = await import('../../src/core/address-policy.js');
  await service.handle({ type: 'FAVORITE_DELETE', key: addressKey(address) }, privileged);
  expect(await favorites.read()).toEqual([]);
  expect(lookup.clearCache).toHaveBeenCalledTimes(3);
});
it('does not expose the address list or accept mutations from site content, foreign senders or extension lookalikes', async () => {
  const { service, favorites } = setup();
  await favorites.write([favorite]);
  for (const sender of [content, { ...privileged, id: 'foreign' }, { ...privileged, url: 'chrome-extension://test/options.html/extra' }]) {
    for (const message of [{ type: 'STATE' }, { type: 'FAVORITE_SAVE', favorite }, { type: 'FAVORITE_DELETE', key: '' }]) {
      expect(await service.handle(message, sender)).toEqual({ ok: false, error: 'forbidden' });
    }
  }
  expect(await favorites.read()).toEqual([favorite]);
  expect(await service.handle({ type: 'FAVORITE_SAVE', favorite: { ...favorite, postcode: 'oops' } }, privileged))
    .toEqual({ ok: false, error: 'invalid_favorite' });
});
