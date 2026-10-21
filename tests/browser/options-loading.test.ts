// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('../../src/browser/extension-api.js', () => ({ extension: { runtime: { sendMessage } } }));
afterEach(() => { document.body.replaceChildren(); vi.resetModules(); });

it('does not let an early edit race the saved settings while private storage is loading', async () => {
  document.documentElement.innerHTML = readFileSync('extension/options.html', 'utf8');
  let finish!: (reply: unknown) => void;
  sendMessage.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await import('../../src/browser/options.js');
    const consent = document.querySelector<HTMLInputElement>('#consent')!;
    const provider = document.querySelector<HTMLInputElement>('#provider-photon')!;
    expect(consent.matches(':disabled')).toBe(true);
    expect(provider.matches(':disabled')).toBe(true);
    consent.click(); provider.click();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    finish({ ok: true, data: { consent: false, providerId: 'geoapify', globalMode: 'auto', ready: true,
      hasKey: true, keys: { geoapify: true, dadata: false }, manualOrigins: [], enabledOrigins: [], origin: null } });
    await vi.waitFor(() => expect(consent.matches(':disabled')).toBe(false));
    expect(consent.checked).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#provider-geoapify')!.checked).toBe(true);
    provider.click(); consent.click();
    expect(provider.checked).toBe(true);
    expect(consent.checked).toBe(true);
});
