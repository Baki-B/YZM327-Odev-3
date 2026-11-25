// İş akışı araçları: denetim (lint.js), diyagram (diagram.js), çalıştırma kaydı (provenance.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorkflow, addNode, connect, runWorkflow, serializeWorkflow, deserializeWorkflow } from '../../src/workflows/engine.js';
import { createCatalog } from '../../src/workflows/catalog.js';
import { PACKAGES } from '../../src/workflows/packages.js';
import { lintWorkflow, lintSummary, LINT_RULES } from '../../src/workflows/lint.js';
import { toMermaid, toDot } from '../../src/workflows/diagram.js';
import { buildRunRecord, summarizeParams, sha256Hex, RUN_RECORD_FORMAT } from '../../src/workflows/provenance.js';
import { VERSION } from '../../src/version.js';
import { ExactSearchAtom, TASK } from '../../src/atomic/ExactSearchAtom.js';
import { Registry } from '../../src/registry.js';
import { NaiveSearch } from '../../src/atomic/NaiveSearch.js';
import { ExactMatch } from '../../src/molecules/ExactMatch.js';

const catalog = createCatalog();
const codes = (list) => list.map((f) => `${f.level}:${f.code}${f.node ? ':' + f.node : ''}`);

function flow() {
  const wf = createWorkflow({ name: 'TODO avı', target: 'iş notu kalmasın' });
  addNode(wf, catalog, 'kaynak.kod', { id: 'src', params: { path: 'a.py', text: '# TODO bir\nx = 1  # FIXME\n' } });
  addNode(wf, catalog, 'uyarlayici.kaynak', { id: 'ad' });
  addNode(wf, catalog, 'desen.todo', { id: 'pat' });
  addNode(wf, catalog, 'molekul.ExactMatch', { id: 'em' });
  addNode(wf, catalog, 'uyarlayici.bulgu', { id: 'bul' });
  addNode(wf, catalog, 'cikti.tablo', { id: 'tab' });
  connect(wf, catalog, { node: 'src', port: 'files' }, { node: 'ad', port: 'files' });
  connect(wf, catalog, { node: 'ad', port: 'entries' }, { node: 'em', port: 'entries' });
  connect(wf, catalog, { node: 'pat', port: 'patterns' }, { node: 'em', port: 'patterns' });
  connect(wf, catalog, { node: 'em', port: 'matches' }, { node: 'bul', port: 'matches' });
  connect(wf, catalog, { node: 'bul', port: 'findings' }, { node: 'tab', port: 'findings' });
  return wf;
}

describe('iş akışı denetimi (lint)', () => {
  test('altı hazır paketin hiçbirinde bulgu yok', () => {
    for (const p of PACKAGES) assert.deepEqual(codes(lintWorkflow(deserializeWorkflow(p.build(), catalog), catalog)), [], p.id);
  });
  test('boş iş akışı: bos + ad + hedef', () => {
    assert.deepEqual(codes(lintWorkflow(createWorkflow({ name: 'Yeni iş akışı' }), catalog)), ['uyarı:bos', 'bilgi:ad', 'bilgi:hedef']);
  });
  test('eksik zorunlu giriş "hata"; çıkışı kullanılmayan kutu "cikmaz"; önem sırasıyla', () => {
    const wf = flow();
    wf.edges = wf.edges.filter((e) => e.to.node !== 'tab'); // tablo girişi boşta, bul çıkışı boşta
    const got = codes(lintWorkflow(wf, catalog));
    assert.equal(got[0], 'hata:calismaz:tab');
    assert.ok(got.includes('uyarı:cikmaz:bul'), got.join(' '));
    assert.ok(got.includes('uyarı:yalniz:tab'));
    const s = lintSummary(lintWorkflow(wf, catalog));
    assert.equal(s.hata, 1);
  });
  test('sonuç kutusu yoksa uyarı; test referansı atomu bilgi', () => {
    const wf = flow();
    wf.nodes = wf.nodes.filter((n) => n.id !== 'tab');
    wf.edges = wf.edges.filter((e) => e.to.node !== 'tab');
    addNode(wf, catalog, 'atom.NaiveSearch', { id: 'naive' });
    connect(wf, catalog, { node: 'ad', port: 'entries' }, { node: 'naive', port: 'entries' });
    connect(wf, catalog, { node: 'pat', port: 'patterns' }, { node: 'naive', port: 'patterns' });
    const got = codes(lintWorkflow(wf, catalog));
    assert.ok(got.includes('uyarı:sonuc-yok'), got.join(' '));
    assert.ok(got.includes('bilgi:test-referansi:naive'));
  });
  test('kurallar bileşen adına değil katalog bilgisine bakar: yeni (sahte) atom için de çalışır', () => {
    class FakeSearch extends ExactSearchAtom {
      static manifest = { name: 'FakeSearch', version: '0.0.1', kind: 'atom', task: TASK, title: 'Sahte', references: [] };
      static selection = null;
      scanText(text, n, hits) { for (let i = 0; i < n; i++) if (text[i] === -1) hits.add(0, i); }
    }
    const reg = new Registry().register(NaiveSearch).register(FakeSearch);
    const cat = createCatalog(reg);
    const wf = createWorkflow({ name: 'x', target: 'y' });
    addNode(wf, cat, 'atom.FakeSearch', { id: 'f' });
    assert.ok(codes(lintWorkflow(wf, cat)).includes('bilgi:test-referansi:f'));
  });
  test('her kuralın önemi ve başlığı tanımlı', () => {
    for (const [code, r] of Object.entries(LINT_RULES)) assert.ok(['hata', 'uyarı', 'bilgi'].includes(r.level) && r.title, code);
  });
});

