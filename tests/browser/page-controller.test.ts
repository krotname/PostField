// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageController } from '../../src/browser/page-controller.js';
import type { LookupResult } from '../../src/core/address.js';

afterEach(() => { document.body.innerHTML = ''; });
const exact: LookupResult = { kind: 'confirmed', candidate: { country: 'ru', city: 'Москва', street: 'Тверская улица', house: '13',
  postcode: '125009', confidence: 1, resultType: 'building', formatted: 'Москва, Тверская улица, 13' } };
function form(): void {
  document.body.innerHTML = '<form><input autocomplete="address-level2" value="Москва"><input autocomplete="address-line1" value="Тверская улица, 13"><input autocomplete="postal-code"></form>';
}

describe('page controller', () => {
  it('explains missing postcode proof before an explicit choice', async () => {
    form();
    const candidate = exact.kind === 'confirmed' ? { ...exact.candidate, requiresPostcodeConfirmation: true } : (() => { throw new Error(); })();
    const controller = new PageController(document, async () => ({ kind: 'ambiguous', candidates: [candidate] }));
    await controller.fill();
    expect(document.querySelector('[data-postfield-ui]')?.textContent).toContain('Точность индекса не подтверждена');
    expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('');
    document.querySelector<HTMLButtonElement>('[data-postfield-choice]')?.click();
    expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('125009');
    controller.stop();
  });
  it('forgets a reused postcode when its former address controls are detached', async () => {
    form();
    const resolve = vi.fn(async () => ({ kind: 'not_found' } as const));
    const controller = new PageController(document, resolve);
    await controller.fill();
    const postcode = document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')!;
    for (const field of document.querySelectorAll('input:not([autocomplete="postal-code"])')) field.remove();
    postcode.removeAttribute('autocomplete');
    expect(await controller.fill()).toBe(0);
    expect(resolve).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-postfield-ui]')).toBeNull();
    controller.stop();
  });
  it('fills via the application layer and never submits the form', async () => {
    form();
    const submit = vi.fn();
    document.querySelector('form')?.addEventListener('submit', submit);
    const controller = new PageController(document, async () => exact);
    expect(await controller.fill()).toBe(1);
    expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('125009');
    expect(submit).not.toHaveBeenCalled();
    controller.stop();
  });
  it('requires explicit choice for ambiguous candidates', async () => {
    form();
    const candidate = exact.kind === 'confirmed' ? exact.candidate : (() => { throw new Error(); })();
    const controller = new PageController(document, async () => ({ kind: 'ambiguous', candidates: [candidate] }));
    await controller.fill();
    const postcode = document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]');
    expect(postcode?.value).toBe('');
    document.querySelector<HTMLButtonElement>('[data-postfield-choice]')?.click();
    expect(postcode?.value).toBe('125009');
    controller.stop();
  });
  it('finds a newly added form and preserves its manual value', async () => {
    const resolve = vi.fn(async () => exact);
    const controller = new PageController(document, resolve);
    form();
    const postcode = document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]');
    if (postcode) postcode.value = '999999';
    await controller.fill();
    expect(postcode?.value).toBe('999999');
    expect(resolve).not.toHaveBeenCalled();
    controller.stop();
  });
});
