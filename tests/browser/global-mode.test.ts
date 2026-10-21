import { expect, it, vi } from 'vitest';
import { LocalSettings } from '../../src/adapters/settings-storage.js';
import { MessageService } from '../../src/browser/message-service.js';
import type { Address, LookupResult } from '../../src/core/address.js';

const address = { country: 'ru', city: 'Тестоград', street: 'Тестовая улица', house: '13' };
const page = { id: 'test', tab: { id: 7 }, url: 'https://shop.example/address' };
const popup = { id: 'test', url: 'chrome-extension://test/popup.html' };
function setup() {
  let values: Record<string, unknown> = {};
  const settings = new LocalSettings({ get: async () => values, set: async (next) => { values = { ...values, ...next }; } });
  const credentials = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
  const browser = { activeTab: async () => ({ id: 7, url: page.url }), inject: async () => {}, fill: async () => ({ forms: 1 }),
    map: async () => ({ started: true }), sync: vi.fn(async () => {}), permitted: async () => true };
  const lookup = { execute: vi.fn(async (_address: Address, _signal?: AbortSignal): Promise<LookupResult> => ({ kind: 'not_found' })), clearCache: vi.fn() };
  const create = () => new MessageService(settings, credentials, lookup, browser, 'chrome-extension://test/', 'test');
  return { service: create(), create, settings, credentials, lookup };
}
it('uses Photon immediately without a key, and global Manual allows only explicit filling', async () => {
  const { service, create, lookup } = setup();
  expect(await service.handle({ type: 'CONTEXT' }, page)).toMatchObject({ data: { allowed: true, automatic: true } });
  expect(await service.handle({ type: 'GLOBAL_SET', mode: 'manual' }, popup)).toMatchObject({ ok: true });
  expect(await create().handle({ type: 'CONTEXT' }, page)).toMatchObject({ data: { allowed: true, automatic: false } });
  expect(await service.handle({ type: 'LOOKUP', address }, page)).toMatchObject({ data: { kind: 'site_disabled' } });
  expect(lookup.execute).not.toHaveBeenCalled();
  expect(await service.handle({ type: 'FILL' }, popup)).toMatchObject({ ok: true });
  expect(await service.handle({ type: 'LOOKUP', address }, page)).toMatchObject({ data: { kind: 'not_found' } });
});
it('preserves site exceptions through global mode changes and restarts', async () => {
  const { service, create, settings } = setup();
  await service.handle({ type: 'SITE_SET', origin: 'https://shop.example', enabled: false }, popup);
  await service.handle({ type: 'GLOBAL_SET', mode: 'manual' }, popup);
  await service.handle({ type: 'GLOBAL_SET', mode: 'auto' }, popup);
  expect((await settings.read()).manualOrigins).toEqual(['https://shop.example']);
  expect(await create().handle({ type: 'CONTEXT' }, page)).toMatchObject({ data: { automatic: false } });
});
it.each([
  { type: 'GLOBAL_SET', mode: 'manual' },
  { type: 'SAVE', consent: true, providerId: 'geoapify' },
])('aborts pending requests and rejects stale replies after %j', async (change) => {
  const { service, lookup } = setup();
  let finish!: (value: { kind: 'not_found' }) => void;
  lookup.execute.mockImplementationOnce((_address, signal?: AbortSignal) => new Promise((resolve) => {
    finish = resolve;
    signal?.addEventListener('abort', () => resolve({ kind: 'not_found' }));
  }));
  const pending = service.handle({ type: 'LOOKUP', address }, page);
  await vi.waitFor(() => expect(lookup.execute).toHaveBeenCalledOnce());
  await service.handle(change, popup);
  finish({ kind: 'not_found' });
  expect(await pending).toMatchObject({ data: { kind: 'site_disabled' } });
  expect(lookup.clearCache).toHaveBeenCalled();
});
it('rejects provider and mode writes from content scripts and never returns secrets to them', async () => {
  const { service, credentials } = setup();
  expect(await service.handle({ type: 'GLOBAL_SET', mode: 'manual' }, page)).toMatchObject({ ok: false });
  expect(await service.handle({ type: 'SAVE', providerId: 'dadata', key: 'token', secret: 'secret', consent: true }, page)).toMatchObject({ ok: false });
  expect(credentials.write).not.toHaveBeenCalled();
  expect(JSON.stringify(await service.handle({ type: 'CONTEXT' }, page))).not.toMatch(/token|secret|key/u);
});
