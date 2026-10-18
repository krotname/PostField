import { discoverAddressGroups, readAddress, writePostcode } from '../adapters/forms.js';
import type { AddressField, AddressGroup } from '../adapters/forms.js';
import { FormSession } from '../application/form-session.js';
import type { FormResult } from '../application/form-session.js';
import type { Address, LookupResult } from '../core/address.js';

interface UiBudget { remaining: number }
interface Binding { group: AddressGroup; session: FormSession; ui: HTMLElement; manual: boolean; budget: UiBudget; timer?: ReturnType<typeof setTimeout>; automaticRequest?: symbol }
const automaticUiRestorations = 3;
// Shared across replacement bindings, including replacement forms. Keep no DOM history.
const automaticUiAdmissions = 32;
const labels: Record<string, string> = {
  confirmed: 'Индекс заполнен', not_found: 'Индекс для этого дома не найден', incomplete: 'Укажите город, улицу и дом',
  unsupported: 'Сейчас поддерживается Россия', preserved: 'Сохранён ваш индекс', ambiguous: 'Уточните адрес и выберите результат',
  missing_key: 'Добавьте ключ Geoapify в настройках', unauthorized: 'Проверьте ключ Geoapify', quota: 'Лимит Geoapify исчерпан',
  timeout: 'Geoapify не ответил вовремя', offline: 'Нет связи с Geoapify', invalid_response: 'Ответ Geoapify не распознан',
};

export class PageController {
  private readonly bindings = new Map<AddressField, Binding>();
  private readonly observer: MutationObserver;
  private automatic = false;
  private writing = false;
  private stopped = false;
  private scanPending = false;
  private uiAdmissionsLeft = automaticUiAdmissions;
  private uiBudgets = new WeakMap<Node, UiBudget>();

  constructor(private readonly document: Document, private readonly resolve: (address: Address) => Promise<LookupResult>) {
    const Observer = document.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new Observer(() => {
      if (this.scanPending || this.stopped) return;
      this.scanPending = true;
      queueMicrotask(() => { this.scanPending = false; if (!this.stopped) this.scan(); });
    });
    this.observer.observe(document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['autocomplete', 'name', 'id', 'disabled', 'readonly', 'value'] });
    document.addEventListener('input', this.changed, true);
    document.addEventListener('change', this.changed, true);
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

  private scan(explicit = false): void {
    if (this.stopped) return;
    if (explicit) {
      this.uiAdmissionsLeft = automaticUiAdmissions;
      this.uiBudgets = new WeakMap();
    }
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
      this.bind(group, false, explicit);
    }
    // Manual groups need not be discoverable. Restore the same UI/session so choices survive.
    for (const binding of this.bindings.values()) {
      if (explicit) binding.budget = this.budgetFor(binding.group);
      if (!binding.ui.isConnected && (explicit || binding.budget.remaining > 0)) {
        if (!explicit) binding.budget.remaining--;
        binding.group.postcode.insertAdjacentElement('afterend', binding.ui);
      }
    }
    // Drop observer registrations on detached shadow roots along with obsolete bindings.
    this.observer.disconnect();
    this.observer.observe(this.document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['autocomplete', 'name', 'id', 'disabled', 'readonly', 'value'] });
    for (const binding of this.bindings.values()) this.observeRoot(binding.group);
  }

  assign(group: AddressGroup): void {
    if (this.stopped) return;
    const existing = this.bindings.get(group.postcode);
    if (existing) { existing.session.manualPostcodeChanged(); existing.group = group; existing.manual = true; }
    else this.bind(group, true, true);
  }

  private uiScope(group: AddressGroup): Node {
    return group.postcode.closest('fieldset, [data-address-group], form') ?? group.postcode.getRootNode();
  }

  private budgetFor(group: AddressGroup): UiBudget {
    const scope = this.uiScope(group);
    let budget = this.uiBudgets.get(scope);
    if (!budget) {
      budget = { remaining: automaticUiRestorations };
      this.uiBudgets.set(scope, budget);
    }
    return budget;
  }

  private observeRoot(group: AddressGroup): void {
    const root = group.postcode.getRootNode();
    if (root !== this.document && group.postcode.isConnected) this.observer.observe(root, { childList: true, subtree: true });
  }

  private bind(group: AddressGroup, manual: boolean, explicit: boolean): void {
      const ui = this.document.createElement('div');
      ui.dataset.postfieldUi = 'true';
      ui.setAttribute('role', 'status');
      ui.setAttribute('aria-live', 'polite');
      ui.style.cssText = 'font:13px/1.4 system-ui,sans-serif;color:#153a61;margin:4px 0;max-width:460px';
      const previousBudget = this.uiBudgets.get(this.uiScope(group));
      const budget = this.budgetFor(group);
      const admitted = explicit || (this.uiAdmissionsLeft > 0 && (!previousBudget || budget.remaining > 0));
      if (admitted) {
        if (!explicit) {
          this.uiAdmissionsLeft--;
          if (previousBudget) budget.remaining--;
        }
        group.postcode.insertAdjacentElement('afterend', ui);
      }
      const binding: Binding = { group, ui, manual, budget: admitted ? budget : { remaining: 0 }, session: new FormSession(this.resolve, () => readAddress(binding.group),
        () => binding.group.postcode.value, (value) => {
          this.writing = true;
          try { writePostcode(binding.group.postcode, value); } finally { this.writing = false; }
        }) };
      this.bindings.set(group.postcode, binding);
      this.observeRoot(group);
      if (this.automatic) this.schedule(binding);
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
    this.scan(true);
    await Promise.all([...this.bindings.values()].map((binding) => {
      if (binding.timer) clearTimeout(binding.timer);
      delete binding.timer;
      return this.lookup(binding);
    }));
    return this.bindings.size;
  }

  stop(): void {
    this.stopped = true;
    this.observer.disconnect();
    this.document.removeEventListener('input', this.changed, true);
    this.document.removeEventListener('change', this.changed, true);
    for (const binding of this.bindings.values()) {
      if (binding.timer) clearTimeout(binding.timer);
      binding.session.manualPostcodeChanged();
      binding.ui.remove();
    }
    this.bindings.clear();
    this.uiBudgets = new WeakMap();
  }
}
