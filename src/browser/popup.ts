import { extension } from './extension-api.js';
import { field, request, safeError } from './ui-client.js';
import type { UiState } from './ui-client.js';

let state: UiState | null = null;
async function refresh(): Promise<void> {
  state = await request<UiState>({ type: 'STATE' });
  field('origin').textContent = state.origin ?? 'Откройте страницу сайта';
  field('source').textContent = { photon: 'Photon / OSM', geoapify: 'Geoapify', dadata: 'DaData Clean' }[state.providerId];
  field('setup').hidden = state.consent && state.ready;
  field<HTMLButtonElement>('fill').disabled = !state.origin || !state.consent || !state.ready;
  field<HTMLButtonElement>('map').disabled = !state.origin || !state.consent || !state.ready;
  const siteManual = !!state.origin && state.manualOrigins.includes(state.origin);
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="site-mode"]')) {
    radio.disabled = !state.origin;
    radio.checked = radio.value === (siteManual ? 'manual' : 'auto');
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="global-mode"]')) radio.checked = radio.value === state.globalMode;
  field('mode-hint').textContent = state.globalMode === 'manual'
    ? 'Автозаполнение остановлено на всех сайтах. Кнопка «Заполнить сейчас» работает.'
    : siteManual ? 'Для этого сайта сохранён ручной режим. Нажмите «Заполнить сейчас».'
      : 'Индекс заполняется автоматически при единственном точном совпадении дома.';
}
field('options').addEventListener('click', () => { void extension.runtime.openOptionsPage(); });
for (const [id, type] of [['fill', 'FILL'], ['map', 'MAP']] as const) field(id).addEventListener('click', () => {
  field<HTMLButtonElement>(id).disabled = true;
  field('status').textContent = type === 'FILL' ? 'Проверяю адрес…' : 'Выберите поля на странице.';
  void request<{ forms: number }>({ type }).then((result) => {
    field('status').textContent = type === 'MAP' ? 'Назначьте поля на странице сайта.'
      : result.forms ? 'Результат показан возле адреса.' : 'Поля не распознаны. Назначьте их вручную.';
  }, (error: unknown) => { field('status').textContent = safeError(error); }).finally(() => { void refresh(); });
});
for (const radio of document.querySelectorAll<HTMLInputElement>('.segmented input')) radio.addEventListener('change', () => {
  if (!radio.checked || !state || (radio.name === 'site-mode' && !state.origin)) return;
  const message = radio.name === 'global-mode' ? { type: 'GLOBAL_SET', mode: radio.value }
    : { type: 'SITE_SET', origin: state.origin, enabled: radio.value === 'auto' };
  void request(message).then(async () => {
    await refresh(); field('status').textContent = 'Режим сохранён.';
  }).catch((error: unknown) => { field('status').textContent = safeError(error); void refresh(); });
});
void refresh().catch((error: unknown) => { field('status').textContent = safeError(error); });