describe('diyagram dışa aktarımı', () => {
  test('Mermaid: her kutu ve bağlantı bir satır; tür etiketi kenarda; sınıflar tanımlı', () => {
    const wf = flow();
    const m = toMermaid(wf, catalog);
    assert.match(m, /^flowchart LR\n/);
    for (const n of wf.nodes) assert.match(m, new RegExp(`n_${n.id}\\[`));
    assert.equal((m.match(/-->\|/g) ?? []).length, wf.edges.length);
    assert.match(m, /n_src -->\|Source\.File\| n_ad/);
    assert.match(m, /classDef kaynak /);
  });
  test('Mermaid: tırnak ve açılı ayraç kaçışlanır, kimlikler güvenli ve benzersiz', () => {
    const wf = createWorkflow();
    addNode(wf, catalog, 'desen.todo', { id: 'a-b' });
    addNode(wf, catalog, 'desen.todo', { id: 'a_b' });
    const m = toMermaid(wf, catalog, { direction: 'TD' });
    assert.match(m, /^flowchart TD/);
    assert.match(m, /n_a_b\[/);
    assert.match(m, /n_a_b_\[/);
    const fake = new Map([['t', { title: 'a "b" <script>', category: 'KAYNAKLAR', icon: '•', inputs: [], outputs: [] }]]);
    const m2 = toMermaid({ name: 'x', target: '', nodes: [{ id: 'x', type: 't', x: 0, y: 0, params: {} }], edges: [] }, /** @type {any} */ (fake));
    assert.match(m2, /a #quot;b#quot; #lt;script#gt;/);
    assert.doesNotMatch(m2, /<script/);
  });
  test('DOT: geçerli digraph, kenarlar ok ile', () => {
    const d = toDot(flow(), catalog);
    assert.match(d, /^digraph "TODO avı" \{/);
    assert.match(d, /"src" -> "ad" \[label="Source\.File"\];/);
    assert.match(d, /\}\n$/);
  });
  test('her hazır paketin Mermaid diyagramı üretilebilir', () => {
    for (const p of PACKAGES) {
      const wf = deserializeWorkflow(p.build(), catalog);
      assert.equal(toMermaid(wf, catalog).split('\n').filter((l) => l.includes('-->')).length, wf.edges.length, p.id);
    }
  });
});

describe('çalıştırma kaydı (provenance)', () => {
  test('SHA-256: bilinen test vektörü', async () => {
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    await assert.rejects(() => sha256Hex('x', null), /crypto/);
  });
  test('uzun metin ve yüklenen dosyalar kayda içerikleriyle yazılmaz', () => {
    const p = summarizeParams({ text: 'x'.repeat(500), path: 'a.py', files: [{ path: 'b.txt', text: 'gizli içerik' }], n: 3 });
    assert.deepEqual(p.files, [{ path: 'b.txt', karakter: 12 }]);
    assert.equal(p.text.karakter, 500);
    assert.equal(p.path, 'a.py');
    assert.equal(p.n, 3);
    assert.ok(!JSON.stringify(p).includes('gizli içerik'));
  });
  test('kayıt: sürüm, sıra, durum, bulgu sayısı, molekül kararı; aynı girdiyle aynı kayıt', async () => {
    const wf = flow();
    let t = 0;
    const res = await runWorkflow(wf, catalog, { now: () => (t += 1), yieldEvery: 0 });
    const run = { ok: res.ok, order: res.order, totalMs: 12.34567, problems: res.problems, nodes: res.nodes };
    const inputs = { src: [{ path: 'a.py', chars: 22, sha256: await sha256Hex('# TODO bir\nx = 1  # FIXME\n') }] };
    const make = () => buildRunRecord({ workflow: serializeWorkflow(wf), catalog, run, createdAt: '2026-11-25T10:00:00.000Z', inputs, environment: { runner: 'test' } });
    const rec = make();
    assert.equal(rec.format, RUN_RECORD_FORMAT);
    assert.equal(rec.tool.version, VERSION);
    assert.equal(rec.result.ok, true);
    assert.equal(rec.result.findings, 2);
    assert.equal(rec.result.totalMs, 12.346);
    assert.deepEqual(rec.nodes.map((n) => n.id), res.order);
    const em = rec.nodes.find((n) => n.id === 'em');
    assert.equal(em.decision.requested, 'auto');
    assert.ok(em.decision.selected in em.decision.estimatesMs);
    assert.equal(em.version, ExactMatch.manifest.version, 'bileşenin kendi (IoS manifest) sürümü');
    assert.equal(rec.inputs[0].files[0].sha256.length, 64);
    assert.equal(JSON.stringify(make()), JSON.stringify(rec), 'deterministik');
  });
  test('hata veren çalıştırma kayda hatasıyla girer', async () => {
    const wf = flow();
    wf.nodes.find((n) => n.id === 'src').params.text = undefined; // metin yok: kaynak kutusu hata verir
    const res = await runWorkflow(wf, catalog, { yieldEvery: 0 });
    const rec = buildRunRecord({ workflow: serializeWorkflow(wf), catalog, run: res, createdAt: 'x' });
    assert.equal(rec.result.ok, false);
    assert.equal(rec.nodes.find((n) => n.id === 'src').status, 'hata');
    assert.equal(rec.nodes.find((n) => n.id === 'tab').status, 'atlandı');
  });
  test('sürüm package.json ile aynı', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    assert.equal(VERSION, pkg.version);
  });
});
