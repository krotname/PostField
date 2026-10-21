import { expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LocalSettings } from '../../src/adapters/settings-storage.js';
import { IndexedDbCredentials } from '../../src/adapters/private-storage.js';

function storage(initial: Record<string, unknown> = {}) {
  let values = initial;
  return { get: async () => values, set: async (next: Record<string, unknown>) => { values = { ...values, ...next }; } };
}
it('starts an empty installation with Photon and transmission enabled in Auto', async () => {
  expect(await new LocalSettings(storage()).read()).toMatchObject({ providerId: 'photon', globalMode: 'auto', consent: true });
});
it.each([true, false])('migrates legacy Geoapify without changing consent %s or site exceptions', async (consent) => {
  const port = storage({ consent, enabledOrigins: [], manualOrigins: ['https://shop.example'] });
  const previous = await new LocalSettings(port).read();
  expect(previous).toMatchObject({ providerId: 'geoapify', globalMode: 'auto', consent, manualOrigins: ['https://shop.example'] });
  await new LocalSettings(port).write({ ...previous, providerId: 'photon', globalMode: 'manual' });
  expect(await new LocalSettings(port).read()).toMatchObject({ providerId: 'photon', globalMode: 'manual', consent, manualOrigins: ['https://shop.example'] });
});
it('retains separate private credentials across provider switches and new adapter instances', async () => {
  const factory = new IDBFactory();
  const store = new IndexedDbCredentials(factory);
  await store.write('legacy-geo-key');
  await store.write(JSON.stringify({ token: 'data-token', secret: 'data-secret' }), 'dadata');
  const restarted = new IndexedDbCredentials(factory);
  expect(await restarted.read()).toBe('legacy-geo-key');
  expect(await restarted.read('dadata')).toBe(JSON.stringify({ token: 'data-token', secret: 'data-secret' }));
  await restarted.write(null, 'dadata');
  expect(await restarted.read()).toBe('legacy-geo-key');
  expect(await restarted.read('dadata')).toBeNull();
});
