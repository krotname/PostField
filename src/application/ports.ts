import type { Address, AddressCandidate } from '../core/address.js';

export interface AddressProvider {
  resolve(address: Address, signal?: AbortSignal): Promise<readonly AddressCandidate[]>;
}

export interface CredentialStore {
  read(): Promise<string | null>;
  write(key: string | null): Promise<void>;
}

export interface UserSettings {
  readonly consent: boolean;
  readonly enabledOrigins: readonly string[];
}

export interface SettingsStore {
  read(): Promise<UserSettings>;
  write(settings: UserSettings): Promise<void>;
}
