// Kenar çubuğu: hazır paketler ve kategorili bileşen listesi (arama, sürükle-bırak, Enter ile ekleme).
import { state, catalog } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, h, isMobile } from '../lib/dom.js';
import { PACKAGES } from '../../src/workflows/packages.js';
import * as act from '../actions.js';

export function renderPackages() {
  const ul = $('paketler');
  ul.replaceChildren(...PACKAGES.map((p) => h('li', {},
    h('button', { type: 'button', 'aria-current': state.pkg === p.id ? 'true' : 'false', onclick: () => { act.loadPackage(p.id); if (isMobile()) openSide(false); }, title: p.summary },
      h('span', { class: 'hash', 'aria-hidden': 'true', text: '#' }), p.channel))));
}

/** Arama metni bir bileşene uyuyor mu? (ad, açıklama, kategori, tür, uç türleri) */
export function matchesQuery(c, q) {
  if (!q) return true;
  return [c.title, c.subtitle, c.badge, c.category, c.help, c.type, ...c.inputs.map((p) => p.type), ...c.outputs.map((p) => p.type)]
    .filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(q);
}

export function renderPalette() {
  const q = /** @type {HTMLInputElement} */ ($('ara')).value.trim().toLocaleLowerCase('tr-TR');
  const box = $('palet');
  box.replaceChildren();
  let shown = 0;
  for (const cat of catalog.categories) {
    const items = [...catalog.values()].filter((c) => c.category === cat && matchesQuery(c, q));
    if (!items.length) continue;
    shown += items.length;
    const det = h('details', { class: 'cat', open: true },
      h('summary', {}, cat, h('span', { class: 'count', text: String(items.length) })),
      ...items.map((c) => h('button', {
        type: 'button', class: 'pal-item', draggable: 'true', 'data-type': c.type,
        title: `${c.help ?? ''}\nGiriş: ${c.inputs.map((p) => p.type).join(', ') || '—'} · Çıkış: ${c.outputs.map((p) => p.type).join(', ') || '—'}`,
        'aria-label': `${c.title} ekle (${c.category})`,
        onclick: () => { act.addComponent(c.type); if (isMobile()) openSide(false); },
        ondragstart: (e) => {
          e.dataTransfer.setData('application/x-kba-type', c.type);
          e.dataTransfer.setData('text/plain', c.type);
          e.dataTransfer.effectAllowed = 'copy';
        },
      }, h('span', { class: 'ico', 'aria-hidden': 'true', text: c.icon ?? '•' }), h('span', { class: 't', text: c.title }), h('span', { class: 'b', text: c.badge ?? c.subtitle ?? (c.outputs[0]?.type ?? '') }))));
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
