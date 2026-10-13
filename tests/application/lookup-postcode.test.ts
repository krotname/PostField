import { describe, expect, it, vi } from 'vitest';
import { LookupPostcode, ProviderError } from '../../src/application/lookup-postcode.js';
import type { AddressProvider } from '../../src/application/ports.js';
import type { AddressCandidate } from '../../src/core/address.js';

const address = { country: 'ru' as const, city: 'Москва', street: 'Тверская улица', house: '13' };
const candidate: AddressCandidate = { ...address, postcode: '125009', confidence: 1, resultType: 'building', formatted: 'Москва, Тверская улица, 13' };

describe('lookup orchestration', () => {
  it('shares simultaneous requests for the same address to avoid repeated provider charges', async () => {
    const resolve = vi.fn<AddressProvider['resolve']>().mockResolvedValue([candidate]);
    const lookup = new LookupPostcode({ resolve });
    await Promise.all([lookup.execute(address), lookup.execute(address)]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it('reuses a session result and expires it after five minutes', async () => {
    let time = 0;
    const resolve = vi.fn<AddressProvider['resolve']>().mockResolvedValue([candidate]);
    const lookup = new LookupPostcode({ resolve }, ['ru'], () => time);
    await lookup.execute(address);
    await lookup.execute(address);
    time = 300_001;
    await lookup.execute(address);
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  it('gates international countries until benchmark approval', async () => {
    const resolve = vi.fn<AddressProvider['resolve']>();
    expect(await new LookupPostcode({ resolve }).execute({ ...address, country: 'de' })).toEqual({ kind: 'unsupported' });
    expect(resolve).not.toHaveBeenCalled();
  });
  it('does not query an incomplete address', async () => {
    const resolve = vi.fn<AddressProvider['resolve']>();
    expect(await new LookupPostcode({ resolve }).execute({ ...address, house: '' })).toEqual({ kind: 'incomplete' });
    expect(resolve).not.toHaveBeenCalled();
  });
  it('preserves safe provider error codes', async () => {
    expect(await new LookupPostcode({ resolve: async () => { throw new ProviderError('quota'); } }).execute(address))
      .toEqual({ kind: 'error', code: 'quota' });
  });
});
