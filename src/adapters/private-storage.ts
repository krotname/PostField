import type { CredentialStore } from '../application/ports.js';
import type { KeyProviderId } from '../core/providers.js';

export class IndexedDbCredentials implements CredentialStore {
  private database: Promise<IDBDatabase> | null = null;
  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = this.factory.open('postfield-private', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('credentials'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.database = null; reject(new Error('private_storage_unavailable')); };
    });
    return this.database;
  }

  async read(providerId: KeyProviderId = 'geoapify'): Promise<string | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction('credentials', 'readonly').objectStore('credentials').get(providerId);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(new Error('private_storage_unavailable'));
    });
  }

  async write(key: string | null, providerId: KeyProviderId = 'geoapify'): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('credentials', 'readwrite');
      const store = transaction.objectStore('credentials');
      if (key) store.put(key, providerId); else store.delete(providerId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('private_storage_unavailable'));
      transaction.onabort = () => reject(new Error('private_storage_unavailable'));
    });
  }
}
