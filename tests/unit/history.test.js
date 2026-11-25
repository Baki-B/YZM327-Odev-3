// Komut geçmişi (src/workflows/history.js): geri al / yinele, birleştirme, kopyala-yapıştır.
// Son test özellik tabanlıdır (property-based): tohumlu rastgele işlem dizilerinde her adımda
// iş akışının, basit bir "durum yığını" modelinin söylediği durumla aynı olduğu denetlenir.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow, serializeWorkflow, canConnect, deserializeWorkflow } from '../../src/workflows/engine.js';
import { createCatalog } from '../../src/workflows/catalog.js';
import { PACKAGES } from '../../src/workflows/packages.js';
import {
  History, addNodeCommand, removeNodeCommand, connectCommand, removeEdgeCommand, moveNodeCommand,
  setParamCommand, setFieldCommand, replaceWorkflowCommand, macroCommand, fragmentOf, pasteCommand, cloneWorkflow,
} from '../../src/workflows/history.js';

const catalog = createCatalog();
const snap = (doc) => JSON.stringify(serializeWorkflow(doc.wf));

function small() {
  const doc = { wf: createWorkflow({ name: 'deneme' }) };
  const h = new History(doc);
  h.execute(addNodeCommand(catalog, 'kaynak.kod', { id: 'src', x: 10, y: 10 }));
  h.execute(addNodeCommand(catalog, 'uyarlayici.kaynak', { id: 'ad', x: 250, y: 10 }));
  h.execute(addNodeCommand(catalog, 'desen.todo', { id: 'pat', x: 10, y: 200 }));
  h.execute(addNodeCommand(catalog, 'molekul.ExactMatch', { id: 'em', x: 250, y: 200 }));
  h.execute(connectCommand(catalog, { node: 'src', port: 'files' }, { node: 'ad', port: 'files' }));
  h.execute(connectCommand(catalog, { node: 'ad', port: 'entries' }, { node: 'em', port: 'entries' }));
  h.execute(connectCommand(catalog, { node: 'pat', port: 'patterns' }, { node: 'em', port: 'patterns' }));
  return { doc, h };
}

