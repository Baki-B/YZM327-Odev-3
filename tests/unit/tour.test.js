// Sunum modu (web/lib/tour.js): adımlar arasında gezinme, açılır kutunun ekrandan taşmadan
// yerleştirilmesi, aydınlatılan çerçevenin kırpılması, ?sunum adresi ve adım verisinin tutarlılığı
// (hedef kimlikleri sayfada var, eylemlerin yazısı var). Görünüm gerçek tarayıcıda
// scripts/arayuz-denetimi.js ile sınanır.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUR_STEPS, TOUR_ACTIONS, TOUR_REFS, createTour, placePopover, holeRect, tourRequested } from '../../web/lib/tour.js';

const HTML = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
const VIEW = readFileSync(new URL('../../web/views/tour.js', import.meta.url), 'utf8');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('sunum modu', () => {
  test('gezinme: ilk ve son adımda durur, ilerleme yazısı', () => {
    const t = createTour(TOUR_STEPS);
    assert.equal(t.index, 0);
    assert.ok(t.isFirst && !t.isLast);
    assert.equal(t.prev().id, TOUR_STEPS[0].id, 'ilk adımdan geri gidilmez');
    assert.equal(t.progress, `1 / ${TOUR_STEPS.length}`);
    assert.equal(t.count, TOUR_STEPS.length);
    for (let i = 1; i < TOUR_STEPS.length; i++) assert.equal(t.next().id, TOUR_STEPS[i].id);
    assert.ok(t.isLast);
    assert.equal(t.next().id, TOUR_STEPS.at(-1).id, 'son adımdan ileri gidilmez');
    assert.equal(t.go(-5).id, TOUR_STEPS[0].id);
    assert.equal(t.go(999).id, TOUR_STEPS.at(-1).id);
    assert.equal(t.go(Number.NaN).id, TOUR_STEPS[0].id);
    assert.equal(t.go(2.7).id, TOUR_STEPS[2].id);
    assert.throws(() => createTour([]), /adım yok/);
  });

  test('adım verisi: başlık, metin, benzersiz kimlik; eylem ve hedefler tanımlı', () => {
    const ids = new Set();
    for (const s of TOUR_STEPS) {
      assert.ok(s.id && !ids.has(s.id), `kimlik: ${s.id}`);
      ids.add(s.id);
      assert.ok(s.title.length > 3 && s.text.length > 20, s.id);
      if (s.action) {
        assert.ok(TOUR_ACTIONS[s.action], `${s.id}: eylem yazısı`);
        assert.match(VIEW, new RegExp(`['"]?${s.action}['"]?: \\(\\) =>`), `${s.id}: eylem görünümde tanımlı`);
      }
      if (s.target?.startsWith('@')) {
        assert.ok(TOUR_REFS.includes(s.target), `${s.id}: ${s.target}`);
        assert.ok(VIEW.includes(`'${s.target}'`), `${s.id}: ${s.target} görünümde bulunuyor`);
      }
      for (const m of (s.target ?? '').matchAll(/#([\w-]+)/g)) assert.ok(HTML.includes(`id="${m[1]}"`), `${s.id}: #${m[1]} sayfada var`);
      for (const m of (s.target ?? '').matchAll(/\.([\w-]+)/g)) assert.ok(HTML.includes(m[1]) || VIEW.includes(m[1]) || m[1] === 'pal-item', `${s.id}: .${m[1]}`);
    }
    assert.ok(TOUR_STEPS.some((s) => s.target === '#paketler') && TOUR_STEPS.some((s) => /input\[type="file"\]/.test(s.target ?? '')), 'paket açma ve dosya seçme adımları var');
    assert.ok(HTML.includes('id="sunum-ac"'), 'üst çubukta "Sunum modu" düğmesi');
  });

  test('yerleşim: hedefin altı, sonra üstü, sağı, solu; sığmazsa orta', () => {
    const view = { width: 1280, height: 800 };
    const box = { width: 380, height: 200 };
    assert.equal(placePopover({ left: 100, top: 100, width: 200, height: 40 }, box, view).side, 'below');
    assert.equal(placePopover({ left: 100, top: 650, width: 200, height: 40 }, box, view).side, 'above');
    assert.equal(placePopover({ left: 100, top: 100, width: 300, height: 650 }, box, view).side, 'right');
    assert.equal(placePopover({ left: 800, top: 100, width: 300, height: 650 }, box, view).side, 'left');
    assert.equal(placePopover({ left: 0, top: 0, width: 1280, height: 800 }, box, view).side, 'over');
    const c = placePopover(null, box, view);
    assert.deepEqual(c, { side: 'center', left: 450, top: 300 });
  });

  test('yerleşim: rastgele hedef ve ekranlarda kutu hep ekranın içinde', () => {
    const r = rng(7);
    for (let i = 0; i < 400; i++) {
      const view = { width: 320 + Math.floor(r() * 1600), height: 480 + Math.floor(r() * 700) };
      const box = { width: Math.min(380, view.width - 16), height: 120 + Math.floor(r() * 160) };
      const t = r() < 0.1 ? null : { left: r() * view.width * 1.2 - 100, top: r() * view.height * 1.2 - 100, width: r() * view.width, height: r() * view.height };
      const p = placePopover(t, box, view);
      assert.ok(p.left >= 8 && p.left + box.width <= view.width - 8 + 1e-9, `${i}: yatay ${JSON.stringify({ view, box, t, p })}`);
      assert.ok(p.top >= 8 && p.top + box.height <= view.height - 8 + 1e-9, `${i}: dikey ${JSON.stringify({ view, box, t, p })}`);
      if (t && p.side === 'below') assert.ok(p.top >= t.top + t.height, `${i}: altta, hedefi örtmez`);
      if (t && p.side === 'above') assert.ok(p.top + box.height <= t.top, `${i}: üstte, hedefi örtmez`);
    }
  });

  test('çerçeve: pay eklenir, ekran dışı kırpılır', () => {
    const view = { width: 1000, height: 600 };
    assert.deepEqual(holeRect({ left: 100, top: 50, width: 200, height: 30 }, view), { left: 94, top: 44, width: 212, height: 42 });
    assert.deepEqual(holeRect({ left: -50, top: -20, width: 100, height: 60 }, view), { left: 0, top: 0, width: 56, height: 46 });
    assert.deepEqual(holeRect({ left: 980, top: 590, width: 100, height: 100 }, view), { left: 974, top: 584, width: 26, height: 16 });
    assert.deepEqual(holeRect({ left: 2000, top: 2000, width: 10, height: 10 }, view), { left: 1000, top: 600, width: 0, height: 0 });
  });

  test('adres: ?sunum ve ?sunum=1 açar, ?sunum=0 ve yokluğu açmaz', () => {
    assert.equal(tourRequested('?sunum=1'), true);
    assert.equal(tourRequested('?sunum'), true);
    assert.equal(tourRequested('?x=2&sunum=evet'), true);
    assert.equal(tourRequested('?sunum=0'), false);
    assert.equal(tourRequested(''), false);
    assert.equal(tourRequested('?paket=log'), false);
  });
});
