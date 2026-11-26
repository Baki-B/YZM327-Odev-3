// Arayüzün DOM'a bağlı yardımcıları (web/lib/dom.js), elle yazılmış sahte bir DOM'la
// (tests/helpers/fake-dom.js) tarayıcısız sınanır.
import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../helpers/fake-dom.js';
import { $, h, s, toast, download, isTyping, isMobile, isMac } from '../../web/lib/dom.js';

let dom;
afterEach(() => dom?.restore());

describe('web/lib/dom.js: h() öğe kurma', () => {
  beforeEach(() => { dom = installFakeDom(); });

  test('sınıf, metin, biçem, öznitelik ve olay dinleyicisi', () => {
    let clicked = 0;
    const el = h('button', { class: 'btn primary', text: 'Çalıştır', style: { width: '40%' }, type: 'button', 'aria-label': 'çalıştır', onclick: () => clicked++ });
    assert.equal(el.tagName, 'BUTTON');
    assert.equal(el.className, 'btn primary');
    assert.equal(el.textContent, 'Çalıştır');
    assert.equal(el.style.width, '40%');
    assert.equal(el.getAttribute('type'), 'button');
    assert.equal(el.getAttribute('aria-label'), 'çalıştır');
    assert.equal(el.getAttribute('onclick'), null, 'olay bir öznitelik olarak yazılmaz');
    el.click();
    assert.equal(clicked, 1);
  });

  test('true boş öznitelik olur; false, null ve undefined yazılmaz', () => {
    const el = h('input', { disabled: true, hidden: false, title: null, value: undefined });
    assert.equal(el.getAttribute('disabled'), '');
    for (const k of ['hidden', 'title', 'value']) assert.equal(el.getAttribute(k), null, k);
  });

  test('çocuk dizileri bir düzey düzleşir; null, false ve undefined atlanır; sayılar metne çevrilir', () => {
    const el = h('p', {}, 'a', [h('b', { text: 'b' }), null, 'c', false], undefined, 7);
    assert.deepEqual(Array.from(el.childNodes, (n) => n.textContent), ['a', 'b', 'c', '7']);
    assert.equal(el.children.length, 1);
  });

  test('metin hiçbir zaman HTML olarak yorumlanmaz (innerHTML kullanılmaz)', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const el = h('td', { text: payload, title: payload });
    assert.equal(el.textContent, payload);
    assert.equal(el.children.length, 0, 'öğe oluşmadı');
    const kid = h('td', {}, payload);
    assert.equal(kid.childNodes[0].nodeType, 3, 'metin düğümü');
    assert.throws(() => el.innerHTML, /innerHTML kullanılmamalı/);
  });

  test('s() SVG ad alanında öğe kurar; $ kimlikle bulur', () => {
    const path = s('path', { d: 'M0 0 L1 1', class: 'wire' });
    assert.equal(path.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(path.getAttribute('d'), 'M0 0 L1 1');
    assert.equal(path.getAttribute('class'), 'wire');
    dom.restore();
    dom = installFakeDom({ ids: ['durum'] });
    assert.equal($('durum'), dom.byId.get('durum'));
    assert.equal($('yok'), null);
  });
});

describe('web/lib/dom.js: bildirim, indirme, ortam', () => {
  test('toast: metni yazar, görünür yapar; süre dolunca gizler (hata daha uzun kalır)', () => {
    dom = installFakeDom({ ids: ['toast'] });
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const t = dom.byId.get('toast');
      t.hidden = true;
      toast('Kaydedildi');
      assert.equal(t.textContent, 'Kaydedildi');
      assert.equal(t.className, 'toast');
      assert.equal(t.hidden, false);
      mock.timers.tick(3199);
      assert.equal(t.hidden, false);
      mock.timers.tick(1);
      assert.equal(t.hidden, true);
      toast('Bozuk dosya', 'err');
      assert.equal(t.className, 'toast err');
      mock.timers.tick(3200);
      assert.equal(t.hidden, false, 'hata iletisi 3,2 sn sonra hâlâ görünür');
      mock.timers.tick(3300);
      assert.equal(t.hidden, true);
      toast('birinci');
      mock.timers.tick(3000);
      toast('ikinci');
      mock.timers.tick(3000);
      assert.equal(t.hidden, false, 'yeni bildirim eski zamanlayıcıyı iptal eder');
    } finally {
      mock.timers.reset();
    }
  });

  test('download: geçici bağlantıya tıklar, belgeden kaldırır, adresi sonra bırakır', () => {
    dom = installFakeDom();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      let clickedWhileAttached = false;
      const realCreate = dom.document.createElement;
      dom.document.createElement = (tag) => {
        const el = realCreate(tag);
        if (tag === 'a') el.addEventListener('click', () => { clickedWhileAttached = el.parentNode === dom.document.body; });
        return el;
      };
      download('is-akisi.json', '{"a":1}');
      assert.equal(dom.urls.created.length, 1);
      assert.equal(dom.urls.created[0].blob.type, 'application/json');
      assert.ok(clickedWhileAttached, 'bağlantı belgedeyken tıklandı');
      assert.equal(dom.document.body.childNodes.length, 0, 'bağlantı kaldırıldı');
      assert.deepEqual(dom.urls.revoked, []);
      mock.timers.tick(1000);
      assert.deepEqual(dom.urls.revoked, [dom.urls.created[0].url]);
    } finally {
      mock.timers.reset();
    }
  });

  test('isTyping: odak yazı alanındaysa kısayollar tarayıcıya bırakılır', () => {
    dom = installFakeDom();
    /** @type {Array<[string, boolean]>} */
    const cases = [['input', true], ['textarea', true], ['select', true], ['button', false], ['div', false]];
    for (const [tag, typing] of cases) {
      dom.document.activeElement = dom.document.createElement(tag);
      assert.equal(isTyping(), typing, tag);
    }
    dom.document.activeElement = null;
    assert.equal(isTyping(), false);
  });

  test('isMobile ve isMac ortamı sorar', () => {
    dom = installFakeDom({ mobile: true, platform: 'MacIntel' });
    assert.equal(isMobile(), true);
    assert.equal(isMac(), true);
    dom.restore();
    dom = installFakeDom({ mobile: false, platform: 'Win32' });
    assert.equal(isMobile(), false);
    assert.equal(isMac(), false);
  });
});
