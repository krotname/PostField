// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PageController } from '../../src/browser/page-controller.js';
afterEach(() => { document.body.innerHTML = ''; });
it('keeps the status beside an AliExpress-style address block and outside its two-column input row', async () => {
  document.body.innerHTML = `<div role="dialog"><div id="panel" style="height:630px"><div id="content" style="display:flex;flex-direction:column;height:494px">
    <label>адрес или индекс<textarea>Город, Тестовая, 15</textarea></label>
    <div id="row" style="display:flex;flex-direction:row;height:64px"><label>Индекс<input name="postcode"></label><label>Квартира/Офис<input name="room"></label></div>
    <button id="manual">Ввести адрес вручную</button></div></div></div>`;
  const controller = new PageController(document, async () => ({ kind: 'error', code: 'timeout' }));
  try {
    expect(await controller.fill()).toBe(1);
    const ui = document.querySelector<HTMLElement>('[data-postfield-ui]');
    expect(document.getElementById('row')?.nextElementSibling).toBe(ui);
    expect(ui?.parentElement?.id).toBe('content');
    expect(ui?.style.flexBasis).toBe('auto');
  } finally { controller.stop(); }
});
it('puts a retriable error outside a fixed-height input wrapper and never into its value', async () => {
  document.body.innerHTML = `<div role="dialog"><div><input autocomplete="street-address" value="Город, Тестовая, 15"></div>
    <div id="fixed" style="height:60px;position:relative"><span>Индекс</span><input name="postcode"></div></div>`;
  const resolve = vi.fn(async () => ({ kind: 'error' as const, code: 'timeout' as const }));
  const controller = new PageController(document, resolve);
  try {
    expect(await controller.fill()).toBe(1);
    expect(document.querySelector('#fixed [data-postfield-ui]')).toBeNull();
    expect(document.querySelector<HTMLInputElement>('[name=postcode]')?.value).toBe('');
    const retry = document.querySelector<HTMLButtonElement>('[data-postfield-retry]');
    expect(retry).not.toBeNull();
    retry!.click();
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
  } finally { controller.stop(); }
});
