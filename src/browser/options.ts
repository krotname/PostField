import { field, request, safeError } from './ui-client.js';
import type { UiState } from './ui-client.js';
import type { ProviderId } from '../core/providers.js';
import { isProviderId } from '../core/providers.js';

let state: UiState | null = null;
function selectedProvider(): ProviderId {
  const value = document.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value;
  return isProviderId(value) ? value : 'photon';
}
function providerFields(): void {
  const providerId = selectedProvider();
  field('key-panel').hidden = providerId === 'photon';
  field('secret-panel').hidden = providerId !== 'dadata';
  field('key-label').textContent = providerId === 'dadata' ? 'Токен DaData' : 'API-ключ Geoapify';
  const saved = providerId !== 'photon' && state?.keys[providerId];
  field('key-state').textContent = providerId === 'photon' ? 'Ключ не нужен. Запросы отправляются на публичный сервер Photon.'
    : saved ? 'Ключ сохранён. Оставьте поля пустыми, чтобы использовать его дальше.' : 'Ключ ещё не добавлен.';
  field<HTMLButtonElement>('delete-key').disabled = !saved;
  field('delete-key').hidden = providerId === 'photon';
}

async function refresh(): Promise<void> {
  field<HTMLFieldSetElement>('settings-fields').disabled = true;
  state = await request<UiState>({ type: 'STATE' });
  field<HTMLInputElement>('consent').checked = state.consent;
  field<HTMLInputElement>(`provider-${state.providerId}`).checked = true;
  field('welcome').textContent = state.providerId === 'photon' && state.consent
    ? 'PostField готов к работе без ключа. Адрес из формы передаётся Photon для поиска индекса.'
    : 'Источник, ключи и разрешение передачи адреса сохраняются только в этом браузере.';
  providerFields();
  const list = field<HTMLUListElement>('origins');
  list.replaceChildren();
  for (const origin of state.manualOrigins) { const item = document.createElement('li'); item.textContent = origin; list.append(item); }
  if (!state.manualOrigins.length) { const item = document.createElement('li'); item.textContent = 'Ручных исключений нет.'; list.append(item); }
  field<HTMLFieldSetElement>('settings-fields').disabled = false;
}
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="provider"]')) radio.addEventListener('change', () => {
  field<HTMLInputElement>('key').value = ''; field<HTMLInputElement>('secret').value = ''; providerFields();
});
field<HTMLFormElement>('settings').addEventListener('submit', (event) => {
  event.preventDefault();
  const key = field<HTMLInputElement>('key');
  const secret = field<HTMLInputElement>('secret');
  void request({ type: 'SAVE', providerId: selectedProvider(), key: key.value, secret: secret.value,
    consent: field<HTMLInputElement>('consent').checked }).then(async () => {
    key.value = ''; secret.value = '';
    await refresh();
    field('status').textContent = 'Настройки сохранены.';
  }, (error: unknown) => { field('status').textContent = safeError(error); });
});
field('delete-key').addEventListener('click', () => {
  void request({ type: 'DELETE_KEY', providerId: selectedProvider() }).then(async () => { await refresh(); field('status').textContent = 'Ключ выбранного источника удалён.'; },
    (error: unknown) => { field('status').textContent = safeError(error); });
});
void refresh().catch((error: unknown) => { field('status').textContent = safeError(error); });
