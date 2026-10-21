import { discoverAddressGroups, readAddress, writePostcode } from '../adapters/forms.js';
import type { AddressField, AddressGroup } from '../adapters/forms.js';
import { FormSession } from '../application/form-session.js';
import type { FormResult } from '../application/form-session.js';
import type { Address, LookupResult } from '../core/address.js';

interface Binding { group: AddressGroup; session: FormSession; ui: HTMLElement; manual: boolean; timer?: ReturnType<typeof setTimeout>; automaticRequest?: symbol }
// Yield to host timers even when every UI insertion triggers another rerender.
const scanDelay = 25;
const labels: Record<string, string> = {
  confirmed: 'Индекс заполнен', not_found: 'Индекс для этого дома не найден', incomplete: 'Укажите город, улицу и дом',
  unsupported: 'Сейчас поддерживается Россия', preserved: 'Сохранён ваш индекс', ambiguous: 'Уточните адрес и выберите результат',
  missing_key: 'Добавьте ключ Geoapify в настройках', unauthorized: 'Проверьте ключ Geoapify', quota: 'Лимит Geoapify исчерпан',
  timeout: 'Geoapify не ответил вовремя', offline: 'Нет связи с Geoapify', invalid_response: 'Ответ Geoapify не распознан',
  http: 'Ошибка HTTP Geoapify', service: 'Нет связи со службой PostField. Обновите страницу', storage: 'Не удалось прочитать сохранённый ключ',
};

