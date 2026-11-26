// Görünüm modelleri (web/lib/view-models.js): arayüzün ekrana yazdığı metinler, sıralar ve
// oranlar tarayıcısız sınanır. Son bölüm gerçek bir hazır paketi iş akışı motoruyla çalıştırıp
// rozetin ve tabloların motorun çıktısıyla tutarlı olduğunu gösterir.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  barPct, findingTotal, badgeModel, findingsEmptyText, findingsHeading, findingRow, FINDINGS_LIMIT,
  gateCounter, patternBars, raceModel, lintNote, lintTab, strongestLint, nodeFooterText,
  connectionItems, connectOptions, decisionModel, expectedText, normalizeQuery, matchesQuery,
  paletteGroups, paletteItem,
} from '../../web/lib/view-models.js';
import { nf, fmtMs } from '../../web/lib/format.js';
import { createCatalog, SAMPLES } from '../../src/workflows/catalog.js';
import { createWorkflow, addNode, connect, deserializeWorkflow, runWorkflow } from '../../src/workflows/engine.js';
import { packageById } from '../../src/workflows/packages.js';
import { loadSampleNode } from '../../src/workflows/samplesNode.js';

const catalog = createCatalog();
const compOf = (n) => catalog.get(n.type);
const bulgu = (id) => ({ id, type: 'uyarlayici.bulgu', x: 0, y: 0, params: {} });

describe('durum rozeti ve bulgu toplamı', () => {
  const nodes = [bulgu('b1'), bulgu('b2'), { id: 't', type: 'cikti.tablo', x: 0, y: 0, params: {} }];
  const run = (extra = {}) => ({ ok: true, totalMs: 249.4, nodes: { b1: { status: 'bitti', info: { count: 5 } }, b2: { status: 'bitti', info: { count: 13 } }, t: { status: 'bitti', info: {} } }, ...extra });

  test('yalnızca "Eşleşme → Bulgu" kutularının sayıları toplanır; bilgisi olmayan kutu 0 sayılır', () => {
    assert.equal(findingTotal(run(), nodes), 18);
    assert.equal(findingTotal({ ok: true, nodes: { b1: { status: 'hata' } } }, nodes), 0);
  });

  test('çalışıyor, çalışmadı, değişiklik var', () => {
    assert.deepEqual(badgeModel({ running: true, run: run(), dirty: false, nodes }), { text: 'çalışıyor…', state: 'running' });
    assert.deepEqual(badgeModel({ running: false, run: null, dirty: false, nodes }), { text: 'çalışmadı', state: 'idle' });
    assert.deepEqual(badgeModel({ running: false, run: run(), dirty: true, nodes }), { text: 'çalışmadı (değişiklik var)', state: 'idle' });
  });

  test('bitti: bulgu sayısı ve süre; kapı kaldıysa ayrıca söylenir', () => {
    assert.deepEqual(badgeModel({ running: false, run: run(), dirty: false, nodes }), { text: `bitti: 18 bulgu, ${fmtMs(249.4)}`, state: 'done' });
    const gated = run();
    gated.nodes.k = { status: 'bitti', info: { gate: 'kaldı', count: 18 } };
    assert.deepEqual(badgeModel({ running: false, run: gated, dirty: false, nodes }), { text: `bitti: 18 bulgu, ${fmtMs(249.4)} · kapı kaldı`, state: 'gate' });
  });

  test('önbellekten gelen kutular sayılır ve rozette söylenir', () => {
    const r = run();
    r.nodes.b1.cached = true;
    r.nodes.t.cached = true;
    assert.equal(badgeModel({ running: false, run: r, dirty: false, nodes }).text, `bitti: 18 bulgu, ${fmtMs(249.4)} · 2 kutu önbellekten`);
  });

  test('hata: önce iş akışı sorunu, yoksa hata veren kutunun iletisi, o da yoksa genel ileti', () => {
    assert.deepEqual(badgeModel({ running: false, run: { ok: false, problems: [{ message: 'Sonuç kutusu yok' }], nodes: {} }, dirty: false, nodes }), { text: 'hata: Sonuç kutusu yok', state: 'error' });
    assert.equal(badgeModel({ running: false, run: { ok: false, nodes: { a: { status: 'bitti' }, b: { status: 'hata', error: 'dosya okunamadı' } } }, dirty: false, nodes }).text, 'hata: dosya okunamadı');
    assert.equal(badgeModel({ running: false, run: { ok: false, nodes: {} }, dirty: false, nodes }).text, 'hata: bilinmeyen hata');
  });
});

