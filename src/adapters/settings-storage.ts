import type { SettingsStore, UserSettings } from '../application/ports.js';

interface LocalStoragePort {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}
function validOrigins(values: unknown): string[] {
  const origins = Array.isArray(values) ? values.filter((value): value is string => {
    if (typeof value !== 'string') return false;
    try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value; }
    catch { return false; }
  }) : [];
  return [...new Set(origins)].slice(0, 100);
}
export class LocalSettings implements SettingsStore {
  constructor(private readonly storage: LocalStoragePort) {}

  async read(): Promise<UserSettings> {
    const stored: Record<string, unknown> = await this.storage.get(['consent', 'enabledOrigins']);
    return { consent: stored.consent === true, enabledOrigins: validOrigins(stored.enabledOrigins) };
  }

  async write(settings: UserSettings): Promise<void> {
    await this.storage.set({ consent: settings.consent === true, enabledOrigins: validOrigins(settings.enabledOrigins) });
  }
}
