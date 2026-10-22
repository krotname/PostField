import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openOptions } from './options-page.js';

for (const providerId of ['photon', 'geoapify', 'dadata'] as const) {
  test(`${providerId}: setup, exact house, source isolation, keyboard modes and restart`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'postfield-providers-'));
    const extensionPath = join(root, 'extension');
    await cp(resolve('dist/chrome'), extensionPath, { recursive: true });
    const background = join(extensionPath, 'background.js');
    const response = {
      photon: { features: [{ properties: { countrycode: 'RU', city: 'Тестоград', street: 'Тестовая улица', housenumber: '13к2', postcode: '123456' } }] },
      geoapify: { results: [{ country_code: 'ru', city: 'Тестоград', street: 'Тестовая улица', housenumber: '13к2', postcode: '123456', rank: { confidence: 1 }, result_type: 'building' }] },
      dadata: [{ country_iso_code: 'RU', city: 'Тестоград', street_with_type: 'Тестовая улица', house: '13', block: '2', block_type: 'к', postal_code: '123456',
        house_fias_id: 'house-id', fias_actuality_state: '0', qc: 0, qc_house: 2, qc_complete: 5 }],
    };
    const mock = `globalThis.__requests=[]; globalThis.fetch=async (url) => { const source=String(url).includes('photon.komoot.io')?'photon':String(url).includes('geoapify')?'geoapify':'dadata'; globalThis.__requests.push(source); return Response.json(${JSON.stringify(response)}[source]); };\n`;
    await writeFile(background, mock + await readFile(background, 'utf8'));
    const launch = () => chromium.launchPersistentContext(join(root, 'profile'), { channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    let context = await launch();
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const id = new URL(worker.url()).hostname;
      const options = await openOptions(context, id);
      await expect(options.locator('#provider-photon')).toBeChecked();
      await expect(options.locator('#consent')).toBeChecked();
      if (providerId !== 'photon') {
        await options.locator(`#provider-${providerId}`).check();
        await options.locator('#key').fill('synthetic-token');
        if (providerId === 'dadata') await options.locator('#secret').fill('synthetic-secret');
        await options.getByRole('button', { name: 'Сохранить', exact: true }).click();
        await expect(options.locator('#status')).toHaveText('Настройки сохранены.');
      }
      const form = await context.newPage();
      await form.goto('http://127.0.0.1:4173');
      await form.locator('[autocomplete=address-level2]').fill('Тестоград');
      await form.locator('[autocomplete=address-line1]').fill('Тестовая улица');
      await form.locator('[name=house]').fill('13к2');
      await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('123456');
      expect(await worker.evaluate(() => (globalThis as typeof globalThis & { __requests: string[] }).__requests)).toEqual([providerId]);
      await form.locator('[autocomplete=postal-code]').fill('654321');
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await popup.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
      const manual = popup.locator('input[name=global-mode][value=manual]');
      await manual.focus();
      await popup.keyboard.press('Space');
      await expect(manual).toBeChecked();
      await expect.poll(() => options.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'STATE' })).data.globalMode)).toBe('manual');
      const overlap = await popup.locator('.mode-card').evaluateAll((cards) => cards.map((card) => {
        const labels = [...card.querySelectorAll('.segmented label')].map((label) => label.getBoundingClientRect());
        return labels.length === 2 && labels[0]!.right <= labels[1]!.left && Math.abs(labels[0]!.height - labels[1]!.height) < 1;
      }));
      expect(overlap).toEqual([true, true]);
      expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await popup.screenshot({ path: `output/playwright/popup-${providerId}-zoom.png`, fullPage: true });
      await options.screenshot({ path: `output/playwright/providers-${providerId}.png`, fullPage: true });
      await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('654321');
      await context.close();
      context = await launch();
      const restored = await openOptions(context, id);
      const state = await restored.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'STATE' })).data);
      expect(state).toMatchObject({ providerId, globalMode: 'manual', consent: true, ready: true });
      expect(JSON.stringify(state)).not.toContain('synthetic-');
    } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
  });
}