describe('bulgu tablosu', () => {
  test('boş sekme iletileri: çalışmadı, değişti, tablo kutusu yok; tablo varsa ileti yok', () => {
    assert.match(findingsEmptyText(null, false, 0), /^Henüz çalıştırılmadı/);
    assert.match(findingsEmptyText(null, true, 0), /^İş akışı değişti/);
    assert.match(findingsEmptyText({ ok: true, nodes: {} }, false, 0), /"Bulgu tablosu" kutusu yok/);
    assert.equal(findingsEmptyText({ ok: true, nodes: {} }, false, 1), null);
  });

  test('başlık: sınırı aşan tabloda yalnızca ilk satırların gösterildiği yazılır', () => {
    assert.equal(FINDINGS_LIMIT, 500);
    assert.equal(findingsHeading('t1', 18), 'Bulgu tablosu (t1) · 18 bulgu');
    assert.equal(findingsHeading('t1', 500), 'Bulgu tablosu (t1) · 500 bulgu');
    assert.equal(findingsHeading('t1', 7715), `Bulgu tablosu (t1) · ${nf(7715, 0)} bulgu · ilk 500 gösteriliyor`);
    assert.equal(findingsHeading('t1', 12, 10), 'Bulgu tablosu (t1) · 12 bulgu · ilk 10 gösteriliyor');
  });

  test('satır: konum, kural, önem ve önizleme parçaları', () => {
    const r = findingRow({ file: 'src/a.js', line: 3, column: 7, pattern: 'TODO', ruleId: 'teknik-borc.todo', severity: 'warning', preview: { before: '// ', hit: 'TODO', after: ': düzelt' } });
    assert.deepEqual(r, {
      loc: 'src/a.js:3:7', pattern: 'TODO', rule: 'teknik-borc.todo', severity: 'warning', severityTitle: 'önem: uyarı',
      preview: { before: '// ', hit: 'TODO', after: ': düzelt', title: '// TODO: düzelt' },
    });
    assert.equal(findingRow({ file: 'a', line: 1, column: 1, pattern: 'x', severity: 'error' }).severityTitle, 'önem: hata');
    assert.equal(findingRow({ file: 'a', line: 1, column: 1, pattern: 'x', severity: 'critical' }).severityTitle, 'önem: critical', 'bilinmeyen önem olduğu gibi yazılır');
    const bare = findingRow({ file: 'a', line: 1, column: 1, pattern: 'x' });
    assert.deepEqual([bare.rule, bare.severity, bare.severityTitle, bare.preview], ['', '', '', null]);
  });
});

describe('özet ve atom yarışı', () => {
  test('kapı sayacı: kaldıysa çıkış kodu 1, geçtiyse 0', () => {
    assert.deepEqual(gateCounter({ gate: 'kaldı', count: 7 }), { failed: true, value: 'KALDI', label: 'kapı: 7 bulgu → çıkış kodu 1' });
    assert.deepEqual(gateCounter({ gate: 'geçti', count: 0 }), { failed: false, value: 'GEÇTİ', label: 'kapı: bulgu yok → çıkış kodu 0' });
  });

  test('çubuk oranı en büyük değere göre; en büyük 0 ise 0 (NaN değil)', () => {
    assert.equal(barPct(5, 20), 25);
    assert.equal(barPct(0, 0), 0);
    assert.deepEqual(patternBars([['TODO', 12], ['FIXME', 3]]).map((b) => [b.pattern, b.count, b.width]), [['TODO', '12', 100], ['FIXME', '3', 25]]);
    assert.deepEqual(patternBars([['x', 0]]).map((b) => b.width), [0], 'hiç bulgu yoksa en büyük değer 1 sayılır');
  });

  const rc = {
    node: 'm1', records: 1234, chars: 48502, patterns: 9, reps: 5, fastest: 'HorspoolSearch', selected: 'WuManberSearch',
    rows: [
      { name: 'WuManberSearch', ms: 2, estimatedMs: 4, applicable: true },
      { name: 'HorspoolSearch', ms: 1, estimatedMs: 3, applicable: true },
      { name: 'ShiftOrSearch', ms: 3, estimatedMs: null, applicable: false, reason: 'desen 32 karakterden uzun' },
    ],
  };

  test('yarış: ölçülen süreye göre sıralı, çubuklar ölçülen ve tahminlerin en büyüğüne göre', () => {
    const m = raceModel(rc);
    assert.deepEqual(m.rows.map((r) => r.name), ['HorspoolSearch', 'WuManberSearch', 'ShiftOrSearch']);
    assert.deepEqual(m.rows.map((r) => r.width), [25, 50, 75], 'en büyük süre tahmindeki 4 ms');
    assert.deepEqual(m.rows.map((r) => r.estWidth), [75, 100, null]);
    assert.deepEqual(m.rows.map((r) => r.est), [fmtMs(3), fmtMs(4), '—']);
    assert.deepEqual(m.rows.map((r) => r.selected), [false, true, false]);
    assert.deepEqual(m.rows.map((r) => r.note), ['en hızlı', 'molekülün seçimi', 'uygun değil: desen 32 karakterden uzun']);
    assert.match(m.note, new RegExp(`Girdi \\(m1\\): ${nf(1234, 0)} kayıt, ${nf(48502, 0)} karakter, 9 desen; her atom ısınma \\+ 5 tekrarın medyanı`));
    assert.match(m.note, /En hızlı: HorspoolSearch; molekülün seçimi: WuManberSearch\.$/);
    assert.match(raceModel({ ...rc, selected: 'HorspoolSearch' }).note, /molekülün seçimi: HorspoolSearch \(aynı\)\.$/);
    assert.equal(rc.rows[0].name, 'WuManberSearch', 'girdi dizisi yerinde sıralanmaz');
  });
});

