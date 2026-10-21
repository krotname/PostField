// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { discoverAddressGroups, readAddress } from '../../src/adapters/forms.js';

beforeEach(() => { document.body.innerHTML = ''; });
const labels = ['Почтовый индекс', 'Индекс', 'Postal code', 'ZIP code', 'Postleitzahl', 'Code postal',
  'Código postal', 'Codice postale', 'Código de endereçamento postal', 'Kod pocztowy', 'Posta kodu', '邮政编码', '郵便番号', 'الرمز البريدي'];
it.each(labels)('recognizes the adjacent translated label %s despite an unrelated ID', (label) => {
  document.body.innerHTML = `<form><input autocomplete="address-level2" value="Город"><input autocomplete="address-line1" value="Тестовая, 15">
    <div><span>${label} : *</span><input id="field_721"></div></form>`;
  expect(discoverAddressGroups(document)).toHaveLength(1);
});
it('reads Geni-style neighbouring table cells and separates repeated event addresses', () => {
  const table = (city: string) => `<table><tr><td>Город:</td><td><input value="${city}"></td></tr>
    <tr><td>Адресная строка 1:</td><td><input name="event[street_address1]" value="Тестовая, 15"></td></tr>
    <tr><td>Адресная строка 2:</td><td><input name="event[street_address2]" value="Квартира 42"></td></tr>
    <tr><td>Адресная строка 3:</td><td><input name="event[street_address3]"></td></tr>
    <tr><td>Почтовый индекс:</td><td><input></td></tr><tr><td>Страна:</td><td><input value="Россия"></td></tr></table>`;
  document.body.innerHTML = `<form>${table('Город А')}${table('Город Б')}</form>`;
  expect(discoverAddressGroups(document).map(readAddress)).toEqual(['Город А', 'Город Б'].map((city) =>
    ({ country: 'ru', city, street: 'Тестовая', house: '15' })));
});
it('reads an AliExpress-style combined address and ignores CSS-hidden duplicates', () => {
  document.body.innerHTML = `<div role="dialog"><div><span>адрес или индекс</span><input value="Город, Тестовая улица, 15с2"></div>
    <div style="height:60px"><span>Индекс</span><input id="zip-visible"></div>
    <div style="display:none"><input name="postcode"></div></div>`;
  const groups = discoverAddressGroups(document);
  expect(groups).toHaveLength(1);
  expect(groups[0]?.postcode.id).toBe('zip-visible');
  expect(readAddress(groups[0]!)).toEqual({ country: 'ru', city: 'Город', street: 'Тестовая улица', house: '15с2' });
});
it('separates shipping and billing wrappers without autocomplete or fieldsets', () => {
  document.body.innerHTML = `<form>${['shipping', 'billing'].map((name) => `<section aria-label="${name}">
    <label>City<input value="${name}"></label><label>Street<input value="Тестовая, 15"></label><label>ZIP<input></label></section>`).join('')}</form>`;
  expect(discoverAddressGroups(document).map(readAddress).map((address) => address?.city)).toEqual(['shipping', 'billing']);
});
