import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('extension options, background, content script and DOM preserve manual input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'postfield-e2e-'));
  const extensionPath = join(root, 'extension');
  await cp(resolve('dist/chrome'), extensionPath, { recursive: true });
  // Isolated fixture host is pregranted; production packages keep optional site permissions.
  const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8')) as { host_permissions: string[] };
  manifest.host_permissions.push('http://127.0.0.1/*');
  await writeFile(join(extensionPath, 'manifest.json'), JSON.stringify(manifest));
  // Inject only the external HTTP port before the service worker captures fetch.
  // Chromium does not route extension worker requests consistently across releases.
  const background = join(extensionPath, 'background.js');
  const fixture = { results: [{ country_code: 'ru', city: 'Москва', street: 'Тверская улица', housenumber: '13',
    postcode: '125009', formatted: 'Москва, Тверская улица, 13', result_type: 'building', rank: { confidence: 1 } }] };
  await writeFile(background, `globalThis.fetch = async () => new Response(${JSON.stringify(JSON.stringify(fixture))}, {status:200});\n${await readFile(background, 'utf8')}`);
  const context = await chromium.launchPersistentContext(join(root, 'profile'), { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await options.locator('input[type=password]').fill('synthetic-key');
    await options.locator('input[type=checkbox]').check();
    await options.getByRole('button', { name: 'Сохранить' }).click();
    await expect(options.locator('input[type=password]')).toHaveValue('');
    const form = await context.newPage();
    await form.goto('http://127.0.0.1:4173');
    await form.bringToFront();
    const fill = () => options.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
      return api.runtime.sendMessage({ type: 'FILL' });
    });
    expect(await fill()).toMatchObject({ ok: true, data: { forms: 1 } });
    await expect(form.locator('[data-postfield-ui]')).toContainText('Точность индекса не подтверждена');
    await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('');
    await form.locator('[data-postfield-choice]').click();
    await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('125009');
    await form.locator('[autocomplete=postal-code]').fill('654321');
    await fill();
    await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('654321');
    await expect(form.locator('body')).not.toHaveAttribute('data-submitted');
    const leak = await form.evaluate(() => ({ key: (globalThis as typeof globalThis & { apiKey?: string }).apiKey,
      text: document.body.textContent }));
    expect(JSON.stringify(leak)).not.toContain('synthetic-key');
    await options.screenshot({ path: 'output/playwright/options.png', fullPage: true });
    await form.screenshot({ path: 'output/playwright/checkout.png', fullPage: true });
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
