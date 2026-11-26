// Küçük, elle yazılmış sahte DOM (npm paketi yok): web/lib/dom.js'teki öğe kurma, bildirim
// ve indirme yardımcılarını tarayıcısız sınamaya yetecek kadarı. Gerçek tarayıcıdaki davranış
// ayrıca scripts/arayuz-denetimi.js ile Chromium'da denetlenir.
//
// innerHTML bilerek desteklenmez: okunur ya da yazılırsa hata fırlatır. Böylece testler,
// yardımcıların metni hiçbir zaman HTML olarak yorumlamadığını da gösterir (XSS'e karşı).

export class FakeText {
  constructor(data) {
    this.nodeType = 3;
    this.data = String(data);
    this.parentNode = null;
  }
  get textContent() { return this.data; }
}

export class FakeElement {
  constructor(tag, namespaceURI = 'http://www.w3.org/1999/xhtml') {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.namespaceURI = namespaceURI;
    this.attributes = new Map();
    this.childNodes = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.parentNode = null;
    this.clicks = 0;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn(event); }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new FakeText(n) : n;
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((n) => n !== this);
    this.parentNode = null;
  }
  click() { this.clicks++; this.dispatch('click'); }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(value) { this.childNodes = [new FakeText(value)]; }
  get innerHTML() { throw new Error('innerHTML kullanılmamalı'); }
  set innerHTML(_) { throw new Error('innerHTML kullanılmamalı'); }
}

/**
 * Sahte belgeyi ve tarayıcı genellerini (document, matchMedia, navigator, URL.createObjectURL)
 * kurar; restore() eskisini geri koyar.
 * @param {{ mobile?: boolean, platform?: string, ids?: string[] }} [opts]
 */
export function installFakeDom({ mobile = false, platform = 'Linux x86_64', ids = [] } = {}) {
  const byId = new Map(ids.map((id) => [id, new FakeElement('div')]));
  const body = new FakeElement('body');
  const document = {
    body,
    activeElement: body,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (ns, tag) => new FakeElement(tag, ns),
    getElementById: (id) => byId.get(id) ?? null,
  };
  const urls = { created: [], revoked: [] };
  const saved = {
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    matchMedia: Object.getOwnPropertyDescriptor(globalThis, 'matchMedia'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('document', document);
  define('matchMedia', (query) => ({ matches: mobile && query.includes('max-width'), media: query }));
  define('navigator', { platform });
  URL.createObjectURL = (blob) => { const url = `blob:sahte/${urls.created.length}`; urls.created.push({ url, blob }); return url; };
  URL.revokeObjectURL = (url) => { urls.revoked.push(url); };
  return {
    document,
    byId,
    urls,
    restore() {
      for (const name of ['document', 'matchMedia', 'navigator']) {
        if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
        else delete globalThis[name];
      }
      URL.createObjectURL = saved.createObjectURL;
      URL.revokeObjectURL = saved.revokeObjectURL;
    },
  };
}
