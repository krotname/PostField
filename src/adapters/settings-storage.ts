import type { SettingsStore, UserSettings } from '../application/ports.js';
import { isFillMode, isProviderId } from '../core/providers.js';

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
    const stored = await this.storage.get(['consent', 'enabledOrigins', 'manualOrigins', 'providerId', 'globalMode', 'schemaVersion']);
    const legacy = ['consent', 'enabledOrigins', 'manualOrigins'].some((key) => Object.hasOwn(stored, key));
    return { consent: Object.hasOwn(stored, 'consent') ? stored.consent === true : !legacy,
      providerId: isProviderId(stored.providerId) ? stored.providerId : legacy ? 'geoapify' : 'photon',
      globalMode: isFillMode(stored.globalMode) ? stored.globalMode : 'auto',
      enabledOrigins: validOrigins(stored.enabledOrigins), manualOrigins: validOrigins(stored.manualOrigins) };
  }

  async write(settings: UserSettings): Promise<void> {
    await this.storage.set({ consent: settings.consent === true, enabledOrigins: validOrigins(settings.enabledOrigins),
      manualOrigins: validOrigins(settings.manualOrigins), providerId: settings.providerId ?? 'geoapify',
      globalMode: settings.globalMode ?? 'auto', schemaVersion: 3 });
  }
}
