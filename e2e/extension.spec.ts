import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openOptions } from './options-page.js';

for (const scenario of [
  { name: 'manual', city: 'Москва', street: 'Тверская улица', house: '13', region: 'Москва',
    providerPostcode: '125009', expectedPostcode: '125009', automatic: false },
  { name: 'automatic', city: 'Москва', street: 'Тверская улица', house: '13', region: 'Москва',
    providerPostcode: '125009', expectedPostcode: '125009', automatic: true },
  { name: 'correction', city: 'Петрозаводск', street: 'улица Чапаева', house: '52', region: 'Республика Карелия',
    providerPostcode: '185000', expectedPostcode: '185002', automatic: true },
]) {
test(`extension ${scenario.name}: options, background, content script and DOM preserve manual input`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'postfield-e2e-'));
  const extensionPath = join(root, 'extension');
  await cp(resolve('dist/chrome'), extensionPath, { recursive: true });
  // Production and the isolated fixture use the same HTTP(S) permissions.
  const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8')) as { host_permissions: string[] };
  await writeFile(join(extensionPath, 'manifest.json'), JSON.stringify(manifest));
  // Inject only the external HTTP port before the service worker captures fetch.
  // Chromium does not route extension worker requests consistently across releases.
  const background = join(extensionPath, 'background.js');
  const fixture = { results: [{ country_code: 'ru', city: scenario.city, street: scenario.street, housenumber: scenario.house,
    state: scenario.region, postcode: scenario.providerPostcode,
    formatted: `${scenario.city}, ${scenario.street}, ${scenario.house}, ${scenario.providerPostcode}`,
    result_type: 'building', rank: { confidence: 1 } }] };
  await writeFile(background, `globalThis.fetch = async () => new Response(${JSON.stringify(JSON.stringify(fixture))}, {status:200});\n${await readFile(background, 'utf8')}`);
  const launch = () => chromium.launchPersistentContext(join(root, 'profile'), { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  let context = await launch();
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    const options = await openOptions(context, id);
    await options.locator('#provider-geoapify').check();
    await expect(options.locator('#key-state')).toContainText('Ключ ещё не добавлен.');
    await options.locator('#key').fill('synthetic-key');
    await options.locator('input[type=checkbox]').check();
    await options.getByRole('button', { name: 'Сохранить' }).click();
    await expect(options.getByRole('status')).toHaveText('Настройки сохранены.');
    await expect(options.locator('input[type=checkbox]')).toBeChecked();
    await expect(options.locator('#key')).toHaveValue('');
    const form = await context.newPage();
    await form.goto('http://127.0.0.1:4173');
    await form.locator('[autocomplete=address-level2]').fill(scenario.city);
    await form.locator('[autocomplete=address-line1]').fill(scenario.street);
    await form.locator('[name=house]').fill(scenario.house);
    await form.bringToFront();
    await expect.poll(() => options.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url;
    })).toBe('http://127.0.0.1:4173/');
    if (!scenario.automatic) {
      expect(await options.evaluate(() => chrome.runtime.sendMessage({ type: 'SITE_SET', origin: 'http://127.0.0.1:4173', enabled: false }))).toMatchObject({ ok: true });
      await form.waitForTimeout(1100);
      await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('');
    }
    const fill = () => options.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
      return api.runtime.sendMessage({ type: 'FILL' });
    });
    if (!scenario.automatic) expect(await fill()).toEqual({ ok: true, data: { forms: 1 } });
    await expect(form.locator('[autocomplete=postal-code]')).toHaveValue(scenario.expectedPostcode);
    await form.locator('[autocomplete=postal-code]').fill('654321');
    await fill();
    await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('654321');
    await expect(form.locator('body')).not.toHaveAttribute('data-submitted');
    const leak = await form.evaluate(() => ({ key: (globalThis as typeof globalThis & { apiKey?: string }).apiKey,
      text: document.body.textContent }));
    expect(JSON.stringify(leak)).not.toContain('synthetic-key');
    await options.screenshot({ path: `output/playwright/options-${scenario.name}.png`, fullPage: true });
    await form.screenshot({ path: `output/playwright/checkout-${scenario.name}.png`, fullPage: true });
    await context.close();
    context = await launch();
    const reopened = await openOptions(context, id);
    await expect(reopened.locator('#key-state')).toContainText('Ключ сохранён');
    await expect(reopened.locator('#consent')).toBeChecked();
    const stored = await reopened.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'STATE' })).data);
    expect(stored.manualOrigins).toEqual(scenario.automatic ? [] : ['http://127.0.0.1:4173']);
    expect(stored.hasKey).toBe(true);
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
}
