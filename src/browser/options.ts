import { field, request, safeError } from './ui-client.js';
import type { UiState } from './ui-client.js';

async function refresh(): Promise<void> {
  const state = await request<UiState>({ type: 'STATE' });
  field<HTMLInputElement>('consent').checked = state.consent;
  field('key-state').textContent = state.hasKey ? 'Ключ сохранён. Оставьте поле пустым, чтобы использовать его дальше.' : 'Ключ ещё не добавлен.';
  field<HTMLButtonElement>('delete-key').disabled = !state.hasKey;
  const list = field<HTMLUListElement>('origins');
  list.replaceChildren();
  for (const origin of state.manualOrigins) { const item = document.createElement('li'); item.textContent = origin; list.append(item); }
  if (!state.manualOrigins.length) { const item = document.createElement('li'); item.textContent = 'Все сайты — в режиме «Авто».'; list.append(item); }
}
field<HTMLFormElement>('settings').addEventListener('submit', (event) => {
  event.preventDefault();
  const key = field<HTMLInputElement>('key');
  void request({ type: 'SAVE', key: key.value, consent: field<HTMLInputElement>('consent').checked }).then(async () => {
    key.value = '';
    await refresh();
    field('status').textContent = 'Настройки сохранены.';
  }, (error: unknown) => { field('status').textContent = safeError(error); });
});
field('delete-key').addEventListener('click', () => {
  void request({ type: 'DELETE_KEY' }).then(async () => { await refresh(); field('status').textContent = 'Ключ удалён.'; },
    (error: unknown) => { field('status').textContent = safeError(error); });
});
void refresh().catch((error: unknown) => { field('status').textContent = safeError(error); });
