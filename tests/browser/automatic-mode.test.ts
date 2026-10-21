import { expect, it, vi } from 'vitest';
import { LocalSettings } from '../../src/adapters/settings-storage.js';
import { MessageService } from '../../src/browser/message-service.js';

const sender = { id: 'test', tab: { id: 7 }, url: 'https://shop.example/address' };
it('migrates consent without touching a key and defaults new sites to auto; persists manual across restart', async () => {
  let values: Record<string, unknown> = { consent: true, enabledOrigins: [] };
  const settings = new LocalSettings({ get: async () => values, set: async (next) => { values = { ...values, ...next }; } });
  const credentials = { read: async () => 'private-key', write: vi.fn() };
  const browser = { activeTab: async () => ({ id: 7, url: sender.url }), inject: async () => {}, fill: async () => ({ forms: 1 }),
    map: async () => ({ started: true }), sync: async () => {}, permitted: async () => true };
  const lookup = { execute: vi.fn(async () => ({ kind: 'not_found' as const })), clearCache: () => {} };
  const create = () => new MessageService(settings, credentials, lookup, browser, 'chrome-extension://test/', 'test');
  expect(await create().handle({ type: 'CONTEXT' }, sender)).toMatchObject({ data: { allowed: true, automatic: true } });
  expect(await create().handle({ type: 'SITE_SET', origin: 'https://shop.example', enabled: false },
    { id: 'test', url: 'chrome-extension://test/popup.html' })).toMatchObject({ ok: true });
  const restarted = create();
  expect(await restarted.handle({ type: 'CONTEXT' }, sender)).toMatchObject({ data: { allowed: true, automatic: false } });
  expect(await restarted.handle({ type: 'LOOKUP', address: { country: 'ru', city: 'Город', street: 'Тестовая', house: '15' } }, sender))
    .toMatchObject({ data: { kind: 'site_disabled' } });
  expect(lookup.execute).not.toHaveBeenCalled();
  expect(credentials.write).not.toHaveBeenCalled();
  expect((await settings.read()).consent).toBe(true);
});
