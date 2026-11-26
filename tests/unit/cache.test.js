// İş akışı önbelleği (src/workflows/engine.js, ctx.cache): değişmeyen kutu yeniden çalışmaz,
// bir ayar değişince yalnızca o kutu ve ondan sonrakiler çalışır; sonuçlar önbelleksiz
// çalıştırmayla aynıdır. Hangi kutunun çalıştığı, run() çağrılarını sayan bir katalog
// kopyasıyla ölçülür.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog } from '../../src/workflows/catalog.js';
import { cacheKey, connect, deserializeWorkflow, removeEdge, runWorkflow, serializeWorkflow } from '../../src/workflows/engine.js';
import { packageById } from '../../src/workflows/packages.js';
import { buildRunRecord } from '../../src/workflows/provenance.js';
import { loadSampleNode } from '../../src/workflows/samplesNode.js';

/** Bileşenlerin run() çağrılarını kutu kimliğiyle kaydeden katalog kopyası. */
function countingCatalog() {
  const base = createCatalog();
  const calls = [];
  const cat = /** @type {import('../../src/contracts.js').Catalog} */ (new Map([...base].map(([type, c]) => [type, {
    ...c,
    run: (inputs, params, ctx) => { calls.push(ctx.node.id); return c.run(inputs, params, ctx); },
  }])));
  cat.categories = base.categories;
  return { cat, calls };
}

/** Bir kutunun kendisi ve ondan sonraki bütün kutular (bağlantılar boyunca). */
function downstream(wf, id) {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of wf.edges) if (out.has(e.from.node) && !out.has(e.to.node)) { out.add(e.to.node); grew = true; }
  }
  return out;
}

const opts = (cache) => ({ loadSample: loadSampleNode, yieldEvery: 0, cache });
const counts = (res) => Object.fromEntries(Object.entries(res.nodes).filter(([, r]) => typeof r.info?.count === 'number').map(([id, r]) => [id, r.info.count]));
const ranSorted = (calls) => [...calls].sort();

