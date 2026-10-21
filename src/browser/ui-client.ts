import { extension } from './extension-api.js';
import type { Reply } from './message-service.js';
import type { FillMode, ProviderId } from '../core/providers.js';

export interface UiState {
  consent: boolean; hasKey: boolean; ready: boolean; providerId: ProviderId; globalMode: FillMode;
  keys: { geoapify: boolean; dadata: boolean }; enabledOrigins: string[]; manualOrigins: string[]; origin: string | null;
}
export async function request<T>(message: object): Promise<T> {
  const reply: Reply = await extension.runtime.sendMessage(message);
  if (!reply.ok) throw new Error(reply.error);
  return reply.data as T;
}
export function field<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error('missing_ui_element');
  return element as T;
}
export function safeError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = { setup_required: 'Разрешите передачу адреса и настройте выбранный источник.',
    unsupported_page: 'Откройте обычную страницу сайта.', permission_required: 'Для этого сайта требуется разрешение.',
    operation_failed: 'Операция не выполнена. Проверьте разрешения сайта.', forbidden: 'Действие недоступно.',
    invalid_origin: 'Переключитесь на нужный сайт и откройте PostField снова.' };
  return messages[code] ?? 'Операция не выполнена. Попробуйте открыть PostField снова.';
}
