// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageController } from '../../src/browser/page-controller.js';
import type { LookupResult } from '../../src/core/address.js';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });
const exact: LookupResult = { kind: 'confirmed', candidate: { country: 'ru', city: 'Москва', street: 'Тверская улица', house: '13',
  postcode: '125009', confidence: 1, resultType: 'building', formatted: 'Москва, Тверская улица, 13' } };
function form(): void {
  document.body.innerHTML = '<form><input autocomplete="address-level2" value="Москва"><input autocomplete="address-line1" value="Тверская улица, 13"><input autocomplete="postal-code"></form>';
}

describe('page controller', () => {
  it('clears its old postcode when a dynamic form replaces address controls', async () => {
    form();
    const resolve = vi.fn(async () => exact);
    const controller = new PageController(document, resolve);
    try {
      await controller.fill();
      const postcode = document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')!;
      expect(postcode.value).toBe('125009');
      const street = document.querySelector<HTMLInputElement>('[autocomplete="address-line1"]')!;
      const replacement = street.cloneNode() as HTMLInputElement;
      replacement.value = 'Другая улица, 5';
      street.replaceWith(replacement);
      await new Promise<void>((done) => setTimeout(done, 0));
      expect(postcode.value).toBe('');
      postcode.value = '999999';
      postcode.dispatchEvent(new Event('input', { bubbles: true }));
      replacement.replaceWith(street);
      await new Promise<void>((done) => setTimeout(done, 0));
      expect(postcode.value).toBe('999999');
    } finally { controller.stop(); }
  });
  it('cancels scheduled automatic lookups while keeping explicit fill available', async () => {
    vi.useFakeTimers();
    form();
    const resolve = vi.fn(async () => exact);
    const controller = new PageController(document, resolve);
    try {
      controller.setAutomatic(true);
      controller.setAutomatic(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(resolve).not.toHaveBeenCalled();
      expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('');
      await controller.fill();
      expect(resolve).toHaveBeenCalledOnce();
      expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('125009');
    } finally { controller.stop(); }
  });
  it('discards an in-flight automatic result even after automatic mode is enabled again', async () => {
    vi.useFakeTimers();
    form();
    let complete!: (result: LookupResult) => void;
    const resolve = vi.fn(() => new Promise<LookupResult>((done) => { complete = done; }));
    const controller = new PageController(document, resolve);
    try {
      controller.setAutomatic(true);
      await vi.advanceTimersByTimeAsync(900);
      expect(resolve).toHaveBeenCalledOnce();
      controller.setAutomatic(false);
      controller.setAutomatic(true);
      complete(exact);
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('');
      await vi.advanceTimersByTimeAsync(900);
      expect(resolve).toHaveBeenCalledTimes(2);
      complete(exact);
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('125009');
    } finally { controller.stop(); }
  });
  it('keeps an explicit request when automatic mode is disabled', async () => {
    vi.useFakeTimers();
    form();
    let complete!: (result: LookupResult) => void;
    const resolve = vi.fn(() => new Promise<LookupResult>((done) => { complete = done; }));
    const controller = new PageController(document, resolve);
    try {
      controller.setAutomatic(true);
      const request = controller.fill();
      controller.setAutomatic(false);
      complete(exact);
      await request;
      expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('125009');
      await vi.advanceTimersByTimeAsync(1000);
      expect(resolve).toHaveBeenCalledOnce();
    } finally { controller.stop(); }
  });
  it('still clears its own old postcode after automatic mode is disabled', async () => {
    vi.useFakeTimers();
    form();
    const controller = new PageController(document, async () => exact);
    try {
      controller.setAutomatic(true);
      await vi.advanceTimersByTimeAsync(900);
      controller.setAutomatic(false);
      const street = document.querySelector<HTMLInputElement>('[autocomplete="address-line1"]')!;
      street.value = 'Тверская улица, 15';
      street.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')?.value).toBe('');
    } finally { controller.stop(); }
  });
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