describe('iş akışı önbelleği', () => {
  test('ikinci çalıştırmada hiçbir kutu yeniden çalışmaz; çıktılar aynı', async () => {
    const { cat, calls } = countingCatalog();
    const wf = deserializeWorkflow(packageById('teknik-borc').build(), cat);
    const cache = new Map();
    const a = await runWorkflow(wf, cat, opts(cache));
    assert.deepEqual(ranSorted(calls), wf.nodes.map((n) => n.id).sort());
    assert.ok(Object.values(a.nodes).every((r) => !r.cached));
    calls.length = 0;
    const b = await runWorkflow(wf, cat, opts(cache));
    assert.deepEqual(calls, []);
    assert.ok(Object.values(b.nodes).every((r) => r.status === 'bitti' && r.cached && r.ms === 0));
    for (const id of Object.keys(a.nodes)) assert.deepEqual(b.nodes[id].outputs, a.nodes[id].outputs, id);
    assert.deepEqual(counts(b), counts(a));
    assert.equal(cache.size, wf.nodes.length, 'önbellekte yalnızca son çalıştırmanın kutuları');
  });

  test('bir ayar değişince yalnızca o kutu ve ondan sonrakiler çalışır', async () => {
    const { cat, calls } = countingCatalog();
    const wf = deserializeWorkflow(packageById('teknik-borc').build(), cat);
    const cache = new Map();
    await runWorkflow(wf, cat, opts(cache));
    calls.length = 0;
    wf.nodes.find((n) => n.id === 'bulgu').params.word = true;
    const res = await runWorkflow(wf, cat, opts(cache));
    assert.deepEqual(ranSorted(calls), [...downstream(wf, 'bulgu')].sort());
    assert.deepEqual(['kaynak', 'uyarlayici', 'desen1', 'molekul'].map((id) => res.nodes[id].cached), [true, true, true, true]);
  });

  test('kaynak değişince o daldaki her kutu çalışır; bağımsız desen kutusu çalışmaz', async () => {
    const { cat, calls } = countingCatalog();
    const wf = deserializeWorkflow(packageById('teknik-borc').build(), cat);
    const cache = new Map();
    await runWorkflow(wf, cat, opts(cache));
    calls.length = 0;
    wf.nodes.find((n) => n.id === 'kaynak').params.sample = 'log';
    await runWorkflow(wf, cat, opts(cache));
    assert.deepEqual(ranSorted(calls), [...downstream(wf, 'kaynak')].sort());
    assert.ok(!calls.includes('desen1'));
  });

  test('bağlantı değişince anahtar değişir: bağlantıyı silip yeniden kurmak sonucu değiştirmez', async () => {
    const { cat, calls } = countingCatalog();
    const wf = deserializeWorkflow(packageById('teknik-borc').build(), cat);
    const cache = new Map();
    const first = await runWorkflow(wf, cat, opts(cache));
    const edge = wf.edges.find((e) => e.to.node === 'molekul' && e.to.port === 'patterns');
    removeEdge(wf, edge);
    connect(wf, cat, edge.from, edge.to);
    calls.length = 0;
    const again = await runWorkflow(wf, cat, opts(cache));
    assert.deepEqual(calls, [], 'aynı bağlantı aynı anahtarı verir');
    assert.deepEqual(counts(again), counts(first));
  });

  test('önbellekli sonuç önbelleksiz çalıştırmayla aynı (ayar değişikliğinden sonra da)', async () => {
    for (const id of ['teknik-borc', 'gizli-bilgi']) {
      const { cat } = countingCatalog();
      const wf = deserializeWorkflow(packageById(id).build(), cat);
      const cache = new Map();
      await runWorkflow(wf, cat, opts(cache));
      const bulgu = wf.nodes.find((n) => n.type === 'uyarlayici.bulgu');
      bulgu.params.inlineIgnore = false;
      const cached = await runWorkflow(wf, cat, opts(cache));
      const plain = await runWorkflow(wf, cat, opts(null));
      assert.deepEqual(counts(cached), counts(plain), id);
      for (const n of wf.nodes) assert.deepEqual(cached.nodes[n.id].outputs, plain.nodes[n.id].outputs, `${id}/${n.id}`);
    }
  });

  test('hata veren kutu önbelleğe girmez, sonraki çalıştırmada yeniden denenir', async () => {
    const { cat, calls } = countingCatalog();
    const wf = deserializeWorkflow(packageById('teknik-borc').build(), cat);
    wf.nodes.find((n) => n.id === 'kaynak').params.sample = 'yok';
    const cache = new Map();
    const a = await runWorkflow(wf, cat, opts(cache));
    assert.equal(a.nodes.kaynak.status, 'hata');
    assert.equal(a.nodes.uyarlayici.status, 'atlandı');
    calls.length = 0;
    await runWorkflow(wf, cat, opts(cache));
    assert.ok(calls.includes('kaynak'), 'hata veren kutu yeniden çalıştı');
    assert.deepEqual([...cache.values()].length, 1, 'yalnızca başarılı desen kutusu önbellekte');
  });

  test('çalıştırma kaydı önbellekten gelen kutuyu işaretler', async () => {
    const { cat } = countingCatalog();
    const wf = deserializeWorkflow(packageById('teknik-borc').build(), cat);
    const cache = new Map();
    await runWorkflow(wf, cat, opts(cache));
    wf.nodes.find((n) => n.id === 'bulgu').params.word = true;
    const run = await runWorkflow(wf, cat, opts(cache));
    const rec = buildRunRecord({ workflow: serializeWorkflow(wf), catalog: cat, run, createdAt: '2026-11-26T00:00:00Z' });
    const cachedIds = rec.nodes.filter((n) => n.cached).map((n) => n.id).sort();
    assert.deepEqual(cachedIds, ['desen1', 'kaynak', 'molekul', 'uyarlayici']);
    assert.ok(rec.nodes.filter((n) => !n.cached).every((n) => !('cached' in n)), 'çalışan kutuda alan yok');
  });

  test('önbellek verilmezse her kutu her seferinde çalışır (komut satırı)', async () => {
    const { cat, calls } = countingCatalog();
    const wf = deserializeWorkflow(packageById('teknik-borc').build(), cat);
    await runWorkflow(wf, cat, opts(null));
    await runWorkflow(wf, cat, opts(undefined));
    assert.equal(calls.length, 2 * wf.nodes.length);
  });

  test('anahtar: tür, ayarlar ve girişlerin anahtarlarına bağlı; aynı girdide aynı', async () => {
    const node = { id: 'b', type: 'uyarlayici.bulgu', x: 0, y: 0, params: { word: false } };
    const edge = { from: { node: 'a', port: 'matches' }, to: { node: 'b', port: 'matches' } };
    const k = await cacheKey(node, [edge], { a: 'x' });
    assert.match(k, /^[0-9a-f]{64}$/);
    assert.equal(await cacheKey({ ...node, id: 'baska-kimlik', x: 99 }, [edge], { a: 'x' }), k, 'kimlik ve konum anahtara girmez');
    assert.notEqual(await cacheKey({ ...node, params: { word: true } }, [edge], { a: 'x' }), k, 'ayar');
    assert.notEqual(await cacheKey(node, [edge], { a: 'y' }), k, 'önceki kutunun anahtarı');
    assert.notEqual(await cacheKey(node, [], {}), k, 'bağlantı');
    assert.notEqual(await cacheKey({ ...node, type: 'cikti.tablo' }, [edge], { a: 'x' }), k, 'tür');
  });
});
