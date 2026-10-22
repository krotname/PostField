import { isAddress } from '../core/address.js';
import type { Address, LookupResult } from '../core/address.js';
import type { CredentialStore, SettingsStore, FavoritesStore } from '../application/ports.js';
import { parseFavorite } from '../core/favorites.js';
import { addressKey } from '../core/address-policy.js';
import type { ProviderId } from '../core/providers.js';
import { isFillMode, isProviderId } from '../core/providers.js';
import { parseDaDataCredentials } from '../adapters/dadata.js';

export interface BrowserGateway {
  activeTab(): Promise<{ readonly id: number; readonly url: string } | null>;
  inject(tabId: number): Promise<void>;
  fill(tabId: number): Promise<{ readonly forms: number }>;
  map(tabId: number): Promise<{ readonly started: boolean }>;
  sync(origins: readonly string[]): Promise<void>;
  permitted(origin: string): Promise<boolean>;
  openOptions?(): Promise<void>;
}
interface LookupPort { execute(address: Address, signal?: AbortSignal): Promise<LookupResult>; clearCache(): void }
export interface MessageSender { readonly id?: string | undefined; readonly url?: string | undefined; readonly tab?: { readonly id?: number | undefined } | undefined }
export type Reply = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly error: string };

function originOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.origin : null; }
  catch { return null; }
}

export class MessageService {
  private readonly manualTabs = new Map<number, { origin: string; expires: number }>();
  private generation = 0;
  private requests = new AbortController();
  constructor(private readonly settings: SettingsStore, private readonly credentials: CredentialStore,
    private readonly lookup: LookupPort, private readonly browser: BrowserGateway, private readonly extensionBase: string,
    private readonly extensionId: string,
    private readonly now: () => number = Date.now, private readonly favorites?: FavoritesStore) {}

  private privileged(sender: MessageSender): boolean {
    return sender.id === this.extensionId
      && (sender.url === `${this.extensionBase}popup.html` || sender.url === `${this.extensionBase}options.html`);
  }

  private invalidate(): void {
    this.generation++;
    this.requests.abort();
    this.requests = new AbortController();
    this.lookup.clearCache();
    this.manualTabs.clear();
  }

  private async ready(providerId: ProviderId): Promise<boolean> {
    if ((await this.favorites?.read())?.length) return true;
    if (providerId === 'photon') return true;
    const saved = await this.credentials.read(providerId);
    if (providerId === 'geoapify') return !!saved;
    const data = parseDaDataCredentials(saved);
    return !!data.token && !!data.secret;
  }

  private async context(sender: MessageSender): Promise<{ consent: boolean; allowed: boolean; automatic: boolean; lookupAllowed: boolean }> {
    const stored = await this.settings.read();
    const origin = originOf(sender.url);
    const tabId = sender.tab?.id;
    const manual = tabId === undefined ? undefined : this.manualTabs.get(tabId);
    const permitted = !!origin && await this.browser.permitted(origin);
    const automatic = stored.consent && permitted && stored.globalMode !== 'manual'
      && !(stored.manualOrigins ?? []).includes(origin!) && await this.ready(stored.providerId ?? 'geoapify');
    const manualAllowed = !!origin && !!manual && manual.origin === origin && manual.expires > this.now();
    return { consent: stored.consent, automatic, allowed: stored.consent && (permitted || manualAllowed),
      lookupAllowed: stored.consent && (automatic || manualAllowed) };
  }