describe('komut geçmişi: temel', () => {
  test('her komut geri alınınca iş akışı bir önceki duruma döner; yineleme aynı durumu verir', () => {
    const doc = { wf: createWorkflow() };
    const h = new History(doc);
    const states = [snap(doc)];
    const cmds = [
      addNodeCommand(catalog, 'kaynak.kod', { id: 'a' }),
      addNodeCommand(catalog, 'uyarlayici.kaynak', { id: 'b', x: 200 }),
      connectCommand(catalog, { node: 'a', port: 'files' }, { node: 'b', port: 'files' }),
      moveNodeCommand('a', { x: 0, y: 0 }, { x: 40, y: 60 }),
      setParamCommand('a', 'text', '', 'x = 1  # TODO'),
      setFieldCommand('name', 'Adsız iş akışı', 'Yeni ad'),
      removeEdgeCommand({ from: { node: 'a', port: 'files' }, to: { node: 'b', port: 'files' } }),
      removeNodeCommand('b'),
    ];
    for (const c of cmds) { h.execute(c); states.push(snap(doc)); h.seal(); }
    for (let i = states.length - 1; i > 0; i--) {
      assert.equal(snap(doc), states[i]);
      assert.ok(h.undo());
    }
    assert.equal(snap(doc), states[0]);
    assert.equal(h.undo(), null, 'geri alınacak bir şey kalmadı');
    for (let i = 1; i < states.length; i++) { h.redo(); assert.equal(snap(doc), states[i]); }
    assert.equal(h.redo(), null);
  });

  test('kutu silme bağlantılarıyla birlikte geri gelir, diziler eski sırasında', () => {
    const { doc, h } = small();
    const before = snap(doc);
    h.execute(removeNodeCommand('ad'));
    assert.equal(doc.wf.edges.length, 1);
    assert.ok(!doc.wf.nodes.some((n) => n.id === 'ad'));
    h.undo();
    assert.equal(snap(doc), before);
  });

  test('reddedilen bağlantı geçmişe girmez ve iş akışını değiştirmez', () => {
    const { doc, h } = small();
    const before = snap(doc);
    const size = h.size.undo;
    assert.throws(() => h.execute(connectCommand(catalog, { node: 'src', port: 'files' }, { node: 'em', port: 'entries' })), /Tür uyuşmuyor/);
    assert.equal(snap(doc), before);
    assert.equal(h.size.undo, size);
  });

  test('aynı ayara ardışık yazmalar tek adımda birleşir; seal() birleştirmeyi keser', () => {
    const { doc, h } = small();
    const n0 = h.size.undo;
    for (const t of ['T', 'TO', 'TOD', 'TODO']) h.execute(setParamCommand('src', 'text', doc.wf.nodes[0].params.text, t));
    assert.equal(h.size.undo, n0 + 1);
    assert.equal(doc.wf.nodes[0].params.text, 'TODO');
    h.seal();
    h.execute(setParamCommand('src', 'text', 'TODO', 'TODO!'));
    assert.equal(h.size.undo, n0 + 2);
    h.undo();
    assert.equal(doc.wf.nodes[0].params.text, 'TODO');
    h.undo();
    assert.equal(doc.wf.nodes[0].params.text, '');
  });

  test('ok tuşuyla adım adım taşıma tek adım; farklı kutu ayrı adım', () => {
    const { doc, h } = small();
    const n0 = h.size.undo;
    let x = 10;
    for (let i = 0; i < 5; i++) { h.execute(moveNodeCommand('src', { x, y: 10 }, { x: x + 10, y: 10 })); x += 10; }
    h.execute(moveNodeCommand('ad', { x: 250, y: 10 }, { x: 260, y: 10 }));
    assert.equal(h.size.undo, n0 + 2);
    h.undo();
    h.undo();
    assert.equal(doc.wf.nodes.find((n) => n.id === 'src').x, 10);
  });

  test('record(): zaten uygulanmış komut (fareyle sürükleme) geri alınabilir', () => {
    const { doc, h } = small();
    const node = doc.wf.nodes.find((n) => n.id === 'em');
    node.x = 400;
    h.record(moveNodeCommand('em', { x: 250, y: 200 }, { x: 400, y: 200 }));
    assert.equal(h.undoLabel, 'Kutu taşıma');
    h.undo();
    assert.equal(node.x, 250);
    assert.equal(h.redoLabel, 'Kutu taşıma');
  });

  test('paket yükleme (iş akışını değiştirme) geri alınır; anlık görüntüler bağımsız', () => {
    const { doc, h } = small();
    const before = snap(doc);
    const pkg = deserializeWorkflow(PACKAGES[0].build(), catalog);
    h.execute(replaceWorkflowCommand(doc.wf, pkg, 'Paket açma'));
    pkg.nodes.length = 0; // dışarıdaki nesneyi bozmak geçmişi etkilememeli
    assert.equal(doc.wf.nodes.length > 0, true);
    const after = snap(doc);
    h.undo();
    assert.equal(snap(doc), before);
    h.redo();
    assert.equal(snap(doc), after);
  });

  test('birleşik komut: biri hata verirse öncekiler geri alınır', () => {
    const { doc, h } = small();
    const before = snap(doc);
    const bad = macroCommand('iki iş', [
      addNodeCommand(catalog, 'cikti.tablo', { id: 'tab' }),
      connectCommand(catalog, { node: 'src', port: 'files' }, { node: 'tab', port: 'findings' }),
    ]);
    assert.throws(() => h.execute(bad), /Tür uyuşmuyor/);
    assert.equal(snap(doc), before);
  });

  test('sınır: en eski adımlar düşer', () => {
    const doc = { wf: createWorkflow() };
    const h = new History(doc, { limit: 3 });
    for (let i = 0; i < 5; i++) h.execute(addNodeCommand(catalog, 'desen.todo', { id: `p${i}` }));
    assert.equal(h.size.undo, 3);
    while (h.undo());
    assert.deepEqual(doc.wf.nodes.map((n) => n.id), ['p0', 'p1']);
    h.clear();
    assert.equal(h.canUndo || h.canRedo, false);
  });

  test('bağımsız kopya: cloneWorkflow ayarları paylaşmaz', () => {
    const { doc } = small();
    const c = cloneWorkflow(doc.wf);
    c.nodes[0].params.text = 'değişti';
    assert.notEqual(doc.wf.nodes[0].params.text, 'değişti');
  });
});

describe('kopyala / yapıştır', () => {
  test('parça yeni kimliklerle, kaydırılmış konumda ve iç bağlantılarıyla eklenir', () => {
    const { doc, h } = small();
    const frag = fragmentOf(doc.wf, ['src', 'ad']);
    assert.equal(frag.nodes.length, 2);
    assert.equal(frag.edges.length, 1, 'yalnızca iki kutu arasındaki bağlantı');
    const cmd = pasteCommand(catalog, doc.wf, frag);
    h.execute(cmd);
    assert.deepEqual(cmd.ids, ['src_kopya', 'ad_kopya']);
    const copy = doc.wf.nodes.find((n) => n.id === 'src_kopya');
    assert.equal(copy.x, 50);
    assert.ok(doc.wf.edges.some((e) => e.from.node === 'src_kopya' && e.to.node === 'ad_kopya'));
    const again = pasteCommand(catalog, doc.wf, frag);
    h.execute(again);
    assert.deepEqual(again.ids, ['src_kopya2', 'ad_kopya2']);
    h.undo();
    h.undo();
    assert.equal(doc.wf.nodes.length, 4);
  });

  test('bozuk ya da yabancı parça reddedilir', () => {
    const { doc } = small();
    assert.throws(() => pasteCommand(catalog, doc.wf, null), /parçası değil/);
    assert.throws(() => pasteCommand(catalog, doc.wf, { nodes: [{ id: 'x', type: 'yok.boyle' }], edges: [] }), /bilinmeyen/);
  });
});

