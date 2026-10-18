import type { Address, CountryCode } from '../core/address.js';

export type AddressField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Role = 'postcode' | 'city' | 'street' | 'house' | 'country' | 'region';
export interface AddressGroup {
  readonly postcode: AddressField;
  readonly fields: Partial<Record<Exclude<Role, 'postcode'>, AddressField>>;
}

function rootsUnder(root: Document | ShadowRoot | Element): (Document | ShadowRoot | Element)[] {
  const roots: (Document | ShadowRoot | Element)[] = [root];
  for (const element of root.querySelectorAll('*')) if (element.shadowRoot) roots.push(...rootsUnder(element.shadowRoot));
  return roots;
}

function tokens(field: AddressField): string[] { return (field.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/u); }

function roleOf(field: AddressField): Role | null {
  const autocomplete = tokens(field);
  const known: Record<string, Role> = { 'postal-code': 'postcode', 'address-level2': 'city', 'address-level1': 'region',
    'address-line1': 'street', 'street-address': 'street', country: 'country', 'country-name': 'country' };
  for (const token of autocomplete) if (known[token]) return known[token];
  // address-line2 may contain private apartment details; never use it as a lookup component.
  if (autocomplete.includes('address-line2')) return null;
  const labels = [...(field.labels ?? [])].map((label) => label.textContent ?? '').join(' ');
  const ariaLabels = (field.getAttribute('aria-labelledby') ?? '').split(/\s+/u)
    .map((id) => field.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
  const metadata = [field.name, field.id, field.getAttribute('aria-label'), field.getAttribute('placeholder'), labels, ariaLabels]
    .join(' ').toLowerCase().replace(/[_-]/gu, ' ');
  if (/почтовый\s*индекс|\b(?:postal\s*code|postcode|zip(?:\s*code)?)\b|^\s*индекс\s*$/u.test(metadata)) return 'postcode';
  if (/\b(?:city|town)\b|город|насел[её]нный\s*пункт/u.test(metadata)) return 'city';
  if (/\b(?:house|building|housenumber)\b|(?:^|\s)дом(?:\s|$)|номер\s*дома/u.test(metadata)) return 'house';
  if (/\b(?:street|address\s*line\s*1)\b|улица|адрес/u.test(metadata)) return 'street';
  if (/\b(?:country)\b|страна/u.test(metadata)) return 'country';
  if (/\b(?:region|state)\b|регион|область/u.test(metadata)) return 'region';
  return null;
}

export function discoverAddressGroups(root: Document | ShadowRoot | Element): AddressGroup[] {
  const result: AddressGroup[] = [];
  for (const scope of rootsUnder(root)) {
    const buckets = new Map<Element | Document | ShadowRoot, Map<string, { role: Role; field: AddressField }[]>>();
    for (const field of scope.querySelectorAll<AddressField>('input, select, textarea')) {
      if (field.matches(':disabled') || field.hidden || field.closest('[hidden]') || field.getAttribute('type') === 'hidden'
        || field.getAttribute('type') === 'password' || field.closest('[data-postfield-ui]')) continue;
      const role = roleOf(field);
      if (!role || (role === 'postcode' && 'readOnly' in field && field.readOnly)) continue;
      const container = field.closest('fieldset, [data-address-group], form') ?? scope;
      const section = tokens(field).filter((token) => token.startsWith('section-') || token === 'shipping' || token === 'billing').join(' ');
      let sections = buckets.get(container);
      if (!sections) { sections = new Map(); buckets.set(container, sections); }
      const fields = sections.get(section) ?? [];
      fields.push({ role, field });
      sections.set(section, fields);
    }
    for (const sections of buckets.values()) for (const bucket of sections.values()) {
      const postcodes = bucket.filter(({ role }) => role === 'postcode');
      const postcode = postcodes[0]?.field;
      if (postcodes.length !== 1 || !postcode) continue;
      const fields: AddressGroup['fields'] = {};
      for (const role of ['city', 'street', 'house', 'country', 'region'] as const) {
        const matches = bucket.filter((entry) => entry.role === role);
        if (matches.length === 1 && matches[0]) fields[role] = matches[0].field;
      }
      result.push({ postcode, fields });
    }
  }
  return result;
}

function countryFrom(value: string): CountryCode | null {
  const countries: Record<string, CountryCode> = { ru: 'ru', rus: 'ru', россия: 'ru', russia: 'ru', 'russian federation': 'ru', '643': 'ru',
    us: 'us', usa: 'us', 'united states': 'us', сша: 'us', ca: 'ca', canada: 'ca', канада: 'ca',
    gb: 'gb', uk: 'gb', 'united kingdom': 'gb', великобритания: 'gb', de: 'de', germany: 'de', deutschland: 'de', германия: 'de' };
  return countries[value.trim().toLowerCase()] ?? null;
}

export function readAddress(group: AddressGroup): Address | null {
  const value = (role: Exclude<Role, 'postcode'>): string => group.fields[role]?.value.trim().slice(0, 180) ?? '';
  const country = group.fields.country ? countryFrom(value('country')) : 'ru';
  if (!country) return null;
  let city = value('city');
  let street = value('street');
  let house = value('house');
  if (!house && street) {
    const withoutApartment = street.split(/(?:,?\s+(?:кв\.?|квартира|apt\.?|apartment|flat)\s*)/iu)[0] ?? '';
    const match = /^(.*?)(?:,\s*|\s+)(?:д(?:ом)?\.?\s*)?(\d+[\p{L}\d/\-]*(?:\s*(?:к\.?|корпус|с\.?|стр\.?|строение)\s*[\p{L}\d/\-]+)*)\s*$/iu.exec(withoutApartment);
    if (match?.[1] && match[2]) { street = match[1].trim().replace(/,$/u, ''); house = match[2].trim(); }
    if (!city && street.includes(',')) {
      const parts = street.split(',').map((part) => part.trim());
      if (parts.length === 2 && parts[0] && parts[1]) { city = parts[0].replace(/^г(?:ород)?\.?\s+/iu, ''); street = parts[1]; }
    }
  }
  const region = value('region');
  return { country, city, street, house, ...(region ? { region } : {}) };
}

export function writePostcode(field: AddressField, value: string): void {
  const prototype = Object.getPrototypeOf(field) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(field, value); else field.value = value;
  const EventClass = field.ownerDocument.defaultView?.Event ?? Event;
  field.dispatchEvent(new EventClass('input', { bubbles: true, composed: true }));
  field.dispatchEvent(new EventClass('change', { bubbles: true, composed: true }));
}
