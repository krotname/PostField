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
const settleMutations = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

// Bound the hostile host even on the broken implementation so RED cannot starve timers.
function hostileHost(root: Element): { observer: MutationObserver; removals: () => number } {
  let removed = 0;
  const observer = new MutationObserver(() => {
    for (const ui of root.querySelectorAll('[data-postfield-ui]')) {
      if (removed >= 8) return;
      removed++;
      ui.remove();
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return { observer, removals: () => removed };
}

describe('page controller', () => {
  it.each(['field', 'container'] as const)('bounds hostile %s replacements without starving healthy forms', async (replacement) => {
    form();
    const healthy = document.querySelector('form')!.cloneNode(true) as HTMLFormElement;
    const markup = healthy.outerHTML;
    const slot = document.createElement('section');
    document.querySelector('form')!.replaceWith(slot);
    slot.innerHTML = healthy.outerHTML;
    document.body.append(healthy);
    let replacements = 0;
    // A hard host-side fuse makes the broken implementation fail rather than hang.
    const host = new MutationObserver((records) => {
      const inserted = records.some((record) => [...record.addedNodes].some((node) =>
        node instanceof HTMLElement && node.matches('[data-postfield-ui]') && slot.contains(node)));
      if (!inserted || replacements >= 64) return;
      replacements++;
      if (replacement === 'container') slot.innerHTML = markup;
      else {
        const postcode = slot.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')!;
        postcode.replaceWith(postcode.cloneNode());
      }
    });
    host.observe(slot, { childList: true, subtree: true });
    const controller = new PageController(document, async () => exact);
    try {
      await controller.fill();
      await settleMutations();
      expect(replacements).toBeGreaterThan(0);
      expect(replacements).toBeLessThan(64);
      expect(replacements).toBe(replacement === 'field' ? 4 : 33);
      const exhausted = replacements;
      for (let i = 0; i < 3; i++) {
        healthy.querySelector('[data-postfield-ui]')!.remove();
        await settleMutations();
        expect(healthy.querySelector('[data-postfield-ui]')).not.toBeNull();
      }
      expect(replacements).toBe(exhausted);
      host.disconnect();
      expect(await controller.fill()).toBe(2);
      expect(slot.querySelector('[data-postfield-ui]')).not.toBeNull();
      slot.querySelector('[data-postfield-ui]')!.remove();
      await settleMutations();
      expect(slot.querySelector('[data-postfield-ui]')).not.toBeNull();
      expect(slot.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')!.value).toBe('125009');
    } finally { host.disconnect(); controller.stop(); }
  });

  it('drops detached manual mappings and rejects their pending results and choices', async () => {
    document.body.innerHTML = '<form><input value="Москва"><input value="Тверская улица, 13"><input></form>';
    const [city, street, postcode] = [...document.querySelectorAll('input')];
    if (!city || !street || !postcode || exact.kind !== 'confirmed') throw new Error('fixture');
    let complete!: (result: LookupResult) => void;
    const controller = new PageController(document, () => new Promise((done) => { complete = done; }));
    try {
      controller.assign({ postcode, fields: { city, street } });
      const pending = controller.fill();
      document.querySelector('form')!.remove();
      await settleMutations();
      complete(exact);
      await pending;
      expect(postcode.value).toBe('');
      expect(await controller.fill()).toBe(0);
      expect(document.querySelector('[data-postfield-ui]')).toBeNull();
    } finally { controller.stop(); }
  });

  it('restores undiscoverable manual choices, renews their budget and preserves the mapping', async () => {
    document.body.innerHTML = '<form><input value="Москва"><input value="Тверская улица, 13"><input></form>';
    const [city, street, postcode] = [...document.querySelectorAll('input')];
    if (!city || !street || !postcode || exact.kind !== 'confirmed') throw new Error('fixture');
    const controller = new PageController(document, async () => ({ kind: 'ambiguous', candidates: [exact.candidate] }));
    try {
      controller.assign({ postcode, fields: { city, street } });
      for (let cycle = 0; cycle < 2; cycle++) {
        expect(await controller.fill()).toBe(1);
        for (let i = 0; i < 3; i++) {
          document.querySelector('[data-postfield-ui]')!.remove();
          await settleMutations();
          expect(document.querySelector('[data-postfield-choice]')).not.toBeNull();
        }
        document.querySelector('[data-postfield-ui]')!.remove();
        await settleMutations();
        expect(document.querySelector('[data-postfield-ui]')).toBeNull();
      }
      await controller.fill();
      document.querySelector<HTMLButtonElement>('[data-postfield-choice]')!.click();
      expect(postcode.value).toBe('125009');
      postcode.value = '999999';
      postcode.dispatchEvent(new Event('input', { bubbles: true }));
      await controller.fill();
      expect(postcode.value).toBe('999999');
      document.querySelector('[data-postfield-ui]')!.remove();
      controller.stop();
      await settleMutations();
      expect(await controller.fill()).toBe(0);
      controller.assign({ postcode, fields: { city, street } });
      controller.setAutomatic(true);
      expect(document.querySelector('[data-postfield-ui]')).toBeNull();
    } finally { controller.stop(); }
  });

  it('bounds hostile host removals per binding and lets explicit fill restore a fresh budget', async () => {
    form();
    const hostileForm = document.querySelector('form')!;
    const healthyForm = hostileForm.cloneNode(true) as HTMLFormElement;
    document.body.append(healthyForm);
    const host = hostileHost(hostileForm);
    const controller = new PageController(document, async () => exact);
    try {
      await controller.fill();
      await settleMutations();
      expect(host.removals()).toBe(4); // Initial UI plus three automatic restorations.
      expect(hostileForm.querySelector('[data-postfield-ui]')).toBeNull();
      expect(healthyForm.querySelector('[data-postfield-ui]')).not.toBeNull();
      for (let i = 0; i < 3; i++) {
        healthyForm.querySelector('[data-postfield-ui]')!.remove();
        await settleMutations();
        expect(healthyForm.querySelector('[data-postfield-ui]')).not.toBeNull();
      }
      expect(host.removals()).toBe(4); // Unrelated/UI mutations must not renew the budget.
      await controller.fill();
      await settleMutations();
      expect(host.removals()).toBe(8);
      expect(hostileForm.querySelector('[data-postfield-ui]')).toBeNull();
      host.observer.disconnect();
      await controller.fill();
      expect(hostileForm.querySelector('[data-postfield-ui]')).not.toBeNull();
      hostileForm.querySelector('[data-postfield-ui]')!.remove();
      await settleMutations();
      expect(hostileForm.querySelector('[data-postfield-ui]')).not.toBeNull();
    } finally { host.observer.disconnect(); controller.stop(); }
  });
  it('restores several ordinary rerenders and renews restoration on repeated explicit fill', async () => {
    form();
    if (exact.kind !== 'confirmed') throw new Error('fixture');
    const controller = new PageController(document, async () => ({ kind: 'ambiguous', candidates: [exact.candidate] }));
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        await controller.fill();
        for (let rerender = 0; rerender < 3; rerender++) {
          document.querySelector('form')!.replaceChildren(...document.querySelectorAll('input'));
          await settleMutations();
          expect(document.querySelector('[data-postfield-choice]')).not.toBeNull();
        }
        document.querySelector('[data-postfield-ui]')!.remove();
        await settleMutations();
        expect(document.querySelector('[data-postfield-ui]')).toBeNull();
      }
      await controller.fill();
      document.querySelector<HTMLButtonElement>('[data-postfield-choice]')!.click();
      expect(document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')!.value).toBe('125009');
    } finally { controller.stop(); }
  });
  it('does not restore removed UI after stop with a host mutation pending', async () => {
    form();
    const resolve = vi.fn(async () => exact);
    const controller = new PageController(document, resolve);
    try {
      await controller.fill();
      document.querySelector('[data-postfield-ui]')!.remove();
      await Promise.resolve(); // Deliver the mutation before the queued scan.
      controller.stop();
      await settleMutations();
      expect(document.querySelector('[data-postfield-ui]')).toBeNull();
      expect(resolve).toHaveBeenCalledOnce();
    } finally { controller.stop(); }
  });
  it('restores candidate choices after a rerender removes the status UI', async () => {
    form();
    if (exact.kind !== 'confirmed') throw new Error('fixture');
    const resolve = vi.fn(async (): Promise<LookupResult> => ({ kind: 'ambiguous', candidates: [exact.candidate] }));
    const controller = new PageController(document, resolve);
    try {
      await controller.fill();
      const postcode = document.querySelector<HTMLInputElement>('[autocomplete="postal-code"]')!;
      const city = document.querySelector<HTMLInputElement>('[autocomplete="address-level2"]')!.cloneNode() as HTMLInputElement;
      const street = document.querySelector<HTMLInputElement>('[autocomplete="address-line1"]')!.cloneNode() as HTMLInputElement;
      document.querySelector('form')!.replaceChildren(city, street, postcode);
      await new Promise<void>((done) => setTimeout(done, 0));
      await controller.fill();
      const choice = document.querySelector<HTMLButtonElement>('[data-postfield-ui] button');
      expect(choice).not.toBeNull();
      choice!.click();
      expect(postcode.value).toBe('125009');
    } finally { controller.stop(); }
  });
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
