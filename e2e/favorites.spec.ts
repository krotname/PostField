import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openOptions } from './options-page.js';

test('favorites: explicit save, offline lookup, optional confirmation, restart and deletion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'postfield-favorites-'));
  const extensionPath = join(root, 'extension');
  await cp(resolve('dist/chrome'), extensionPath, { recursive: true });
  const background = join(extensionPath, 'background.js');
  await writeFile(background, `globalThis.__requests=0; globalThis.fetch=async()=>{globalThis.__requests++;throw new Error('offline fixture')};\n${await readFile(background, 'utf8')}`);
  const launch = () => chromium.launchPersistentContext(join(root, 'profile'), { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  let context = await launch();
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    let options = await openOptions(context, id);
    for (const [key, value] of Object.entries({ city: 'Тестоград', street: 'Тестовая улица', house: '13к2', postcode: '123456' })) {
      await options.locator(`#favorite-${key}`).fill(value);
    }
    await options.getByRole('button', { name: 'Сохранить адрес', exact: true }).click();
    await expect(options.locator('#favorites')).toContainText('Без подтверждения');
    const form = await context.newPage();
    await form.goto('http://127.0.0.1:4173');
    await form.locator('[autocomplete=address-level2]').fill('Тестоград');
    await form.locator('[autocomplete=address-line1]').fill('Тестовая улица');
    await form.locator('[name=house]').fill('13к2');
    await expect(form.locator('[autocomplete=postal-code]')).toHaveValue('123456');
    expect(await worker.evaluate(() => (globalThis as typeof globalThis & { __requests: number }).__requests)).toBe(0);
    await options.getByRole('button', { name: 'Изменить', exact: true }).click();
    await options.locator('#favorite-confirm').check();
    await options.getByRole('button', { name: 'Сохранить адрес', exact: true }).click();
    await expect(options.locator('#favorites')).toContainText('С подтверждением');
    await options.evaluate(() => { document.documentElement.style.fontSize = '150%'; });
    await options.screenshot({ path: 'output/playwright/favorites-options.png', fullPage: true });
    await context.close(); context = await launch();
    options = await openOptions(context, id);
    await expect(options.locator('#favorites')).toContainText('С подтверждением');
    const restored = await context.newPage();
    await restored.goto('http://127.0.0.1:4173');
    await restored.locator('[autocomplete=address-level2]').fill('Тестоград');
    await restored.locator('[autocomplete=address-line1]').fill('Тестовая улица');
    await restored.locator('[name=house]').fill('13к2');
    await expect(restored.locator('[data-postfield-choice]')).toHaveCount(1);
    await expect(restored.locator('[autocomplete=postal-code]')).toHaveValue('');
    await restored.locator('[data-postfield-choice]').click();
    await expect(restored.locator('[autocomplete=postal-code]')).toHaveValue('123456');
    await options.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(options.locator('#favorites')).toContainText('пока нет');
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
