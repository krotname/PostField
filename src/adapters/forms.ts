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

function normalized(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, '$1 $2').normalize('NFKC').toLowerCase()
    .replace(/ё/gu, 'е').replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

const vocabulary: Record<Role, readonly string[]> = {
  postcode: ['почтовый индекс', 'индекс', 'postal code', 'postcode', 'zip', 'zip code', 'postleitzahl', 'plz', 'code postal',
    'código postal', 'codice postale', 'código de endereçamento postal', 'cep', 'kod pocztowy', 'posta kodu', '邮政编码', '邮编', '郵便番号', 'الرمز البريدي'],
  city: ['город', 'населенный пункт', 'city', 'town', 'stadt', 'ort', 'ville', 'ciudad', 'localidad', 'città', 'cidade', 'miasto', 'şehir', 'ilçe', '城市', '市区町村', '市町村', 'المدينة'],
  house: ['дом', 'номер дома', 'house', 'building', 'housenumber', 'house number', 'hausnummer', 'numéro de maison', 'número de casa', 'numero civico', 'número', 'numer domu', 'bina no', '门牌号', '番地', 'رقم المبنى'],
  country: ['страна', 'country', 'land', 'pays', 'país', 'paese', 'kraj', 'ülke', '国家', '国', 'الدولة'],
  region: ['регион', 'область', 'region', 'state', 'bundesland', 'région', 'provincia', 'regione', 'estado', 'województwo', 'il', '省份', '都道府県', 'المنطقة'],
  street: ['улица', 'адресная строка 1', 'адрес', 'street', 'address', 'address line 1', 'straße', 'strasse', 'adresse', 'rue', 'dirección', 'calle', 'indirizzo', 'via', 'endereço', 'rua', 'ulica', 'adres', 'sokak', 'cadde', '地址', '街道', '住所', 'العنوان', 'الشارع'],
};
const words = Object.fromEntries(Object.entries(vocabulary).map(([role, values]) => [role, values.map(normalized)])) as Record<Role, string[]>;

function visible(field: Element): boolean {
  for (let element: Element | null = field; element; element = element.parentElement) {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
  }
  return true;
}

function nearbyLabels(field: AddressField): string[] {
  const sources: string[] = [];
  const cell = field.closest('td,th');
  if (cell?.previousElementSibling) sources.push(cell.previousElementSibling.textContent ?? '');
  const previous = field.previousElementSibling;
  if (previous && !previous.querySelector('input,select,textarea') && previous.matches('label,span,strong,b,div')) sources.push(previous.textContent ?? '');
  const parent = field.parentElement;
  if (parent && parent.querySelectorAll('input,select,textarea').length === 1) {
    const clone = parent.cloneNode(true) as Element;
    for (const child of clone.querySelectorAll('input,select,textarea,button,[data-postfield-ui]')) child.remove();
    sources.push(clone.textContent ?? '');
  }
  return sources;
}

function roleOf(field: AddressField): Role | null {
  const autocomplete = tokens(field);
  // Secondary address lines may contain apartment details; never send them for lookup.
  if (autocomplete.some((token) => token === 'address-line2' || token === 'address-line3')) return null;
  const known: Record<string, Role> = { 'postal-code': 'postcode', 'address-level2': 'city', 'address-level1': 'region',
    'address-line1': 'street', 'street-address': 'street', country: 'country', 'country-name': 'country' };
  for (const token of autocomplete) if (known[token]) return known[token];
  const labels = [...(field.labels ?? [])].map((label) => label.textContent ?? '').join(' ');
  const ariaLabels = (field.getAttribute('aria-labelledby') ?? '').split(/\s+/u)
    .map((id) => field.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
  const sources = [labels, ariaLabels, field.getAttribute('aria-label'), field.getAttribute('placeholder'),
    ...nearbyLabels(field), field.name, field.id].filter((value): value is string => !!value).map(normalized);
  if (sources.some((metadata) => /(?:^| )(?:street address|address(?: line)?|адресная строка)\s*[23](?: |$)/u.test(metadata))) return null;
  for (const metadata of sources) {
    // Combined address search is not the separate postcode input beside it.
    if (/адрес или индекс|address or (?:postal|zip)|адрес или почтовый индекс/u.test(metadata)) return 'street';
    for (const role of ['postcode', 'city', 'house', 'country', 'region', 'street'] as const) {
      if (words[role].some((word) => /[\u3000-\u9fff\u0600-\u06ff]/u.test(word)
        ? metadata === word : ` ${metadata} `.includes(` ${word} `))) return role;
    }
  }
  return null;
}

export function discoverAddressGroups(root: Document | ShadowRoot | Element): AddressGroup[] {
  const result: AddressGroup[] = [];
  for (const scope of rootsUnder(root)) {
    const entries: { role: Role; field: AddressField; section: string }[] = [];
    for (const field of scope.querySelectorAll<AddressField>('input, select, textarea')) {
      if (field.matches(':disabled') || field.hidden || field.closest('[hidden]') || field.getAttribute('type') === 'hidden'
        || field.getAttribute('type') === 'password' || field.closest('[data-postfield-ui]') || !visible(field)) continue;
      const role = roleOf(field);
      if (!role || (role === 'postcode' && 'readOnly' in field && field.readOnly)) continue;
      const section = tokens(field).filter((token) => token.startsWith('section-') || token === 'shipping' || token === 'billing').join(' ');
      entries.push({ role, field, section });
    }
    for (const entry of entries.filter(({ role }) => role === 'postcode')) {
      const postcode = entry.field;
      const boundary = postcode.closest('fieldset,[data-address-group],form,[role="dialog"]') ?? scope;
      let container: Element | Document | ShadowRoot | null = postcode.parentElement ?? scope;
      let bucket: typeof entries = [];
      while (container) {
        const current = entries.filter((item) => container!.contains(item.field) && item.section === entry.section);
        if (current.filter((item) => item.role === 'postcode').length !== 1) break;
        if (current.some((item) => item.role === 'street')) { bucket = current; break; }
        if (container === boundary || container === scope) break;
        container = container.parentElement ?? (container.getRootNode() === scope ? scope : null);
      }
      if (!bucket.length) continue;
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
    russland: 'ru', russie: 'ru', rusia: 'ru', rússia: 'ru', rosja: 'ru', rusya: 'ru', 俄罗斯: 'ru', ロシア: 'ru', روسيا: 'ru',
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
