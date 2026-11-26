// Otomatik yerleşim (web/lib/layout.js): bütün hazır paketlerde kablolar soldan sağa gider,
// kutular üst üste binmez, sonuç ızgaraya oturur ve tekrar uygulanınca değişmez; karıştırılmış
// bir yerleşimde kesişen kablo sayısı azalır.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { layeredLayout, edgeCrossings, minimapModel, minimapToBoard } from '../../web/lib/layout.js';
import { NODE_W, GRID, nodeHeight, boardSize } from '../../web/lib/geometry.js';
import { createCatalog } from '../../src/workflows/catalog.js';
import { createWorkflow, addNode, connect, deserializeWorkflow } from '../../src/workflows/engine.js';
import { PACKAGES, packageById } from '../../src/workflows/packages.js';

const catalog = createCatalog();
const compOf = (n) => catalog.get(n.type);
const build = (id) => deserializeWorkflow(packageById(id).build(), catalog);
const apply = (wf, pos) => { for (const n of wf.nodes) Object.assign(n, pos.get(n.id)); return wf; };

describe('otomatik yerleşim', () => {
  for (const p of PACKAGES) {
    test(`${p.id}: kablolar soldan sağa, kutular çakışmaz, ızgarada, tekrarında aynı`, () => {
      const wf = build(p.id);
      const pos = layeredLayout(wf, compOf);
      assert.equal(pos.size, wf.nodes.length);
      for (const e of wf.edges) assert.ok(pos.get(e.from.node).x + NODE_W < pos.get(e.to.node).x, `${e.from.node} → ${e.to.node}`);
      const boxes = wf.nodes.map((n) => ({ id: n.id, ...pos.get(n.id), h: nodeHeight(compOf(n)) }));
      for (const b of boxes) assert.ok(b.x % GRID === 0 && b.y % GRID === 0 && b.x >= 0 && b.y >= 0, b.id);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!overlap, `${a.id} ile ${b.id} üst üste`);
        }
      }
      assert.ok(edgeCrossings(wf, compOf, pos) <= edgeCrossings(wf, compOf), 'kesişme artmaz');
      const again = layeredLayout(apply(wf, pos), compOf);
      assert.deepEqual([...again], [...pos], 'yerleşik iş akışında yeniden uygulamak bir şey değiştirmez');
    });
  }

  test('girdisi olmayan desen kutusu, onu kullanan kutunun hemen soluna çekilir', () => {
    const wf = build('teknik-borc');
    const pos = layeredLayout(wf, compOf);
    const col = (id) => pos.get(id).x;
    assert.ok(col('kaynak') < col('uyarlayici') && col('uyarlayici') < col('molekul'));
    assert.equal(col('desen1'), col('uyarlayici'), 'desen kutusu ilk sütunda değil, molekülün hemen solunda');
  });

  test('karıştırılmış yerleşimde kesişen kablo azalır (tek desen: 5 → 0, biyoloji: 3 → 1)', () => {
    /** @type {Array<[string, number[]]>} */
    const cases = [['tek-desen', [5, 0]], ['biyoloji', [3, 1]]];
    for (const [id, expected] of cases) {
      const wf = apply(build(id), layeredLayout(build(id), compOf));
      // En kalabalık sütundaki kutuların dikey sırası ters çevrilir: kablolar birbirini keser.
      const columns = new Map();
      for (const n of wf.nodes) columns.set(n.x, [...(columns.get(n.x) ?? []), n]);
      const busiest = [...columns.values()].sort((a, b) => b.length - a.length)[0];
      const ys = busiest.map((n) => n.y).reverse();
      busiest.forEach((n, i) => { n.y = ys[i]; });
      const before = edgeCrossings(wf, compOf);
      const after = edgeCrossings(wf, compOf, layeredLayout(wf, compOf));
      assert.deepEqual([before, after], expected, id);
    }
  });

  test('mini harita: tuval sığar, kutular ve görünen alan aynı ölçekle; tıklanan nokta tuvale çevrilir', () => {
    const wf = build('teknik-borc');
    const size = { width: 180, height: 120 };
    const m = minimapModel(wf, compOf, { left: 100, top: 50, width: 600, height: 400 }, size);
    const { w, h } = boardSize(wf.nodes, compOf);
    assert.equal(m.scale, Math.min(180 / w, 120 / h));
    assert.equal(m.nodes.length, wf.nodes.length);
    for (const n of m.nodes) assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= 180 + 1e-9 && n.y + n.h <= 120 + 1e-9, n.id);
    assert.deepEqual(m.view, { x: 100 * m.scale, y: 50 * m.scale, w: 600 * m.scale, h: 400 * m.scale });
    assert.deepEqual(minimapToBoard({ x: 90, y: 60 }, m), { x: 90 / m.scale, y: 60 / m.scale });
    const wide = minimapModel(wf, compOf, { left: 0, top: 0, width: 5000, height: 300 }, size);
    assert.ok(wide.view.w <= 180 + 1e-9, 'görünen alan tuvalden genişse harita ona göre küçülür');
  });

  test('boş iş akışı, tek kutu ve birbirine bağlı olmayan iki kol', () => {
    assert.equal(layeredLayout(createWorkflow(), compOf).size, 0);
    const wf = createWorkflow();
    addNode(wf, catalog, 'kaynak.ornek', { id: 'k1', x: 500, y: 500 });
    assert.deepEqual(layeredLayout(wf, compOf).get('k1'), { x: 40, y: 40 });
    addNode(wf, catalog, 'uyarlayici.kaynak', { id: 'u1' });
    addNode(wf, catalog, 'kaynak.ornek', { id: 'k2', y: 900 });
    addNode(wf, catalog, 'uyarlayici.kaynak', { id: 'u2', y: 900 });
    connect(wf, catalog, { node: 'k1', port: 'files' }, { node: 'u1', port: 'files' });
    connect(wf, catalog, { node: 'k2', port: 'files' }, { node: 'u2', port: 'files' });
    const pos = layeredLayout(wf, compOf);
    assert.equal(pos.get('k1').x, pos.get('k2').x);
    assert.ok(pos.get('k1').y < pos.get('k2').y, 'yukarıdaki kol yukarıda kalır');
    assert.equal(edgeCrossings(wf, compOf, pos), 0);
  });
});
