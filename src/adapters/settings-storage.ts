import type { SettingsStore, UserSettings } from '../application/ports.js';

export class LocalSettings implements SettingsStore {
  constructor(private readonly storage: chrome.storage.LocalStorageArea) {}

  async read(): Promise<UserSettings> {
    const stored: Record<string, unknown> = await this.storage.get(['consent', 'enabledOrigins']);
    const origins = Array.isArray(stored.enabledOrigins) ? stored.enabledOrigins.filter((value): value is string => {
      if (typeof value !== 'string') return false;
      try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value; }
      catch { return false; }
    }) : [];
    return { consent: stored.consent === true, enabledOrigins: [...new Set(origins)].slice(0, 100) };
  }

  async write(settings: UserSettings): Promise<void> {
    await this.storage.set({ consent: settings.consent, enabledOrigins: [...settings.enabledOrigins] });
  }
}