  async handle(message: unknown, sender: MessageSender): Promise<Reply> {
    if (typeof message !== 'object' || message === null || sender.id !== this.extensionId) return { ok: false, error: 'forbidden' };
    const request = message as Record<string, unknown>;
    if (request.type === 'CONTEXT') {
      const { consent, allowed, automatic } = await this.context(sender);
      return { ok: true, data: { consent, allowed, automatic } };
    }
    if (request.type === 'LOOKUP') {
      const generation = this.generation;
      const context = await this.context(sender);
      if (!context.consent) return { ok: true, data: { kind: 'requires_consent' } };
      if (!context.lookupAllowed || sender.tab?.id === undefined) return { ok: true, data: { kind: 'site_disabled' } };
      if (!isAddress(request.address)) return { ok: false, error: 'invalid_address' };
      const address: Address = { country: request.address.country, city: request.address.city, street: request.address.street,
        house: request.address.house, ...(request.address.region ? { region: request.address.region } : {}) };
      if (generation !== this.generation) return { ok: true, data: { kind: 'site_disabled' } };
      const result = await this.lookup.execute(address, this.requests.signal);
      if (generation !== this.generation || !(await this.context(sender)).lookupAllowed) return { ok: true, data: { kind: 'site_disabled' } };
      return { ok: true, data: result };
    }
    if (request.type === 'OPEN_OPTIONS' && originOf(sender.url) && sender.tab?.id !== undefined) {
      await this.browser.openOptions?.();
      return { ok: true, data: { opened: true } };
    }
    if (!this.privileged(sender)) return { ok: false, error: 'forbidden' };
    switch (request.type) {
      case 'FAVORITE_SAVE': {
        const favorite = parseFavorite(request.favorite);
        if (!favorite || !this.favorites) return { ok: false, error: 'invalid_favorite' };
        const previous = await this.favorites.read();
        await this.favorites.write([...previous.filter((item) => addressKey(item.address) !== addressKey(favorite.address)), favorite]);
        this.invalidate();
        await this.browser.sync((await this.settings.read()).consent ? ['http://*/*', 'https://*/*'] : []);
        return { ok: true, data: { saved: true } };
      }
      case 'FAVORITE_DELETE': {
        if (typeof request.key !== 'string' || !this.favorites) return { ok: false, error: 'invalid_favorite' };
        await this.favorites.write((await this.favorites.read()).filter((item) => addressKey(item.address) !== request.key));
        this.invalidate();
        await this.browser.sync((await this.settings.read()).consent ? ['http://*/*', 'https://*/*'] : []);
        return { ok: true, data: { deleted: true } };
      }
      case 'STATE': {
        const settings = await this.settings.read();
        const tab = await this.browser.activeTab();
        const geoapify = !!await this.credentials.read('geoapify');
        const data = parseDaDataCredentials(await this.credentials.read('dadata'));
        const providerId = settings.providerId ?? 'geoapify';
        const favorites = await this.favorites?.read() ?? [];
        return { ok: true, data: { ...settings, favorites, providerId, globalMode: settings.globalMode ?? 'auto',
          hasKey: providerId === 'geoapify' ? geoapify : providerId === 'dadata' ? !!data.token && !!data.secret : false,
          ready: favorites.length > 0 || providerId === 'photon' || (providerId === 'geoapify' ? geoapify : !!data.token && !!data.secret),
          keys: { geoapify, dadata: !!data.token && !!data.secret }, origin: originOf(tab?.url) } };
      }
      case 'SAVE': {
        if (typeof request.consent !== 'boolean' || (request.providerId !== undefined && !isProviderId(request.providerId))
          || (request.globalMode !== undefined && !isFillMode(request.globalMode))
          || ['key', 'secret'].some((field) => request[field] !== undefined && (typeof request[field] !== 'string' || (request[field] as string).length > 512))) return { ok: false, error: 'invalid_settings' };
        const settings = await this.settings.read();
        const providerId = isProviderId(request.providerId) ? request.providerId : settings.providerId ?? 'geoapify';
        this.invalidate();
        if (providerId === 'geoapify' && typeof request.key === 'string' && request.key.trim()) await this.credentials.write(request.key.trim(), 'geoapify');
        if (providerId === 'dadata' && ((typeof request.key === 'string' && request.key.trim()) || (typeof request.secret === 'string' && request.secret.trim()))) {
          const previous = parseDaDataCredentials(await this.credentials.read('dadata'));
          await this.credentials.write(JSON.stringify({ token: typeof request.key === 'string' && request.key.trim() ? request.key.trim() : previous.token,
            secret: typeof request.secret === 'string' && request.secret.trim() ? request.secret.trim() : previous.secret }), 'dadata');
        }
        await this.settings.write({ ...settings, consent: request.consent, providerId,
          globalMode: isFillMode(request.globalMode) ? request.globalMode : settings.globalMode ?? 'auto' });
        this.invalidate();
        await this.browser.sync(request.consent ? ['http://*/*', 'https://*/*'] : []);
        return { ok: true, data: { saved: true } };
      }
      case 'DELETE_KEY': {
        const providerId = request.providerId ?? (await this.settings.read()).providerId ?? 'geoapify';
        if (providerId !== 'geoapify' && providerId !== 'dadata') return { ok: false, error: 'invalid_settings' };
        this.invalidate();
        await this.credentials.write(null, providerId); this.invalidate();
        await this.browser.sync((await this.settings.read()).consent ? ['http://*/*', 'https://*/*'] : []);
        return { ok: true, data: { deleted: true } };
      }
      case 'GLOBAL_SET': {
        if (!isFillMode(request.mode)) return { ok: false, error: 'invalid_settings' };
        const settings = await this.settings.read();
        this.invalidate();
        await this.settings.write({ ...settings, globalMode: request.mode });
        this.invalidate();
        await this.browser.sync(settings.consent ? ['http://*/*', 'https://*/*'] : []);
        return { ok: true, data: { mode: request.mode } };
      }
      case 'SITE_SET': {
        const origin = originOf(request.origin);
        const tab = await this.browser.activeTab();
        if (!origin || origin !== request.origin || origin !== originOf(tab?.url) || typeof request.enabled !== 'boolean') return { ok: false, error: 'invalid_origin' };
        if (request.enabled && !await this.browser.permitted(origin)) return { ok: false, error: 'permission_required' };
        const settings = await this.settings.read();
        const origins = (settings.manualOrigins ?? []).filter((entry) => entry !== origin);
        if (!request.enabled) origins.push(origin);
        this.invalidate();
        await this.settings.write({ ...settings, manualOrigins: origins.slice(-100) });
        this.invalidate();
        await this.browser.sync(settings.consent ? ['http://*/*', 'https://*/*'] : []);
        return { ok: true, data: { enabled: request.enabled } };
      }
      case 'MAP':
      case 'FILL': {
        const settings = await this.settings.read();
        if (!settings.consent || !(await this.ready(settings.providerId ?? 'geoapify'))) return { ok: false, error: 'setup_required' };
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
