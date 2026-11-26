// Kenar çubuğu: hazır paketler ve kategorili bileşen listesi (arama, sürükle-bırak, Enter ile ekleme).
import { state, catalog } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, h, isMobile } from '../lib/dom.js';
import { PACKAGES } from '../../src/workflows/packages.js';
import { normalizeQuery, paletteGroups, paletteItem } from '../lib/view-models.js';
import * as act from '../actions.js';

export function renderPackages() {
  const ul = $('paketler');
  ul.replaceChildren(...PACKAGES.map((p) => h('li', {},
    h('button', { type: 'button', 'aria-current': state.pkg === p.id ? 'true' : 'false', onclick: () => { act.loadPackage(p.id); if (isMobile()) openSide(false); }, title: p.summary },
      h('span', { class: 'hash', 'aria-hidden': 'true', text: '#' }), p.channel))));
}

export function renderPalette() {
  const q = normalizeQuery(/** @type {HTMLInputElement} */ ($('ara')).value);
  const box = $('palet');
  box.replaceChildren();
  let shown = 0;
  for (const { category: cat, items } of paletteGroups(catalog, q)) {
    shown += items.length;
    const det = h('details', { class: 'cat', open: true },
      h('summary', {}, cat, h('span', { class: 'count', text: String(items.length) })),
      ...items.map((c) => ({ c, v: paletteItem(c) })).map(({ c, v }) => h('button', {
        type: 'button', class: 'pal-item', draggable: 'true', 'data-type': c.type,
        title: v.title,
        'aria-label': v.ariaLabel,
        onclick: () => { act.addComponent(c.type); if (isMobile()) openSide(false); },
        ondragstart: (e) => {
          e.dataTransfer.setData('application/x-kba-type', c.type);
          e.dataTransfer.setData('text/plain', c.type);
          e.dataTransfer.effectAllowed = 'copy';
        },
      }, h('span', { class: 'ico', 'aria-hidden': 'true', text: c.icon ?? '•' }), h('span', { class: 't', text: c.title }), ' ', h('span', { class: 'b', text: v.badge }))));
    box.append(det);
  }
  $('ara-bos').hidden = shown > 0;
}

export function openSide(open) {
  $('side').classList.toggle('open', open);
  $('scrim').hidden = !open;
  $('side-ac').setAttribute('aria-expanded', String(open));
  if (open) $('ara').focus();
}

export function initPalette() {
  $('ara').addEventListener('input', renderPalette);
  $('side-ac').addEventListener('click', () => openSide(true));
  $('side-kapat').addEventListener('click', () => openSide(false));
  $('scrim').addEventListener('click', () => openSide(false));
  bus.on('yuklendi', renderPackages);
  renderPalette();
  renderPackages();
}
