import { GeoapifyProvider } from '../adapters/geoapify.js';
import { IndexedDbCredentials } from '../adapters/private-storage.js';
import { LocalSettings } from '../adapters/settings-storage.js';
import { LookupPostcode } from '../application/lookup-postcode.js';
import { MessageService } from './message-service.js';
import type { BrowserGateway } from './message-service.js';
import { extension } from './extension-api.js';

const settings = new LocalSettings(extension.storage.local);
const credentials = new IndexedDbCredentials();
const lookup = new LookupPostcode(new GeoapifyProvider(credentials));
const gateway: BrowserGateway = {
  async activeTab() {
    const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
    return tab?.id !== undefined && tab.url ? { id: tab.id, url: tab.url } : null;
  },
  async inject(tabId) {
    await extension.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
  },
  async fill(tabId) {
    const result: unknown = await extension.tabs.sendMessage(tabId, { type: 'FILL_NOW' });
    if (typeof result === 'object' && result !== null && 'forms' in result && typeof result.forms === 'number') return { forms: result.forms };
    return { forms: 0 };
  },
  async map(tabId) {
    const result: unknown = await extension.tabs.sendMessage(tabId, { type: 'MAP_FIELDS' }, { frameId: 0 });
    return { started: typeof result === 'object' && result !== null && 'started' in result && result.started === true };
  },
  async permitted(origin) { return extension.permissions.contains({ origins: [`${origin}/*`] }); },
  async sync(origins) {
    const scripts = await extension.scripting.getRegisteredContentScripts();
    const ids = scripts.filter((script) => script.id.startsWith('postfield-')).map((script) => script.id);
    if (ids.length) await extension.scripting.unregisterContentScripts({ ids });
    const permitted: string[] = [];
    for (const origin of origins) if (await extension.permissions.contains({ origins: [`${origin}/*`] })) permitted.push(`${origin}/*`);
    if (permitted.length) await extension.scripting.registerContentScripts([{ id: 'postfield-sites', matches: permitted,
      js: ['content.js'], allFrames: true, runAt: 'document_idle', persistAcrossSessions: true }]);
    const tabs = await extension.tabs.query({});
    await Promise.allSettled(tabs.filter((tab) => tab.id !== undefined)
      .map((tab) => extension.tabs.sendMessage(tab.id!, { type: 'CONFIG_CHANGED' })));
  },
};
const service = new MessageService(settings, credentials, lookup, gateway, extension.runtime.getURL(''), extension.runtime.id);

extension.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  void service.handle(message, sender).then(respond, () => respond({ ok: false, error: 'operation_failed' }));
  return true;
});
async function restore(): Promise<void> {
  const stored = await settings.read();
  await gateway.sync(stored.consent ? stored.enabledOrigins : []);
}
extension.runtime.onInstalled.addListener(() => { void restore().catch(() => {}); });
extension.runtime.onStartup.addListener(() => { void restore().catch(() => {}); });
extension.permissions.onRemoved.addListener(() => { void restore().catch(() => {}); });
