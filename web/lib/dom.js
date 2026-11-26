// DOM yardımcıları: öğe kurma, bildirim balonu, dosya indirme.
// Metinler her zaman textContent ile yazılır (HTML olarak yorumlanmaz): paylaşılan bir iş
// akışındaki kutu adı ya da dosya içeriği sayfaya kod sokamaz.

export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Öğe kurar. attrs: class, text (textContent), on<olay> (dinleyici), style (nesne), diğerleri öznitelik.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} kids
 */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  return append(el, ...kids);
}

/**
 * Çocukları ekler; null, undefined ve false atlanır (DOM'un kendi append'i bunları "null" yazısına
 * çevirir), diziler bir düzey açılır, düz değerler metin olur (hiçbir zaman HTML değil).
 * @template {Element} E
 * @param {E} el
 * @param {...any} kids
 * @returns {E}
 */
export function append(el, ...kids) {
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

const svgNS = 'http://www.w3.org/2000/svg';
/** SVG öğesi kurar. */
export function s(tag, attrs = {}) {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

let toastTimer = null;
/** Kısa bildirim (ekran okuyucular için role="alert"). */
export function toast(msg, kind = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'err' ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), kind === 'err' ? 6500 : 3200);
}

/** Metni dosya olarak indirir. */
export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Klavye odağı bir yazı alanında mı? (Kısayollar o zaman tarayıcının kendi davranışına bırakılır.) */
export const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');

export const isMobile = () => matchMedia('(max-width: 760px)').matches;
export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform ?? '');
