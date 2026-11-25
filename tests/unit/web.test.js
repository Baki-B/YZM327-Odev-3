// Arayüzün DOM'suz yardımcıları (web/lib/): biçim, geometri, olay yolu, depo, kısayol tablosu.
// Arayüzün DOM'a bağlı kısmı scripts/arayuz-denetimi.js ile gerçek tarayıcıda sınanır.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { nf, fmtMs, slug, b64urlEncode, b64urlDecode, catClass, tyClass } from '../../web/lib/format.js';
import { NODE_W, HEAD, PAD, ROW, FOOT, GRID, nodeHeight, portPos, edgePath, boardSize, freeSpot, fitZoom, clampZoom, snap } from '../../web/lib/geometry.js';
import { createBus } from '../../web/lib/bus.js';
import { createStorage, debounce } from '../../web/lib/storage.js';
import { SHORTCUTS, keyLabel } from '../../web/lib/shortcuts.js';

describe('web/lib/format.js', () => {
  test('Türkçe sayı ve süre biçimi', () => {
    assert.equal(nf(1234.56, 1), '1.234,6');
    assert.equal(fmtMs(null), '');
    assert.equal(fmtMs(0.1234), '0,123 ms');
    assert.equal(fmtMs(12.34), '12,3 ms');
    assert.equal(fmtMs(1234.4), '1.234 ms');
  });
  test('dosya adı: Türkçe harfler sadeleşir, boşsa varsayılan', () => {
    assert.equal(slug('Teknik borç avı'), 'teknik-borc-avi');
    assert.equal(slug('İĞÜŞÖÇ ığüşöç'), 'iguso-c-igusoc'.replace('-c-', 'c-'));
    assert.equal(slug('***'), 'is-akisi');
  });
  test('base64url gidiş-dönüş (Türkçe ve uzun metin)', () => {
    for (const s of ['', 'şğüİ ıöç → ✓', 'x'.repeat(100000)]) assert.equal(b64urlDecode(b64urlEncode(s)), s);
    assert.doesNotMatch(b64urlEncode('???>>>'), /[+/=]/);
  });
  test('CSS sınıf adları', () => {
    assert.equal(catClass('DESEN KÜMELERİ'), 'cat-DESEN-KÜMELERİ');
    assert.equal(tyClass('Finding'), 'ty-Finding');
  });
});

describe('web/lib/geometry.js', () => {
  const comp = { inputs: [{ name: 'a' }, { name: 'b' }], outputs: [{ name: 'x' }] };
  test('kutu yüksekliği ve uç konumları', () => {
    assert.equal(nodeHeight(comp), HEAD + PAD * 2 + 2 * ROW + FOOT);
    assert.equal(nodeHeight({ inputs: [], outputs: [] }), HEAD + PAD * 2 + ROW + FOOT, 'en az bir satır');
    const n = { x: 100, y: 50 };
    assert.deepEqual(portPos(comp, n, 'in', 'b'), { x: 100, y: 50 + HEAD + PAD + ROW + ROW / 2 });
    assert.deepEqual(portPos(comp, n, 'out', 'x'), { x: 100 + NODE_W, y: 50 + HEAD + PAD + ROW / 2 });
    assert.deepEqual(portPos(comp, n, 'in', 'yok'), portPos(comp, n, 'in', 'a'), 'bilinmeyen uç ilk satıra düşer');
  });
  test('kablo: kübik Bézier, yatay teğet en az 40 px', () => {
    assert.equal(edgePath({ x: 0, y: 0 }, { x: 10, y: 0 }), 'M 0 0 C 40 0, -30 0, 10 0');
    assert.match(edgePath({ x: 0, y: 0 }, { x: 400, y: 100 }), /^M 0 0 C 200 0, 200 100, 400 100$/);
  });
  test('tuval boyutu, ızgara, yakınlaştırma sınırları', () => {
    assert.deepEqual(boardSize([], () => comp), { cw: 30, ch: 30, w: 1400, h: 900 });
    const b = boardSize([{ x: 2000, y: 1000 }], () => comp);
    assert.equal(b.w, 2000 + NODE_W + 400);
    assert.equal(snap(14), 10);
    assert.equal(snap(15), 20);
    assert.equal(GRID, 10);
    assert.equal(clampZoom(5), 1.6);
    assert.equal(clampZoom(0.1), 0.4);
    assert.equal(clampZoom(1.234), 1.23);
  });
  test('boş yer: çakışan kutuların altına, dört denemede bir sağa kayar', () => {
    assert.deepEqual(freeSpot([], { left: 0, top: 0 }), { x: 40, y: 40 });
    const taken = [{ x: 40, y: 40 }, { x: 40, y: 150 }];
    assert.deepEqual(freeSpot(taken, { left: 0, top: 0 }), { x: 40, y: 260 });
    const col = [0, 1, 2, 3].map((i) => ({ x: 40, y: 40 + i * 110 }));
    assert.equal(freeSpot(col, { left: 0, top: 0 }).x, 40 + NODE_W + 40);
  });
  test('sığdırma: telefonda en az 0,7, masaüstünde en az 0,45, en çok 1', () => {
    assert.equal(fitZoom({ cw: 100, ch: 100 }, { width: 1000, height: 800 }, false), 1);
    assert.equal(fitZoom({ cw: 5000, ch: 3000 }, { width: 1000, height: 800 }, false), 0.45);
    assert.equal(fitZoom({ cw: 5000, ch: 3000 }, { width: 390, height: 600 }, true), 0.7);
  });
});