export class PageController {
  private readonly bindings = new Map<AddressField, Binding>();
  private readonly observer: MutationObserver;
  private automatic = false;
  private writing = false;
  private stopped = false;
  private scanTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly document: Document, private readonly resolve: (address: Address) => Promise<LookupResult>) {
    const Observer = document.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new Observer(() => this.scheduleScan());
    this.observer.observe(document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['autocomplete', 'name', 'id', 'disabled', 'readonly', 'value', 'hidden', 'aria-hidden', 'aria-label', 'aria-labelledby', 'style', 'class'] });
    document.addEventListener('input', this.changed, true);
    document.addEventListener('change', this.changed, true);
    this.scan();
  }

  setAutomatic(enabled: boolean): void {
    if (this.stopped) return;
    if (this.automatic === enabled) return;
    this.automatic = enabled;
    if (enabled) {
      this.scan();
      for (const binding of this.bindings.values()) if (!binding.timer) this.schedule(binding);
    } else {
      for (const binding of this.bindings.values()) {
        if (binding.timer) clearTimeout(binding.timer);
        delete binding.timer;
        if (binding.automaticRequest) binding.session.cancelLookup();
        delete binding.automaticRequest;
      }
    }
  }

  private changed = (event: Event): void => {
    if (this.writing || this.stopped) return;
    const target = event.composedPath()[0];
    for (const binding of this.bindings.values()) {
      if (target === binding.group.postcode) {
        binding.session.manualPostcodeChanged();
        binding.ui.replaceChildren();
      } else if (Object.values(binding.group.fields).includes(target as AddressField)) {
        binding.session.addressChanged();
        binding.ui.replaceChildren();
        if (this.automatic) this.schedule(binding);
      }
    }
  };

  private scheduleScan(): void {
    if (this.stopped || this.scanTimer !== undefined) return;
    this.scanTimer = setTimeout(() => {
      delete this.scanTimer;
      this.scan();
    }, scanDelay);
  }

  private scan(): void {
    if (this.stopped) return;
    const groups = discoverAddressGroups(this.document);
    const discovered = new Map(groups.map((group) => [group.postcode, group]));
    for (const [field, binding] of this.bindings) {
      if (field.isConnected && (binding.manual
        ? Object.values(binding.group.fields).every((input) => input.isConnected) : discovered.has(field))) continue;
      if (binding.timer) clearTimeout(binding.timer);
      binding.session.manualPostcodeChanged();
      binding.ui.remove();
      this.bindings.delete(field);
    }
    for (const group of groups) {
      const existing = this.bindings.get(group.postcode);
      if (existing) {
        if (!existing.manual) {
          const changed = Object.keys({ ...existing.group.fields, ...group.fields })
            .some((key) => existing.group.fields[key as keyof typeof group.fields] !== group.fields[key as keyof typeof group.fields]);
          existing.group = group;
          if (changed) {
            if (existing.timer) clearTimeout(existing.timer);
            existing.session.addressChanged();
            existing.ui.replaceChildren();
            if (this.automatic) this.schedule(existing);
          }
        }
        continue;
      }
      this.bind(group, false);
    }
    // Manual groups need not be discoverable. Restore the same UI/session so choices survive.
    for (const binding of this.bindings.values()) {
      if (!binding.ui.isConnected) {
        this.placeStatus(binding.group, binding.ui);
      }
    }
    // Drop observer registrations on detached shadow roots along with obsolete bindings.
    // Synchronous input/change handlers can mutate the host after the groups snapshot.
    // Preserve those records (and our own writes) as a coalesced follow-up pass.
    if (this.observer.takeRecords().length) this.scheduleScan();
    this.observer.disconnect();
    this.observer.observe(this.document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['autocomplete', 'name', 'id', 'disabled', 'readonly', 'value', 'hidden', 'aria-hidden', 'aria-label', 'aria-labelledby', 'style', 'class'] });
    for (const binding of this.bindings.values()) this.observeRoot(binding.group);
  }

  assign(group: AddressGroup): void {
    if (this.stopped) return;
    const existing = this.bindings.get(group.postcode);
    if (existing) { existing.session.manualPostcodeChanged(); existing.group = group; existing.manual = true; }
    else this.bind(group, true);
  }

  private observeRoot(group: AddressGroup): void {
    const root = group.postcode.getRootNode();
    if (root !== this.document && group.postcode.isConnected) this.observer.observe(root, { childList: true, subtree: true });
  }

  private bind(group: AddressGroup, manual: boolean): void {
      const ui = this.document.createElement('div');
      ui.dataset.postfieldUi = 'true';
      ui.setAttribute('role', 'status');
      ui.setAttribute('aria-live', 'polite');
      ui.style.cssText = 'display:block;position:static;clear:both;flex:0 0 auto;grid-column:1 / -1;width:100%;box-sizing:border-box;font:13px/1.4 system-ui,sans-serif;color:#153a61;margin:4px 0;max-width:460px;max-height:180px;overflow:auto;white-space:normal';
      this.placeStatus(group, ui);
      const binding: Binding = { group, ui, manual, session: new FormSession(this.resolve, () => readAddress(binding.group),
        () => binding.group.postcode.value, (value) => {
          this.writing = true;
          try { writePostcode(binding.group.postcode, value); } finally { this.writing = false; }
        }) };
      this.bindings.set(group.postcode, binding);
      this.observeRoot(group);
      if (this.automatic) this.schedule(binding);
  }

  private placeStatus(group: AddressGroup, ui: HTMLElement): void {
    const table = group.postcode.closest('table');
    if (table) { table.insertAdjacentElement('afterend', ui); return; }
    let wrapper: Element = group.postcode;
    while (wrapper.parentElement && !wrapper.parentElement.matches('form,fieldset,[role="dialog"],body')
      && wrapper.parentElement.querySelectorAll('input,select,textarea').length === 1) wrapper = wrapper.parentElement;
    const row = wrapper.parentElement;
    const style = row && this.document.defaultView?.getComputedStyle(row);
    if (row && !row.matches('form,fieldset,[role="dialog"],body') && style?.display.includes('flex')
      && (!style.flexDirection || style.flexDirection.startsWith('row'))) wrapper = row;
    wrapper.insertAdjacentElement('afterend', ui);
  }

  private schedule(binding: Binding): void {
    if (binding.timer) clearTimeout(binding.timer);
    binding.timer = setTimeout(() => {
      delete binding.timer;
      if (this.automatic) void this.lookup(binding, true);
    }, 900);
  }

  private async lookup(binding: Binding, automatic = false): Promise<void> {
    const request = automatic ? Symbol() : undefined;
    if (request) binding.automaticRequest = request;
    else delete binding.automaticRequest;
    try {
      const result = await binding.session.lookup();
      if (this.stopped || result.kind === 'stale') return;
      this.render(binding, result);
    } finally {
      if (binding.automaticRequest === request) delete binding.automaticRequest;
    }
  }

  private render(binding: Binding, result: FormResult): void {
    binding.ui.replaceChildren();
    binding.ui.textContent = labels[result.kind === 'error' ? result.code : result.kind] ?? '';
    if (result.kind === 'error') {
      const retry = this.document.createElement('button');
      retry.type = 'button'; retry.dataset.postfieldRetry = 'true'; retry.textContent = 'Повторить';
      retry.style.cssText = 'margin:4px 8px;padding:4px 8px;cursor:pointer';
      retry.addEventListener('click', () => { retry.disabled = true; void this.lookup(binding); });
      binding.ui.append(retry);
    }
    if (result.kind !== 'ambiguous') return;
    if (result.candidates.some((candidate) => candidate.requiresPostcodeConfirmation)) {
      binding.ui.textContent = 'Точность индекса не подтверждена. Сверьте индекс перед выбором.';
    }
    for (const candidate of result.candidates) {
      const button = this.document.createElement('button');
      button.type = 'button';
      button.dataset.postfieldChoice = 'true';
      button.textContent = `${candidate.formatted || `${candidate.city}, ${candidate.street}, ${candidate.house}`} — ${candidate.postcode}`;
      button.style.cssText = 'display:block;text-align:left;margin:6px 0;padding:7px;border:1px solid #577898;border-radius:5px;background:#fff;color:#153a61;cursor:pointer';
      button.addEventListener('click', () => {
        if (binding.session.choose(candidate)) binding.ui.textContent = 'Выбранный индекс заполнен';
      });
      binding.ui.append(button);
    }
  }

  async fill(): Promise<number> {
    this.scan();
    await Promise.all([...this.bindings.values()].map((binding) => {
      if (binding.timer) clearTimeout(binding.timer);
      delete binding.timer;
      return this.lookup(binding);
    }));
    return this.bindings.size;
  }

  stop(): void {
    this.stopped = true;
    if (this.scanTimer !== undefined) clearTimeout(this.scanTimer);
    delete this.scanTimer;
    this.observer.disconnect();
    this.document.removeEventListener('input', this.changed, true);
    this.document.removeEventListener('change', this.changed, true);
    for (const binding of this.bindings.values()) {
      if (binding.timer) clearTimeout(binding.timer);
      binding.session.manualPostcodeChanged();
      binding.ui.remove();
    }
    this.bindings.clear();
  }
}