describe('denetim (lint)', () => {
  const list = [
    { level: 'bilgi', code: 'L1', message: 'a', node: 'n1' },
    { level: 'uyarı', code: 'L2', message: 'b', node: 'n1' },
    { level: 'hata', code: 'L3', message: 'c', node: 'n2' },
    { level: 'uyarı', code: 'L4', message: 'd' },
  ];

  test('sekme adı hata + uyarı sayısını, düzeyi en ağırını gösterir', () => {
    assert.deepEqual(lintTab(list), { text: 'Denetim (3)', level: 'hata' });
    assert.deepEqual(lintTab(list.filter((f) => f.level !== 'hata')), { text: 'Denetim (2)', level: 'uyarı' });
    assert.deepEqual(lintTab([list[0]]), { text: 'Denetim', level: '' }, 'yalnızca bilgi varsa sayı yazılmaz');
    assert.match(lintNote(list), /1 hata, 2 uyarı, 1 bilgi\./);
  });

  test('kutudaki işaret en önemli bulgudur; bulgusu olmayan kutuda yoktur', () => {
    assert.equal(strongestLint(list, 'n1').code, 'L2');
    assert.equal(strongestLint(list, 'n2').code, 'L3');
    assert.equal(strongestLint(list, 'n3'), null);
  });
});

describe('tuvaldeki kutunun alt satırı', () => {
  const node = (type, params = {}) => ({ id: 'x', type, x: 0, y: 0, params });

  test('çalıştıysa durum, süre ve özet', () => {
    assert.equal(nodeFooterText(node('cikti.tablo'), {}, { status: 'çalışıyor' }), 'çalışıyor…');
    assert.equal(nodeFooterText(node('cikti.tablo'), {}, { status: 'bitti', ms: 12.34, summary: '18 bulgu' }), `${fmtMs(12.34)} · 18 bulgu`);
    assert.equal(nodeFooterText(node('cikti.tablo'), {}, { status: 'bitti', ms: 1, info: { summary: 'bilgiden' } }), `${fmtMs(1)} · bilgiden`);
    assert.equal(nodeFooterText(node('cikti.tablo'), {}, { status: 'hata', error: 'okunamadı' }), 'hata: okunamadı');
    assert.equal(nodeFooterText(node('cikti.tablo'), {}, { status: 'bitti', ms: 0, cached: true, summary: '18 bulgu' }), 'önbellekten · 18 bulgu');
  });

  test('çalışmadıysa ayarlarının özeti', () => {
    assert.equal(nodeFooterText(node('kaynak.ornek', { sample: 'agora' }), {}, null), SAMPLES.agora.title);
    assert.equal(nodeFooterText(node('kaynak.ornek', { sample: 'bilinmeyen' }), {}, null), 'bilinmeyen');
    assert.equal(nodeFooterText(node('kaynak.kod', { path: 'a.js', text: 'abcd' }), {}, null), 'a.js · 4 karakter');
    assert.equal(nodeFooterText(node('kaynak.log', { path: 'x.log' }), {}, null), 'x.log · 0 karakter');
    assert.equal(nodeFooterText(node('kaynak.dosyalar', { files: [{}, {}] }), {}, null), '2 dosya');
    assert.equal(nodeFooterText(node('desen.ozel', { patterns: 'TODO\nFIXME', ignoreCase: true }), {}, null), '2 desen · ignoreCase');
    assert.equal(nodeFooterText(node('desen.ozel', { patterns: 'TODO' }), {}, null), '1 desen');
    assert.equal(nodeFooterText(node('molekul.ExactMatch', { strategy: 'auto' }), {}, null), 'strateji: auto');
    assert.equal(nodeFooterText(node('cikti.sarif', { filename: 'ios.sarif' }), {}, null), 'ios.sarif');
    assert.equal(nodeFooterText(node('uyarlayici.bulgu'), { badge: 'CodeScan' }, null), 'CodeScan');
    assert.equal(nodeFooterText(node('molekul.baska'), { subtitle: 'alt yazı' }, null), 'alt yazı');
    assert.equal(nodeFooterText(node('molekul.baska'), {}, null), '');
  });
});