describe('web/lib/bus.js (olay yolu)', () => {
  test('abone olma, kayıt sırasıyla çağrı, abonelikten çıkma', () => {
    const bus = createBus();
    const seen = [];
    const off = bus.on('x', (p) => seen.push(['a', p.n]));
    bus.on('x', (p) => seen.push(['b', p.n]));
    bus.emit('x', { n: 1 });
    off();
    bus.emit('x', { n: 2 });
    bus.emit('olmayan');
    assert.deepEqual(seen, [['a', 1], ['b', 1], ['b', 2]]);
    assert.equal(bus.count('x'), 1);
  });
  test('bir abonenin hatası diğerlerini durdurmaz, sonra yeniden fırlatılır', () => {
    const bus = createBus();
    let later = false;
    bus.on('x', () => { throw new Error('bozuk görünüm'); });
    bus.on('x', () => { later = true; });
    assert.throws(() => bus.emit('x'), /bozuk görünüm/);
    assert.equal(later, true);
  });
});

describe('web/lib/storage.js', () => {
  test('depo yoksa ya da hata verirse sessizce geçer', () => {
    const none = createStorage(null);
    assert.equal(none.get('a'), null);
    assert.equal(none.set('a', '1'), false);
    const broken = createStorage({ getItem() { throw new Error('engelli'); }, setItem() { throw new Error('dolu'); }, removeItem() { throw new Error('x'); } });
    assert.equal(broken.get('a'), null);
    assert.equal(broken.set('a', '1'), false);
    broken.remove('a');
    const map = new Map();
    const ok = createStorage({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) });
    assert.equal(ok.set('a', '1'), true);
    assert.equal(ok.get('a'), '1');
    ok.remove('a');
    assert.equal(ok.get('a'), null);
  });
  test('debounce: art arda çağrılar tek çalıştırma; flush hemen çalıştırır', () => {
    const timers = [];
    const fake = { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: (id) => { timers[id - 1] = null; } };
    let n = 0;
    const d = debounce(() => n++, 400, /** @type {any} */ (fake));
    d(); d(); d();
    for (const t of timers) t?.();
    assert.equal(n, 1);
    d();
    d.flush();
    assert.equal(n, 2);
    d.flush();
    assert.equal(n, 2, 'bekleyen yoksa flush bir şey yapmaz');
  });
});

describe('web/lib/shortcuts.js', () => {
  test('her kısayolun tuşu ve açıklaması var; Mac\'te Ctrl yerine ⌘', () => {
    assert.ok(SHORTCUTS.length >= 10);
    for (const s of SHORTCUTS) assert.ok(s.keys.length && s.what, JSON.stringify(s));
    assert.equal(keyLabel('Ctrl', true), '⌘');
    assert.equal(keyLabel('Ctrl', false), 'Ctrl');
    assert.equal(keyLabel('Z', true), 'Z');
  });
});

describe('arayüz modül yapısı (tek sorumluluk)', () => {
  test('web/ altındaki her JavaScript dosyası 450 satırın altında; giriş dosyası yalnızca bağlar', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${dir}${e.name}/`);
        else if (e.name.endsWith('.js')) files.push(`${dir}${e.name}`);
      }
    };
    walk('../../web/');
    assert.ok(files.length >= 12, files.join(', '));
    for (const f of files) {
      const lines = readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').length;
      assert.ok(lines < 450, `${f}: ${lines} satır`);
    }
    const app = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
    assert.ok(app.split('\n').length < 60, 'app.js yalnızca modülleri bağlar');
    assert.doesNotMatch(app, /addEventListener|createElement/, 'app.js DOM işi yapmaz');
  });
  test('görünümler birbirini değil denetleyiciyi ve olay yolunu kullanır', () => {
    for (const v of ['canvas', 'results', 'palette']) {
      const src = readFileSync(new URL(`../../web/views/${v}.js`, import.meta.url), 'utf8');
      const others = ['canvas', 'props', 'results', 'palette'].filter((o) => o !== v);
      for (const o of others) assert.doesNotMatch(src, new RegExp(`from '\\./${o}\\.js'`), `${v}.js → ${o}.js`);
    }
    for (const f of ['actions.js', 'actions/core.js', 'actions/edit.js', 'actions/io.js', 'actions/run.js']) {
      const src = readFileSync(new URL(`../../web/${f}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /from '\.{1,2}\/views\//, `${f}: denetleyici görünümleri içe aktarmaz`);
    }
  });
});
