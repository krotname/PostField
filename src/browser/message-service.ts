import { isAddress } from '../core/address.js';
import type { Address, LookupResult } from '../core/address.js';
import type { CredentialStore, SettingsStore } from '../application/ports.js';

export interface BrowserGateway {
  activeTab(): Promise<{ readonly id: number; readonly url: string } | null>;
  inject(tabId: number): Promise<void>;
  fill(tabId: number): Promise<{ readonly forms: number }>;
  map(tabId: number): Promise<{ readonly started: boolean }>;
  sync(origins: readonly string[]): Promise<void>;
  permitted(origin: string): Promise<boolean>;
}
interface LookupPort { execute(address: Address): Promise<LookupResult>; clearCache(): void }
export interface MessageSender { readonly id?: string | undefined; readonly url?: string | undefined; readonly tab?: { readonly id?: number | undefined } | undefined }
export type Reply = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly error: string };

function originOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.origin : null; }
  catch { return null; }
}

export class MessageService {
  private readonly manualTabs = new Map<number, { origin: string; expires: number }>();
  constructor(private readonly settings: SettingsStore, private readonly credentials: CredentialStore,
    private readonly lookup: LookupPort, private readonly browser: BrowserGateway, private readonly extensionBase: string,
    private readonly extensionId: string,
    private readonly now: () => number = Date.now) {}

  private privileged(sender: MessageSender): boolean {
    return sender.id === this.extensionId
      && (sender.url === `${this.extensionBase}popup.html` || sender.url === `${this.extensionBase}options.html`);
  }

  private async context(sender: MessageSender): Promise<{ consent: boolean; allowed: boolean; automatic: boolean }> {
    const stored = await this.settings.read();
    const origin = originOf(sender.url);
    const tabId = sender.tab?.id;
    const manual = tabId === undefined ? undefined : this.manualTabs.get(tabId);
    const automatic = !!origin && stored.enabledOrigins.includes(origin) && await this.browser.permitted(origin);
    return { consent: stored.consent, automatic, allowed: stored.consent && (automatic
      || (!!origin && !!manual && manual.origin === origin && manual.expires > this.now())) };
  }

  async handle(message: unknown, sender: MessageSender): Promise<Reply> {
    if (typeof message !== 'object' || message === null || sender.id !== this.extensionId) return { ok: false, error: 'forbidden' };
    const request = message as Record<string, unknown>;
    if (request.type === 'CONTEXT') return { ok: true, data: await this.context(sender) };
    if (request.type === 'LOOKUP') {
      const context = await this.context(sender);
      if (!context.consent) return { ok: true, data: { kind: 'requires_consent' } };
      if (!context.allowed || sender.tab?.id === undefined) return { ok: true, data: { kind: 'site_disabled' } };
      if (!isAddress(request.address)) return { ok: false, error: 'invalid_address' };
      const address: Address = { country: request.address.country, city: request.address.city, street: request.address.street,
        house: request.address.house, ...(request.address.region ? { region: request.address.region } : {}) };
      const result = await this.lookup.execute(address);
      if (!(await this.context(sender)).allowed) return { ok: true, data: { kind: 'site_disabled' } };
      return { ok: true, data: result };
    }
    if (!this.privileged(sender)) return { ok: false, error: 'forbidden' };
    switch (request.type) {
      case 'STATE': {
        const settings = await this.settings.read();
        const tab = await this.browser.activeTab();
        return { ok: true, data: { ...settings, hasKey: (await this.credentials.read()) !== null, origin: originOf(tab?.url) } };
      }
      case 'SAVE': {
        if (typeof request.consent !== 'boolean' || (request.key !== undefined && (typeof request.key !== 'string' || request.key.length > 512))) return { ok: false, error: 'invalid_settings' };
        const settings = await this.settings.read();
        if (typeof request.key === 'string' && request.key.trim()) await this.credentials.write(request.key.trim());
        await this.settings.write({ ...settings, consent: request.consent });
        this.lookup.clearCache();
        this.manualTabs.clear();
        await this.browser.sync(request.consent ? settings.enabledOrigins : []);
        return { ok: true, data: { saved: true } };
      }
      case 'DELETE_KEY': await this.credentials.write(null); this.lookup.clearCache(); return { ok: true, data: { deleted: true } };
      case 'SITE_SET': {
        const origin = originOf(request.origin);
        const tab = await this.browser.activeTab();
        if (!origin || origin !== request.origin || origin !== originOf(tab?.url) || typeof request.enabled !== 'boolean') return { ok: false, error: 'invalid_origin' };
        if (request.enabled && !await this.browser.permitted(origin)) return { ok: false, error: 'permission_required' };
        const settings = await this.settings.read();
        const origins = settings.enabledOrigins.filter((entry) => entry !== origin);
        if (request.enabled) origins.push(origin);
        await this.settings.write({ ...settings, enabledOrigins: origins.slice(0, 100) });
        await this.browser.sync(settings.consent ? origins : []);
        return { ok: true, data: { enabled: request.enabled } };
      }
      case 'MAP':
      case 'FILL': {
        const settings = await this.settings.read();
        if (!settings.consent || !(await this.credentials.read())) return { ok: false, error: 'setup_required' };
        const tab = await this.browser.activeTab();
        const origin = originOf(tab?.url);
        if (!tab || !origin) return { ok: false, error: 'unsupported_page' };
        for (const [id, grant] of this.manualTabs) if (grant.expires <= this.now()) this.manualTabs.delete(id);
        this.manualTabs.set(tab.id, { origin, expires: this.now() + (request.type === 'MAP' ? 300_000 : 60_000) });
        await this.browser.inject(tab.id);
        return { ok: true, data: await (request.type === 'MAP' ? this.browser.map(tab.id) : this.browser.fill(tab.id)) };
      }
      default: return { ok: false, error: 'unknown_message' };
    }
  }
}
