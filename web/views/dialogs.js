// Kısayol penceresi: yerel <dialog> öğesi (odak pencerede kalır, Esc kapatır).
import { bus } from '../lib/bus.js';
import { $, h } from '../lib/dom.js';
import { SHORTCUTS } from '../lib/shortcuts.js';
import { shortcutKeys } from './props.js';

export function openShortcuts() {
  const dlg = /** @type {HTMLDialogElement} */ ($('kisayollar'));
  $('kisayol-listesi').replaceChildren(...SHORTCUTS.map((sc) => h('tr', {}, h('td', {}, ...shortcutKeys(sc)), h('td', { text: sc.what }))));
  if (!dlg.open) dlg.showModal();
}

export function initDialogs() {
  const dlg = /** @type {HTMLDialogElement} */ ($('kisayollar'));
  $('kisayol-kapat').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // arka plana tıklayınca kapanır
  $('kisayol-ac').addEventListener('click', openShortcuts);
  bus.on('kisayollar', openShortcuts);
}
