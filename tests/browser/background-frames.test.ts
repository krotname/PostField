import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { IndexedDbCredentials } from '../../src/adapters/private-storage.js';
type Listener = (message: unknown, sender: { id: string; url: string }, respond: (value: unknown) => void) => boolean;
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('starts mapping in an eligible child frame through the real background message route', async () => {
  let listener: Listener | undefined;
  let childStarted = false;
  const event = { addListener: vi.fn() };
  const chrome = {
    runtime: { id: 'test', getURL: () => 'chrome-extension://test/', onMessage: { addListener: (value: Listener) => { listener = value; } }, onInstalled: event, onStartup: event },
    storage: { local: { get: async () => ({ consent: true, enabledOrigins: [] }), set: async () => {} } },
    scripting: { executeScript: vi.fn(async () => []) },
    tabs: { query: async () => [{ id: 7, url: 'https://shop.test/checkout' }], sendMessage: async (_id: number, message: { type: string }, options?: { frameId?: number }) => {
      if (message.type === 'MAP_FIELDS' && options?.frameId !== 0) childStarted = true;
      return { started: childStarted };
    } },
    permissions: { onRemoved: event },
  };
  vi.stubGlobal('chrome', chrome);
  await new IndexedDbCredentials().write('test-key');
  await import('../../src/browser/background.js');
  const response = await new Promise<unknown>((resolve) => listener?.({ type: 'MAP' }, { id: 'test', url: 'chrome-extension://test/popup.html' }, resolve));
  expect(response).toMatchObject({ ok: true, data: { started: true } });
  expect(childStarted).toBe(true);
});
