import { describe, expect, it, vi } from 'vitest';
import { MessageService } from '../../src/browser/message-service.js';
import type { SettingsStore, CredentialStore } from '../../src/application/ports.js';

function setup(consent = false, origins: string[] = [], base = 'chrome-extension://test/', extensionId = 'test') {
  const settings: SettingsStore = { read: async () => ({ consent, enabledOrigins: origins }), write: vi.fn(async () => {}) };
  const credentials: CredentialStore = { read: async () => 'test-key', write: vi.fn(async () => {}) };
  const lookup = { execute: vi.fn(async () => ({ kind: 'not_found' as const })), clearCache: vi.fn() };
  const browser = { activeTab: async () => ({ id: 7, url: 'https://shop.example/form' }), inject: vi.fn(async () => {}),
    fill: vi.fn(async () => ({ forms: 1 })), map: vi.fn(async () => ({ started: true })), sync: vi.fn(async () => {}), permitted: async () => true };
  const service = new MessageService(settings, credentials, lookup, browser, base, extensionId);
  return { service, credentials, lookup, browser };
}

const content = { id: 'test', tab: { id: 7 }, url: 'https://shop.example/form' };
const address = { country: 'ru', city: 'Москва', street: 'Тверская улица', house: '13' };

describe('privileged message boundary', () => {
  it('uses Firefox runtime ID independently from the random moz-extension origin', async () => {
    const { service } = setup(true, [], 'moz-extension://random-uuid/', 'postfield@krot.name');
    expect(await service.handle({ type: 'STATE' }, { id: 'postfield@krot.name', url: 'moz-extension://random-uuid/options.html' })).toMatchObject({ ok: true });
    expect(await service.handle({ type: 'STATE' }, { id: 'postfield@krot.name', url: 'moz-extension://foreign/options.html' })).toMatchObject({ ok: false });
  });
  it('allows explicit field assignment only from the extension after consent', async () => {
    const { service, browser } = setup(true);
    expect(await service.handle({ type: 'MAP' }, content)).toMatchObject({ ok: false });
    expect(browser.map).not.toHaveBeenCalled();
    expect(await service.handle({ type: 'MAP' }, { id: 'test', url: 'chrome-extension://test/popup.html' })).toMatchObject({ ok: true, data: { started: true } });
    expect(browser.map).toHaveBeenCalledWith(7);
    expect(await service.handle({ type: 'CONTEXT' }, content)).toMatchObject({ data: { allowed: true, automatic: true } });
  });
  it('prevents content scripts from changing keys or reading privileged settings', async () => {
    const { service, credentials } = setup(true);
    expect(await service.handle({ type: 'SAVE', key: 'stolen-key', consent: true }, content)).toMatchObject({ ok: false });
    expect(await service.handle({ type: 'STATE' }, content)).toMatchObject({ ok: false });
    expect(credentials.write).not.toHaveBeenCalled();
  });
  it('requires consent before sending an address', async () => {
    const { service, lookup } = setup(false, ['https://shop.example']);
    expect(await service.handle({ type: 'LOOKUP', address }, content)).toMatchObject({ ok: true, data: { kind: 'requires_consent' } });
    expect(lookup.execute).not.toHaveBeenCalled();
  });
  it('automatically enables new HTTP origins after key and consent', async () => {
    const { service, lookup } = setup(true);
    expect(await service.handle({ type: 'LOOKUP', address }, content)).toMatchObject({ ok: true, data: { kind: 'not_found' } });
    expect(lookup.execute).toHaveBeenCalledOnce();
  });
  it('accepts an enabled origin and strips extra input properties', async () => {
    const { service, lookup } = setup(true, ['https://shop.example']);
    expect(await service.handle({ type: 'LOOKUP', address: { ...address, name: 'PRIVATE', apartment: '9', apiKey: 'fake' } }, content)).toMatchObject({ ok: true });
    expect(lookup.execute).toHaveBeenCalledWith(address, expect.any(AbortSignal));
  });
  it('returns presence, never the key, to the options page', async () => {
    const { service } = setup(true);
    const reply = await service.handle({ type: 'STATE' }, { id: 'test', url: 'chrome-extension://test/options.html' });
    expect(reply).toMatchObject({ ok: true, data: { hasKey: true } });
    expect(JSON.stringify(reply)).not.toContain('test-key');
  });
});