describe('özellikler paneli: bağlantılar, karar kaydı, paket', () => {
  test('bağlantılar yön okuyla; klavyeyle bağlama yalnızca uyumlu ve boş girişleri önerir', () => {
    const wf = createWorkflow({ name: 'deneme' });
    addNode(wf, catalog, 'kaynak.ornek', { id: 'k1' });
    addNode(wf, catalog, 'uyarlayici.kaynak', { id: 'u1' });
    addNode(wf, catalog, 'molekul.ExactMatch', { id: 'm1' });
    addNode(wf, catalog, 'desen.secrets', { id: 'd1' });
    const k1 = wf.nodes[0];
    const u1 = wf.nodes[1];
    assert.deepEqual(connectOptions(wf, catalog, k1, compOf).map((o) => [JSON.parse(o.value), o.label]), [[['files', 'u1', 'files'], 'dosyalar → Kaynak → FASTA.Entry · dosyalar']]);
    assert.deepEqual(connectOptions(wf, catalog, u1, compOf).map((o) => JSON.parse(o.value)), [['entries', 'm1', 'entries']], 'tür uymayan girişler önerilmez');
    connect(wf, catalog, { node: 'k1', port: 'files' }, { node: 'u1', port: 'files' });
    connect(wf, catalog, { node: 'u1', port: 'entries' }, { node: 'm1', port: 'entries' });
    assert.deepEqual(connectOptions(wf, catalog, k1, compOf), [], 'aynı bağlantı ikinci kez önerilmez');
    assert.deepEqual(connectOptions(wf, catalog, u1, compOf), [], 'tek bağlantı alan dolu giriş önerilmez');
    assert.deepEqual(connectionItems(wf, u1, compOf).map((c) => c.label), ['← Örnek veri (files)', '→ ExactMatch (entries)']);
    assert.equal(connectionItems(wf, u1, compOf)[0].edge, wf.edges[0], 'silme düğmesi gerçek bağlantıyı alır');
  });

  test('karar kaydı: uygun atomlar ucuzdan pahalıya, uygun olmayanlar nedeniyle', () => {
    const m = decisionModel({
      requested: 'auto', selected: 'HorspoolSearch', why: '-',
      shape: { n: 1000, sigma: 4, sigmaEff: 3.9, k: 2, mMin: 8, mMax: 12, mMean: 10, sampled: false },
      estimates: { WuManberSearch: { applicable: true, ms: 2 }, HorspoolSearch: { applicable: true, ms: 1 }, ShiftOrSearch: { applicable: false, reason: 'çok uzun' } },
    });
    assert.equal(m.requested, '');
    assert.deepEqual(m.bars.map((b) => [b.short, b.selected, b.width, b.value]), [['Horspool', true, 50, `${nf(1, 3)} ms`], ['WuManber', false, 100, `${nf(2, 3)} ms`]]);
    assert.deepEqual(m.unfit, [{ short: 'ShiftOr', reason: 'uygun değil: çok uzun' }]);
    assert.deepEqual(m.shape.find(([k]) => k === 'mMin / mMax'), ['mMin / mMax', '8 / 12']);
    assert.deepEqual(m.shape.at(-1), ['örneklendi', 'hayır (tam sayım)']);
    const forced = decisionModel({ requested: 'KmpSearch', selected: 'KmpSearch', shape: { sampled: true } });
    assert.equal(forced.requested, ' (istenen: KmpSearch)');
    assert.deepEqual([forced.bars, forced.unfit], [[], []]);
    assert.deepEqual(forced.shape.at(-1), ['örneklendi', 'evet (64 × 256 karakter)']);
  });

  test('paketin beklenen sonucu: tek dalda sayı, birden çok dalda dal adlarıyla', () => {
    assert.equal(expectedText(packageById('teknik-borc').expected), '18 bulgu');
    assert.equal(expectedText(packageById('tek-desen').expected), `tek desen dalı: ${nf(882, 0)} · 16 desen dalı: ${nf(7715, 0)}`);
    assert.equal(expectedText({ bulgu: 121, baska: 3 }), 'molekül dalı: 121 · baska: 3', 'adı bilinmeyen dal anahtarıyla yazılır');
  });
});

