import { afterEach, expect, it, vi } from 'vitest';
import { PhotonProvider } from '../../src/adapters/photon.js';
import { classifyCandidates } from '../../src/core/address-policy.js';

const address = { country: 'ru' as const, city: 'Тестоград', street: 'Тестовая улица', house: '13к2' };
const feature = (extra: Record<string, unknown> = {}) => ({ properties: { countrycode: 'RU', city: address.city,
  street: address.street, housenumber: address.house, postcode: '123456', ...extra } });
afterEach(() => vi.useRealTimers());
it('uses supported default language, Russia filter and explicit components without inventing confidence', async () => {
  const fetcher = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => Response.json({ features: [feature(), feature({ housenumber: '13к3' })] }));
  const candidates = await new PhotonProvider(fetcher).resolve(address);
  const url = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(url.searchParams.get('lang')).toBe('default');
  expect(url.searchParams.get('countrycode')).toBe('ru');
  expect(candidates[0]).not.toHaveProperty('confidence');
  expect(classifyCandidates(address, candidates)).toMatchObject({ kind: 'confirmed', candidate: { postcode: '123456' } });
});
it('does not fill street-only answers, missing cities, other buildings or conflicting postcodes', async () => {
  for (const features of [[feature({ housenumber: undefined })], [feature({ city: undefined })],
    [feature({ housenumber: '13' })], [feature(), feature({ postcode: '654321' })]]) {
    const candidates = await new PhotonProvider(async () => Response.json({ features })).resolve(address);
    expect(classifyCandidates(address, candidates).kind).not.toBe('confirmed');
  }
});
it('queues requests at most once per second and cancels a queued request without sending it', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ features: [] }));
  const provider = new PhotonProvider(fetcher);
  const first = provider.resolve(address);
  const abort = new AbortController();
  const second = provider.resolve({ ...address, house: '14' }, abort.signal).catch(() => []);
  const third = provider.resolve({ ...address, house: '15' });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  abort.abort();
  await vi.advanceTimersByTimeAsync(999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await Promise.all([first, second, third]);
});
it.each([[429, 'quota'], [503, 'http']] as const)('reports HTTP %s without silently querying another service', async (status, code) => {
  await expect(new PhotonProvider(async () => new Response('', { status })).resolve(address)).rejects.toMatchObject({ code });
});
it('honors Retry-After after 429 before the next explicit retry', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '3' } }))
    .mockResolvedValue(Response.json({ features: [] }));
  const provider = new PhotonProvider(fetcher);
  await expect(provider.resolve(address)).rejects.toMatchObject({ code: 'quota' });
  const retry = provider.resolve(address);
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  await retry;
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['offline', 'timeout', 'invalid_response'])('reports %s', async (code) => {
  const fetcher: typeof fetch = async () => {
    if (code === 'invalid_response') return new Response('{');
    throw code === 'timeout' ? new DOMException('', 'TimeoutError') : new TypeError('Failed to fetch');
  };
  await expect(new PhotonProvider(fetcher).resolve(address)).rejects.toMatchObject({ code });
});
