import { describe, expect, it } from 'vitest';
import { LocalSettings } from '../../src/adapters/settings-storage.js';

function storage(initial: Record<string, unknown> = {}) {
  let values = initial;
  return { get: async (_keys: string[]) => values, set: async (next: Record<string, unknown>) => { values = next; } };
}
describe('local site settings', () => {
  it('persists only unique exact origins and never carries unknown secret fields', async () => {
    const port = storage({ apiKey: 'unrelated-private-key' });
    await new LocalSettings(port).write({ consent: true, enabledOrigins: ['https://shop.example', 'https://shop.example', 'https://shop.example/path', 'file:///', 'https://user:pass@shop.example', 'not-a-url'] });
    expect(await port.get([])).toEqual({ consent: true, enabledOrigins: ['https://shop.example'], manualOrigins: [], providerId: 'geoapify', globalMode: 'auto', schemaVersion: 3 });
  });
  it('does not treat a corrupt truthy consent value as permission', async () => {
    expect(await new LocalSettings(storage({ consent: 'yes', enabledOrigins: ['https://shop.example/path', 'https://shop.example'] })).read())
      .toEqual({ consent: false, enabledOrigins: ['https://shop.example'], manualOrigins: [], providerId: 'geoapify', globalMode: 'auto' });
  });
  it('limits persistent permissions to 100 origins', async () => {
    const port = storage();
    await new LocalSettings(port).write({ consent: false, enabledOrigins: Array.from({ length: 110 }, (_, i) => `https://shop${i}.example`) });
    expect((await port.get([])).enabledOrigins).toHaveLength(100);
  });
});
