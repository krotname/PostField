import { expect, type BrowserContext, type Page } from '@playwright/test';

export async function openOptions(context: BrowserContext, id: string): Promise<Page> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  // Use the native entry point so the install welcome and the test share one page.
  await worker.evaluate(() => chrome.runtime.openOptionsPage());
  const url = `chrome-extension://${id}/options.html`;
  await expect.poll(() => context.pages().some((page) => page.url() === url)).toBe(true);
  const page = context.pages().find((entry) => entry.url() === url)!;
  await expect(page.locator('#consent')).toBeEnabled();
  return page;
}
