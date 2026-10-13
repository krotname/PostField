import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbCredentials } from '../../src/adapters/private-storage.js';

describe('private extension credentials', () => {
  it('stores, reads and deletes a key without exposing it to synchronized storage', async () => {
    const store = new IndexedDbCredentials(new IDBFactory());
    expect(await store.read()).toBeNull();
    await store.write('test-key');
    expect(await store.read()).toBe('test-key');
    await store.write(null);
    expect(await store.read()).toBeNull();
  });
  it('survives a new privileged adapter instance', async () => {
    const factory = new IDBFactory();
    await new IndexedDbCredentials(factory).write('test-key');
    expect(await new IndexedDbCredentials(factory).read()).toBe('test-key');
  });
});
