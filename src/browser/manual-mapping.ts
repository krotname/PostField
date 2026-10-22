import type { AddressField, AddressGroup } from '../adapters/forms.js';

/** Assignment is ephemeral: selectors and address values never leave this document. */
export function startManualMapping(document: Document, ready: (group: AddressGroup) => void): () => void {
  const panel = document.createElement('aside');
  panel.dataset.postfieldMapping = 'true';
  panel.dataset.postfieldUi = 'true';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Назначение полей PostField');
  panel.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;width:320px;max-width:calc(100vw - 32px);box-sizing:border-box;overflow:auto;padding:16px;background:#fff;color:#153a61;border:2px solid #153a61;border-radius:8px;font:14px/1.5 system-ui;box-shadow:0 4px 24px #0003';
  const viewport = document.defaultView?.visualViewport;
  function fitViewport(): void {
    panel.style.top = `${(viewport?.offsetTop ?? 0) + 16}px`;
    panel.style.maxHeight = `${Math.max(44, (viewport?.height ?? document.defaultView?.innerHeight ?? 600) - 32)}px`;
  }
  viewport?.addEventListener('resize', fitViewport);
  viewport?.addEventListener('scroll', fitViewport);
  fitViewport();
  const instruction = document.createElement('p');
  const skip = document.createElement('button');
  skip.type = 'button'; skip.textContent = 'Дом уже указан вместе с улицей';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.textContent = 'Отмена';
  for (const button of [skip, cancel]) button.style.cssText = 'min-height:44px;max-width:100%;white-space:normal;touch-action:manipulation;font:inherit';
  panel.append(instruction, skip, cancel);
  document.documentElement.append(panel);
  const roles = ['city', 'street', 'house', 'postcode'] as const;
  const names = ['города', 'улицы', 'дома', 'почтового индекса'];
  const selected: AddressField[] = [];
  const fields: AddressGroup['fields'] = {};
  let step = 0;
  let closed = false;
  function update(): void {
    instruction.textContent = `Россия: нажмите поле ${names[step]}. Значения полей не меняются.`;
    skip.hidden = step !== 2;
  }
  function close(): void {
    closed = true;
    document.removeEventListener('click', choose, true);
    document.removeEventListener('keydown', keydown, true);
    viewport?.removeEventListener('resize', fitViewport);
    viewport?.removeEventListener('scroll', fitViewport);
    panel.remove();
  }
  function keydown(event: KeyboardEvent): void { if (event.key === 'Escape') close(); }
  function choose(event: MouseEvent): void {
    if (closed) return;
    const element = event.composedPath()[0];
    if (!(element instanceof (document.defaultView?.Element ?? Element)) || !element.matches('input,select,textarea')
      || element.closest('[data-postfield-ui]')) return;
    const field = element as AddressField;
    if (field.disabled || field.hidden || field.closest('[hidden]') || ['password', 'hidden', 'file'].includes(field.getAttribute('type') ?? '')
      || ('readOnly' in field && field.readOnly) || selected.includes(field)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    selected.push(field);
    const role = roles[step];
    if (role === 'postcode') { close(); ready({ postcode: field, fields }); return; }
    if (role) fields[role] = field;
    step++; update();
  }
  skip.addEventListener('click', () => { if (step === 2) { step++; update(); } });
  cancel.addEventListener('click', close);
  document.addEventListener('click', choose, true);
  document.addEventListener('keydown', keydown, true);
  update();
  return close;
}
