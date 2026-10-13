// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { startManualMapping } from '../../src/browser/manual-mapping.js';
import type { AddressGroup } from '../../src/adapters/forms.js';

describe('manual field assignment', () => {
  it('maps only the four fields selected by the user', () => {
    document.body.innerHTML = '<input id="c"><input id="s"><input id="h"><input id="p">';
    const ready = vi.fn<(group: AddressGroup) => void>();
    startManualMapping(document, ready);
    for (const id of ['c', 's', 'h', 'p']) document.getElementById(id)?.click();
    expect(ready).toHaveBeenCalledOnce();
    expect(ready.mock.calls[0]?.[0].postcode.id).toBe('p');
    expect(ready.mock.calls[0]?.[0].fields.city?.id).toBe('c');
    expect(document.querySelector('[data-postfield-mapping]')).toBeNull();
  });
  it('cancels with Escape without changing form values', () => {
    document.body.innerHTML = '<input id="private" type="password" value="unchanged">';
    const ready = vi.fn();
    startManualMapping(document, ready);
    document.getElementById('private')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ready).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('unchanged');
  });
});
