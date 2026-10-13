import { describe, expect, it, vi } from 'vitest';
import { FormSession } from '../../src/application/form-session.js';
import type { Address, LookupResult } from '../../src/core/address.js';

const first = { country: 'ru' as const, city: 'Москва', street: 'Тверская улица', house: '13' };
const second = { ...first, house: '15' };
const confirmed: LookupResult = { kind: 'confirmed', candidate: { ...first, postcode: '125009', confidence: 1, resultType: 'building', formatted: 'address' } };

describe('safe form session', () => {
  it('leaves a manually entered postcode untouched', async () => {
    const resolve = vi.fn<(address: Address) => Promise<LookupResult>>().mockResolvedValue(confirmed);
    const write = vi.fn<(value: string) => void>();
    let postcode = '123456';
    const session = new FormSession(resolve, () => first, () => postcode, write);
    await session.lookup();
    expect(resolve).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    postcode = '';
  });
  it('drops a response for a changed address', async () => {
    let current = first;
    let complete: (result: LookupResult) => void = () => {};
    const resolve = () => new Promise<LookupResult>((done) => { complete = done; });
    const write = vi.fn<(value: string) => void>();
    const session = new FormSession(resolve, () => current, () => '', write);
    const request = session.lookup();
    current = second;
    session.addressChanged();
    complete(confirmed);
    await request;
    expect(write).not.toHaveBeenCalled();
  });
  it('clears only a previously inserted value when the address changes', async () => {
    let current = first;
    let postcode = '';
    const session = new FormSession(async () => confirmed, () => current, () => postcode, (value) => { postcode = value; });
    await session.lookup();
    expect(postcode).toBe('125009');
    current = second;
    session.addressChanged();
    expect(postcode).toBe('');
  });
  it('preserves manual editing of its own earlier value', async () => {
    let postcode = '';
    const session = new FormSession(async () => confirmed, () => first, () => postcode, (value) => { postcode = value; });
    await session.lookup();
    postcode = '999999';
    session.manualPostcodeChanged();
    session.addressChanged();
    expect(postcode).toBe('999999');
  });
  it('does not overwrite a manual value entered while the request was pending', async () => {
    let postcode = '';
    let complete: (result: LookupResult) => void = () => {};
    const session = new FormSession(() => new Promise((done) => { complete = done; }), () => first, () => postcode, (value) => { postcode = value; });
    const request = session.lookup();
    postcode = '999999';
    session.manualPostcodeChanged();
    complete(confirmed);
    await request;
    expect(postcode).toBe('999999');
  });
});
