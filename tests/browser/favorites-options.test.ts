// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('../../src/browser/extension-api.js', () => ({ extension: { runtime: { sendMessage } } }));
afterEach(() => { document.body.replaceChildren(); vi.resetModules(); });
it('saves a favorite with optional confirmation and offers edit and delete controls', async () => {
  document.documentElement.innerHTML = readFileSync('extension/options.html', 'utf8');
  const state = { consent: true, providerId: 'photon', globalMode: 'auto', ready: true, hasKey: false,
    keys: { geoapify: false, dadata: false }, manualOrigins: [], enabledOrigins: [], origin: null, favorites: [] as unknown[] };
  sendMessage.mockImplementation(async (message: Record<string, unknown>) => {
    if (message.type === 'FAVORITE_SAVE') state.favorites = [message.favorite];
    if (message.type === 'FAVORITE_DELETE') state.favorites = [];
    return { ok: true, data: message.type === 'STATE' ? state : {} };
  });
  await import('../../src/browser/options.js');
  await vi.waitFor(() => expect(document.querySelector<HTMLFieldSetElement>('#favorite-fields')!.disabled).toBe(false));
  for (const [key, value] of Object.entries({ city: 'Тестоград', street: 'Тестовая', house: '7', postcode: '123456' })) {
    document.querySelector<HTMLInputElement>(`#favorite-${key}`)!.value = value;
  }
  document.querySelector<HTMLInputElement>('#favorite-confirm')!.checked = true;
  document.querySelector('#favorite-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector('#favorites')!.textContent).toContain('123456'));
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'FAVORITE_SAVE', favorite: expect.objectContaining({ confirm: true }) }));
  const edit = document.querySelectorAll<HTMLButtonElement>('#favorites button')[0]!;
  edit.click(); expect(document.querySelector<HTMLInputElement>('#favorite-city')!.value).toBe('Тестоград');
  document.querySelectorAll<HTMLButtonElement>('#favorites button')[1]!.click();
  await vi.waitFor(() => expect(document.querySelector('#favorites')!.textContent).toContain('пока нет'));
});
