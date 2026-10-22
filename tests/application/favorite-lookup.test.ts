import { expect, it, vi } from 'vitest';
import { FavoriteLookup } from '../../src/application/favorite-lookup.js';
import { LocalFavorites } from '../../src/adapters/favorites-storage.js';

const address = { country: 'ru' as const, region: 'Тестовая область', city: 'Тестоград', street: 'Тестовая', house: '7к2' };
const favorite = { address, postcode: '123456', confirm: false };
function setup() {
  const data: Record<string, unknown> = {};
  const storage = { get: async () => data, set: async (value: Record<string, unknown>) => { Object.assign(data, value); } };
  const favorites = new LocalFavorites(storage);
  const remote = { execute: vi.fn(async () => ({ kind: 'not_found' as const })), clearCache: vi.fn() };
  return { favorites, remote, lookup: new FavoriteLookup(favorites, remote), data };
}

it('remembers an explicitly saved postcode and uses it without HTTP', async () => {
  const { favorites, lookup, remote } = setup();
  await favorites.write([favorite]);
  expect(await lookup.execute(address)).toMatchObject({ kind: 'confirmed', candidate: { postcode: '123456', resultType: 'favorite' } });
  expect(remote.execute).not.toHaveBeenCalled();
});

it('offers optional confirmation and never reuses an adjacent house or another region', async () => {
  const { favorites, lookup, remote } = setup();
  await favorites.write([{ ...favorite, confirm: true }]);
  expect(await lookup.execute(address)).toMatchObject({ kind: 'ambiguous', candidates: [{ postcode: '123456' }] });
  await lookup.execute({ ...address, house: '7к3' });
  await lookup.execute({ ...address, region: 'Другая область' });
  expect(remote.execute).toHaveBeenCalledTimes(2);
});

it('reads updates and deletion immediately, without a stale favorite cache', async () => {
  const { favorites, lookup, remote } = setup();
  await favorites.write([favorite]);
  await lookup.execute(address);
  await favorites.write([{ ...favorite, postcode: '654321' }]);
  expect(await lookup.execute(address)).toMatchObject({ kind: 'confirmed', candidate: { postcode: '654321' } });
  await favorites.write([]);
  expect(await lookup.execute(address)).toEqual({ kind: 'not_found' });
  lookup.clearCache();
  expect(remote.clearCache).toHaveBeenCalledOnce();
});

it('rejects incomplete addresses, invalid postcodes and excessive lists', async () => {
  const { favorites } = setup();
  await expect(favorites.write([{ ...favorite, postcode: 'oops' }])).rejects.toThrow('invalid_favorite');
  await expect(favorites.write([{ ...favorite, address: { ...address, house: '' } }])).rejects.toThrow('invalid_favorite');
  await expect(favorites.write(Array.from({ length: 201 }, (_, i) => ({ ...favorite, address: { ...address, house: String(i + 1) } })))).rejects.toThrow('favorite_limit');
  expect(await favorites.read()).toEqual([]);
});