// ------------------------------------------------------------------ özellik tabanlı test
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('komut geçmişi: özellik tabanlı (rastgele işlem dizileri)', () => {
  const TYPES = ['kaynak.kod', 'uyarlayici.kaynak', 'desen.todo', 'desen.ozel', 'molekul.ExactMatch', 'uyarlayici.bulgu', 'cikti.tablo', 'cikti.ozet'];
  for (const seed of [1, 2, 3, 20261125]) {
    test(`tohum ${seed}: 400 rastgele işlemde iş akışı her adımda modelle aynı`, () => {
      const rnd = mulberry32(seed);
      const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
      const doc = { wf: createWorkflow({ name: 'özellik' }) };
      const h = new History(doc, { limit: 10000 });
      // Model: geri alma yığını boyunca durumlar; birleşen komut tepeyi değiştirir.
      const stack = [snap(doc)];
      const redo = [];
      let lastKey = null;
      let sealed = true;
      const executed = (cmd) => {
        if (!sealed && cmd.key !== undefined && cmd.key === lastKey) stack[stack.length - 1] = snap(doc);
        else stack.push(snap(doc));
        redo.length = 0;
        lastKey = cmd.key;
        sealed = false;
      };
      let ops = 0;
      while (ops < 400) {
        const wf = doc.wf;
        const r = rnd();
        let cmd = null;
        if (r < 0.2) cmd = addNodeCommand(catalog, pick(TYPES), { x: Math.floor(rnd() * 800), y: Math.floor(rnd() * 600) });
        else if (r < 0.3 && wf.nodes.length) cmd = removeNodeCommand(pick(wf.nodes).id);
        else if (r < 0.45 && wf.nodes.length > 1) {
          const a = pick(wf.nodes);
          const b = pick(wf.nodes);
          const ca = catalog.get(a.type);
          const cb = catalog.get(b.type);
          const out = ca.outputs.length ? pick(ca.outputs) : null;
          const inp = cb.inputs.length ? pick(cb.inputs) : null;
          if (out && inp && canConnect(wf, catalog, { node: a.id, port: out.name }, { node: b.id, port: inp.name }).ok) {
            cmd = connectCommand(catalog, { node: a.id, port: out.name }, { node: b.id, port: inp.name });
          }
        } else if (r < 0.5 && wf.edges.length) cmd = removeEdgeCommand(pick(wf.edges));
        else if (r < 0.6 && wf.nodes.length) {
          const n = pick(wf.nodes);
          cmd = moveNodeCommand(n.id, { x: n.x, y: n.y }, { x: n.x + 10, y: n.y });
        } else if (r < 0.68) {
          const n = wf.nodes.find((x) => x.type === 'desen.ozel');
          if (n) cmd = setParamCommand(n.id, 'patterns', n.params.patterns, `${n.params.patterns}\nX${Math.floor(rnd() * 9)}`);
        } else if (r < 0.7) cmd = setFieldCommand('target', wf.target, `hedef ${Math.floor(rnd() * 99)}`);
        else if (r < 0.72) cmd = replaceWorkflowCommand(wf, deserializeWorkflow(pick(PACKAGES).build(), catalog));
        else if (r < 0.76 && wf.nodes.length) cmd = pasteCommand(catalog, wf, fragmentOf(wf, wf.nodes.filter(() => rnd() < 0.4).map((n) => n.id)));
        else if (r < 0.88) {
          if (h.undo()) { redo.push(stack.pop()); sealed = true; }
          else assert.equal(stack.length, 1);
        } else if (r < 0.97) {
          if (h.redo()) { stack.push(redo.pop()); sealed = true; }
          else assert.equal(redo.length, 0);
        } else { h.seal(); sealed = true; }
        if (cmd) { h.execute(cmd); executed(cmd); }
        assert.equal(snap(doc), stack.at(-1), `tohum ${seed}, işlem ${ops}`);
        assert.equal(h.size.undo, stack.length - 1);
        assert.equal(h.size.redo, redo.length);
        ops++;
      }
      while (h.undo()) redo.push(stack.pop());
      assert.equal(snap(doc), stack[0], 'hepsi geri alınınca başlangıç durumu');
    });
  }
});
