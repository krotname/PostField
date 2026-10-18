// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { discoverAddressGroups, readAddress, writePostcode } from '../../src/adapters/forms.js';

beforeEach(() => { document.body.innerHTML = ''; });

describe('address fields', () => {
  it('ignores disabled fieldsets while keeping controls in their first legend available', () => {
    const fields = '<input autocomplete="address-level2" value="Москва"><input autocomplete="address-line1" value="Тверская, 13"><input autocomplete="postal-code">';
    document.body.innerHTML = `<form><fieldset disabled><legend>${fields}</legend>${fields}</fieldset></form>`;
    const groups = discoverAddressGroups(document);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.postcode.closest('legend')).not.toBeNull();
    document.body.innerHTML = `<form><fieldset disabled>${fields}</fieldset></form>`;
    expect(discoverAddressGroups(document)).toHaveLength(0);
  });
  it('reads city and combined street/house without transmitting apartment or name', () => {
    document.body.innerHTML = `<form>
      <input autocomplete="name" value="PRIVATE NAME">
      <input autocomplete="address-level2" value="Москва">
      <input autocomplete="address-line1" value="Тверская улица, д. 13, кв. 9">
      <input autocomplete="address-line2" value="кв. 9">
      <input autocomplete="postal-code">
    </form>`;
    const group = discoverAddressGroups(document)[0];
    expect(group).toBeDefined();
    expect(group && readAddress(group)).toEqual({ country: 'ru', city: 'Москва', street: 'Тверская улица', house: '13' });
  });
  it('separates shipping and billing in the same form', () => {
    document.body.innerHTML = `<form>${['shipping', 'billing'].map((section, index) => `
      <input autocomplete="section-${section} ${section} address-level2" value="Город ${index}">
      <input autocomplete="section-${section} ${section} address-line1" value="Улица ${index}, д. 13">
      <input autocomplete="section-${section} ${section} postal-code">
    `).join('')}</form>`;
    const groups = discoverAddressGroups(document);
    expect(groups).toHaveLength(2);
    expect(groups.map(readAddress).map((address) => address?.city)).toEqual(['Город 0', 'Город 1']);
  });
  it('detects Russian labels and separate house fields', () => {
    document.body.innerHTML = `<fieldset><label>Город <input value="Москва"></label>
      <label>Улица <input value="Тверская улица"></label><label>Дом <input value="13"></label>
      <label>Почтовый индекс <input></label></fieldset>`;
    expect(readAddress(discoverAddressGroups(document)[0]!)).toMatchObject({ city: 'Москва', house: '13' });
  });
  it('fails closed for duplicate unsectioned postal fields', () => {
    document.body.innerHTML = `<form><input name="city" value="Москва"><input name="street" value="Тверская, 13">
      <input name="zip"><input name="postcode"></form>`;
    expect(discoverAddressGroups(document)).toHaveLength(0);
  });
  it('discovers an open shadow root without reading a closed one', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<input autocomplete="address-level2" value="Москва"><input autocomplete="street-address" value="Тверская, 13"><input autocomplete="postal-code">';
    expect(discoverAddressGroups(document)).toHaveLength(1);
  });
  it('dispatches input and change after native setter update', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    writePostcode(input, '012345');
    expect(input.value).toBe('012345');
    expect(events).toEqual(['input', 'change']);
  });
});
