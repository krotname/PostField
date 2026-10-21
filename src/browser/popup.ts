import { extension } from './extension-api.js';
import { field, request, safeError } from './ui-client.js';
import type { UiState } from './ui-client.js';

let state: UiState | null = null;
async function refresh(): Promise<void> {
  state = await request<UiState>({ type: 'STATE' });
  field('origin').textContent = state.origin ?? 'Откройте страницу сайта';
  field('setup').hidden = state.consent && state.hasKey;
  field<HTMLButtonElement>('fill').disabled = !state.origin || !state.consent || !state.hasKey;
  field<HTMLButtonElement>('map').disabled = !state.origin || !state.consent || !state.hasKey;
  field<HTMLSelectElement>('mode').disabled = !state.origin;
  field<HTMLSelectElement>('mode').value = state.origin && state.manualOrigins.includes(state.origin) ? 'manual' : 'auto';
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
field<HTMLSelectElement>('mode').addEventListener('change', () => {
  const origin = state?.origin;
  if (!origin) return;
  const enabled = field<HTMLSelectElement>('mode').value === 'auto';
  void request({ type: 'SITE_SET', origin, enabled }).then(async () => {
    await refresh();
    field('status').textContent = enabled ? 'Режим «Авто»: индекс заполняется по точному адресу.' : 'Режим «Вручную»: нажмите «Заполнить сейчас».';
  }).catch((error: unknown) => { field('status').textContent = safeError(error); void refresh(); });
});
void refresh().catch((error: unknown) => { field('status').textContent = safeError(error); });
