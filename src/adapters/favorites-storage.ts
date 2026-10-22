import type { FavoritesStore } from '../application/ports.js';
import type { FavoriteAddress } from '../core/favorites.js';
import { parseFavorite } from '../core/favorites.js';
import { addressKey } from '../core/address-policy.js';

interface StoragePort {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}
export class LocalFavorites implements FavoritesStore {
  constructor(private readonly storage: StoragePort) {}
  async read(): Promise<readonly FavoriteAddress[]> {
    const { favorites } = await this.storage.get(['favorites']);
    if (!Array.isArray(favorites)) return [];
    return favorites.slice(0, 200).map(parseFavorite).filter((item): item is FavoriteAddress => item !== null);
  }
  async write(favorites: readonly FavoriteAddress[]): Promise<void> {
    if (favorites.length > 200) throw new Error('favorite_limit');
    const parsed = favorites.map(parseFavorite);
    if (parsed.some((item) => item === null)) throw new Error('invalid_favorite');
    const unique = new Map(parsed.filter((item): item is FavoriteAddress => item !== null).map((item) => [addressKey(item.address), item]));
    await this.storage.set({ favorites: [...unique.values()] });
  }
}
