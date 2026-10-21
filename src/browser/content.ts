import { PageController } from './page-controller.js';
import { extension } from './extension-api.js';
import { startManualMapping } from './manual-mapping.js';
import type { LookupResult } from '../core/address.js';
import type { Reply } from './message-service.js';

const page = globalThis as typeof globalThis & { __postfieldInstalled?: boolean };
if (!page.__postfieldInstalled) {
  page.__postfieldInstalled = true;
  let controller: PageController | null = null;
  let cancelMapping: (() => void) | null = null;
  async function configure(): Promise<void> {
    const reply: Reply = await extension.runtime.sendMessage({ type: 'CONTEXT' });
    const context = reply.ok ? reply.data as { allowed?: boolean; automatic?: boolean } : null;
    if (!context?.allowed) { cancelMapping?.(); controller?.stop(); controller = null; return; }
    controller ??= new PageController(document, async (address) => {
      const response: Reply | null = await extension.runtime.sendMessage({ type: 'LOOKUP', address }).catch(() => null);
      if (!response || !response.ok) return { kind: 'error', code: 'service' };
      const result = response.data as { kind?: string };
      if (['confirmed', 'ambiguous', 'not_found', 'incomplete', 'unsupported', 'error'].includes(result.kind ?? '')) return response.data as LookupResult;
      return { kind: 'error', code: 'service' };
    });
    controller.setAutomatic(context.automatic === true);
  }
  extension.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return false;
    if (message.type === 'FILL_NOW') {
      void configure().then(async () => respond({ forms: await controller?.fill() ?? 0 }), () => respond({ forms: 0 }));
      return true;
    }
    if (message.type === 'MAP_FIELDS') {
      void configure().then(() => {
        cancelMapping?.();
        if (controller) cancelMapping = startManualMapping(document, (group) => { controller?.assign(group); void controller?.fill(); });
        respond({ started: !!controller });
      }, () => respond({ started: false }));
      return true;
    }
    if (message.type === 'CONFIG_CHANGED') { void configure().catch(() => {}); }
    return false;
  });
  void configure().catch(() => {});
}
