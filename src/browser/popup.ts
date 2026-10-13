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
  field<HTMLInputElement>('automatic').disabled = !state.origin || !state.consent || !state.hasKey;
  field<HTMLInputElement>('automatic').checked = !!state.origin && state.enabledOrigins.includes(state.origin);
}
field('options').addEventListener('click', () => { void extension.runtime.openOptionsPage(); });
for (const [id, type] of [['fill', 'FILL'], ['map', 'MAP']] as const) field(id).addEventListener('click', () => {
  field<HTMLButtonElement>(id).disabled = true;
  field('status').textContent = type === 'FILL' ? 'Проверяю адрес…' : 'Выберите поля на странице.';
  void request<{ forms: number }>({ type }).then((result) => {
    field('status').textContent = type === 'MAP' ? 'Назначьте поля на странице сайта.'
      : result.forms ? 'Результат показан возле поля индекса.' : 'Поля не распознаны. Назначьте их вручную.';
  }, (error: unknown) => { field('status').textContent = safeError(error); }).finally(() => { field<HTMLButtonElement>(id).disabled = false; });
});
field<HTMLInputElement>('automatic').addEventListener('change', () => {
  const toggle = field<HTMLInputElement>('automatic');
  const origin = state?.origin;
  if (!origin) return;
  const enabled = toggle.checked;
  const permission = enabled ? extension.permissions.request({ origins: [`${origin}/*`] }) : Promise.resolve(true);
  void permission.then(async (granted) => {
    if (!granted) { toggle.checked = false; field('status').textContent = 'Разрешение для сайта не выдано.'; return; }
    await request({ type: 'SITE_SET', origin, enabled });
    if (enabled) await request({ type: 'FILL' });
    else await extension.permissions.remove({ origins: [`${origin}/*`] });
    field('status').textContent = enabled ? 'Автоматический режим включён.' : 'Автоматический режим отключён.';
  }).catch((error: unknown) => { toggle.checked = !enabled; field('status').textContent = safeError(error); });
});
void refresh().catch((error: unknown) => { field('status').textContent = safeError(error); });
