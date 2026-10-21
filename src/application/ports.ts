import type { Address, AddressCandidate } from '../core/address.js';
import type { FillMode, KeyProviderId, ProviderId } from '../core/providers.js';

export interface AddressProvider {
  resolve(address: Address, signal?: AbortSignal): Promise<readonly AddressCandidate[]>;
}

export interface CredentialStore {
  read(providerId?: KeyProviderId): Promise<string | null>;
  write(key: string | null, providerId?: KeyProviderId): Promise<void>;
}

export interface UserSettings {
  readonly consent: boolean;
  readonly enabledOrigins: readonly string[];
  readonly manualOrigins?: readonly string[];
  readonly providerId?: ProviderId;
  readonly globalMode?: FillMode;
}

export interface SettingsStore {
  read(): Promise<UserSettings>;
  write(settings: UserSettings): Promise<void>;
}