describe('bileşen paleti', () => {
  test('arama Türkçe küçük harfe çevrilir ve kırpılır', () => {
    assert.equal(normalizeQuery('  İÇERİK '), 'içerik');
    assert.equal(normalizeQuery(undefined), '');
  });

  test('ad, rozet, kategori ve uç türüne göre bulur; boş arama hepsini gösterir', () => {
    const tablo = catalog.get('cikti.tablo');
    assert.ok(matchesQuery(tablo, ''));
    assert.ok(matchesQuery(tablo, 'tablo'));
    assert.ok(matchesQuery(tablo, 'finding'), 'giriş türü');
    assert.ok(matchesQuery(tablo, 'çıktılar'), 'kategori, Türkçe küçük harf');
    assert.ok(!matchesQuery(tablo, 'sarif'));
  });

  test('gruplar katalogdaki kategori sırasıyla; uyan bileşeni olmayan kategori atlanır', () => {
    const all = paletteGroups(catalog, '');
    assert.deepEqual(all.map((g) => g.category), catalog.categories);
    assert.equal(all.reduce((s, g) => s + g.items.length, 0), catalog.size);
    const sarif = paletteGroups(catalog, 'sarif');
    assert.deepEqual(sarif.map((g) => g.category), ['ÇIKTILAR']);
    assert.deepEqual(paletteGroups(catalog, 'böyle-bir-şey-yok'), []);
  });

  test('düğme: rozet yoksa alt yazı, o da yoksa çıkış türü; ekran okuyucu adı görünen yazıyla başlar', () => {
    const kaynak = paletteItem(catalog.get('uyarlayici.kaynak'));
    assert.equal(kaynak.badge, 'sourceToEntry');
    assert.equal(kaynak.ariaLabel, 'Kaynak → FASTA.Entry sourceToEntry: tuvale ekle (UYARLAYICILAR)');
    assert.equal(kaynak.title.split('\n')[1], 'Giriş: Source.File · Çıkış: FASTA.Entry');
    assert.equal(paletteItem(catalog.get('molekul.ExactMatch')).badge, 'maliyet modeli');
    assert.equal(paletteItem(catalog.get('kaynak.ornek')).badge, 'Source.File');
    assert.equal(paletteItem(catalog.get('cikti.tablo')).badge, '');
    assert.equal(paletteItem(catalog.get('cikti.tablo')).title.split('\n')[1], 'Giriş: Finding · Çıkış: —');
    assert.equal(paletteItem(catalog.get('cikti.tablo')).ariaLabel, 'Bulgu tablosu: tuvale ekle (ÇIKTILAR)');
  });
});

describe('gerçek bir paketle: rozet ve tablolar motorun çıktısıyla tutarlı', () => {
  for (const id of ['teknik-borc', 'gizli-bilgi']) {
    test(id, async () => {
      const p = packageById(id);
      const wf = deserializeWorkflow(p.build(), catalog);
      const res = await runWorkflow(wf, catalog, { loadSample: loadSampleNode, yieldEvery: 0 });
      // Atölyenin çalıştırıcısı (web/core.js) motorun sonucunu bu biçime indirger.
      const nodes = Object.fromEntries(Object.entries(res.nodes).map(([nid, r]) => [nid, { status: r.status, ms: r.ms, info: r.info, error: r.error }]));
      const run = { ok: res.ok, problems: res.problems, totalMs: 10, nodes };
      const gate = wf.nodes.some((n) => n.type === 'cikti.kapi');
      const badge = badgeModel({ running: false, run, dirty: false, nodes: wf.nodes });
      assert.equal(badge.text, `bitti: ${p.expected.bulgu} bulgu, ${fmtMs(10)}${gate ? ' · kapı kaldı' : ''}`);
      assert.equal(badge.state, gate ? 'gate' : 'done');
      for (const n of wf.nodes.filter((x) => x.type === 'cikti.tablo')) {
        const list = nodes[n.id].info.findings;
        assert.equal(findingsHeading(n.id, list.length), `Bulgu tablosu (${n.id}) · ${p.expected.bulgu} bulgu`);
        for (const f of list) assert.match(findingRow(f).loc, /^[^:]+:\d+:\d+$/);
      }
      for (const n of wf.nodes) assert.notEqual(nodeFooterText(n, compOf(n), nodes[n.id]), '', n.id);
    });
  }
});
