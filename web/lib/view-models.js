// Görünüm modelleri (view model): görünümlerin DOM'a bağlı olmayan mantığı.
// Her işlev düz veriden (iş akışı, çalıştırma sonucu, denetim bulguları, katalog) ekranda
// yazacak metni, sırayı ve oranları üretir; görünüm (web/views/) yalnızca bunları öğelere
// döker. Böylece arayüz mantığı tarayıcısız, node:test ile sınanır
// (tests/unit/view-models.test.js); öğe kurma kısmı ayrıca sahte bir DOM'la sınanır.
import { nf, fmtMs } from './format.js';
import { lintSummary } from '../../src/workflows/lint.js';
import { SAMPLES, parsePatternList } from '../../src/workflows/catalog.js';
import { canConnect } from '../../src/workflows/engine.js';

/** @typedef {import('../../src/contracts.js').Workflow} Workflow */
/** @typedef {import('../../src/contracts.js').WorkflowNode} WorkflowNode */
/** @typedef {import('../../src/contracts.js').WorkflowComponent} Component */
/** @typedef {import('../../src/contracts.js').Catalog} Catalog */
/** @typedef {{ status: string, ms?: number | null, summary?: string | null, info?: Record<string, any>, error?: string | null }} NodeRun */
/** @typedef {{ ok: boolean, totalMs?: number, problems?: Array<{ message: string }>, nodes: Record<string, NodeRun> }} RunResult */
/** @typedef {{ level: string, code: string, message: string, node?: string }} LintFinding */

/** Çubuğun yüzde genişliği (en büyük değere göre; en büyük değer 0 ise 0). */
export const barPct = (value, max) => (max > 0 ? (value / max) * 100 : 0);

// ------------------------------------------------------------------ durum rozeti
/**
 * Bütün "Eşleşme → Bulgu" kutularının bulgu sayılarının toplamı.
 * @param {RunResult} run
 * @param {WorkflowNode[]} nodes
 */
export function findingTotal(run, nodes) {
  return nodes.filter((n) => n.type === 'uyarlayici.bulgu').reduce((sum, n) => sum + (run.nodes[n.id]?.info?.count ?? 0), 0);
}

/**
 * Durum rozetinin yazısı ve durumu (running, idle, error, gate, done).
 * @param {{ running: boolean, run: RunResult | null, dirty: boolean, nodes: WorkflowNode[] }} s
 * @returns {{ text: string, state: string }}
 */
export function badgeModel({ running, run, dirty, nodes }) {
  if (running) return { text: 'çalışıyor…', state: 'running' };
  if (!run) return { text: 'çalışmadı', state: 'idle' };
  if (dirty) return { text: 'çalışmadı (değişiklik var)', state: 'idle' };
  if (!run.ok) {
    const first = run.problems?.[0]?.message ?? Object.values(run.nodes).find((r) => r.status === 'hata')?.error ?? 'bilinmeyen hata';
    return { text: `hata: ${first}`, state: 'error' };
  }
  const n = findingTotal(run, nodes);
  const gate = Object.values(run.nodes).some((r) => r.info?.gate === 'kaldı');
  return { text: `bitti: ${nf(n, 0)} bulgu, ${fmtMs(run.totalMs)}${gate ? ' · kapı kaldı' : ''}`, state: gate ? 'gate' : 'done' };
}

// ------------------------------------------------------------------ bulgu tablosu
export const FINDINGS_LIMIT = 500;
const SEVERITY = { error: 'hata', warning: 'uyarı', note: 'not' };

/** Bulgular sekmesi boşsa gösterilecek ileti; gösterilecek tablo varsa null. */
export function findingsEmptyText(run, dirty, tableCount) {
  if (!run) return dirty ? 'İş akışı değişti; sonuçları görmek için yeniden çalıştırın.' : 'Henüz çalıştırılmadı. Soldan bir hazır paket seçin ya da kutuları bağlayıp "Tarayıcıda çalıştır"a basın.';
  if (!tableCount) return 'Bu iş akışında "Bulgu tablosu" kutusu yok; sayılar Özet sekmesinde.';
  return null;
}

/** Bulgu tablosunun başlığı; sınırı aşan tabloda yalnızca ilk satırların gösterildiği yazılır. */
export function findingsHeading(id, count, limit = FINDINGS_LIMIT) {
  return `Bulgu tablosu (${id}) · ${nf(count, 0)} bulgu${count > limit ? ` · ilk ${limit} gösteriliyor` : ''}`;
}

/**
 * Bir bulgunun tablo satırı: konum, desen, kural (önemiyle) ve önizleme parçaları.
 * @param {{ file: string, line: number, column: number, pattern: string, ruleId?: string, severity?: string, preview?: { before: string, hit: string, after: string } }} f
 */
export function findingRow(f) {
  const pv = f.preview;
  return {
    loc: `${f.file}:${f.line}:${f.column}`,
    pattern: f.pattern,
    rule: f.ruleId ?? '',
    severity: f.severity ?? '',
    severityTitle: f.severity ? `önem: ${SEVERITY[f.severity] ?? f.severity}` : '',
    preview: pv ? { before: pv.before, hit: pv.hit, after: pv.after, title: pv.before + pv.hit + pv.after } : null,
  };
}

// ------------------------------------------------------------------ özet
/** Kapı kutusunun sayacı: kaldı mı, geçti mi, çıkış kodu. */
export function gateCounter(info) {
  const failed = info.gate === 'kaldı';
  return { failed, value: failed ? 'KALDI' : 'GEÇTİ', label: failed ? `kapı: ${info.count} bulgu → çıkış kodu 1` : 'kapı: bulgu yok → çıkış kodu 0' };
}

/** Desenlere göre özet çubukları (en çok bulgulu desene göre oran). */
export function patternBars(byPattern) {
  const max = Math.max(1, ...byPattern.map((x) => x[1]));
  return byPattern.map(([pattern, count]) => ({ pattern, count: nf(count, 0), width: barPct(count, max) }));
}

// ------------------------------------------------------------------ atom yarışı
/**
 * Atom yarışı tablosu: satırlar ölçülen süreye göre sıralı; çubuklar ölçülen ve tahmin edilen
 * sürelerin en büyüğüne göre.
 * @param {{ rows: Array<{ name: string, ms: number, estimatedMs?: number | null, applicable?: boolean, reason?: string }>, fastest: string, selected: string, node: string, records: number, chars: number, patterns: number, reps: number }} rc
 */
export function raceModel(rc) {
  const rows = [...rc.rows].sort((a, b) => a.ms - b.ms);
  const maxMs = Math.max(...rows.map((r) => r.ms), ...rows.map((r) => r.estimatedMs ?? 0));
  return {
    note: `Tarayıcı ölçümü gösterim amaçlıdır; rapordaki sayılar Node ölçümleridir (bench/results). Girdi (${rc.node}): ${nf(rc.records, 0)} kayıt, ${nf(rc.chars, 0)} karakter, ${rc.patterns} desen; her atom ısınma + ${rc.reps} tekrarın medyanı, dönüşümlü sırayla. En hızlı: ${rc.fastest}; molekülün seçimi: ${rc.selected}${rc.fastest === rc.selected ? ' (aynı)' : ''}.`,
    rows: rows.map((r) => ({
      name: r.name,
      selected: r.name === rc.selected,
      ms: fmtMs(r.ms),
      width: barPct(r.ms, maxMs),
      est: r.estimatedMs == null ? '—' : fmtMs(r.estimatedMs),
      estWidth: r.estimatedMs == null ? null : barPct(r.estimatedMs, maxMs),
      note: [r.name === rc.fastest ? 'en hızlı' : '', r.name === rc.selected ? 'molekülün seçimi' : '', r.applicable ? '' : `uygun değil: ${r.reason}`].filter(Boolean).join(' · '),
    })),
  };
}

// ------------------------------------------------------------------ denetim
const LINT_RANK = { hata: 3, 'uyarı': 2, bilgi: 1 };

/** @param {LintFinding[]} list */
export function lintNote(list) {
  const s = lintSummary(list);
  return `Denetim her değişiklikte kendiliğinden yenilenir (kurala dayalı; çalıştırmadan önce). ${s.hata} hata, ${s['uyarı']} uyarı, ${s.bilgi} bilgi. Komut satırı: ios workflow lint is-akisi.json`;
}

/** Denetim sekmesinin adı (hata + uyarı sayısı) ve düzeyi. @param {LintFinding[]} list */
export function lintTab(list) {
  const s = lintSummary(list);
  const n = s.hata + s['uyarı'];
  return { text: n ? `Denetim (${n})` : 'Denetim', level: s.hata ? 'hata' : s['uyarı'] ? 'uyarı' : '' };
}

/** Bir kutunun en önemli denetim bulgusu (kutu çerçevesindeki işaret); yoksa null. @param {LintFinding[]} list */
export function strongestLint(list, id) {
  let best = null;
  for (const f of list) if (f.node === id && (!best || LINT_RANK[f.level] > LINT_RANK[best.level])) best = f;
  return best;
}

// ------------------------------------------------------------------ tuvaldeki kutu
/**
 * Kutunun alt satırı: çalıştıysa süre ve özet, çalışmadıysa ayarlarından kısa bir özet.
 * @param {WorkflowNode} node
 * @param {{ badge?: string, subtitle?: string }} comp
 * @param {NodeRun | null | undefined} r
 */
export function nodeFooterText(node, comp, r) {
  if (r) {
    if (r.status === 'çalışıyor') return 'çalışıyor…';
    if (r.status === 'bitti') return `${fmtMs(r.ms)} · ${r.summary ?? r.info?.summary ?? ''}`;
    return `${r.status}: ${r.error ?? ''}`;
  }
  const p = node.params ?? {};
  switch (node.type) {
    case 'kaynak.ornek': return SAMPLES[p.sample]?.title ?? p.sample;
    case 'kaynak.kod': case 'kaynak.log': case 'kaynak.fasta': return `${p.path} · ${String(p.text ?? '').length} karakter`;
    case 'kaynak.dosyalar': return `${(p.files ?? []).length} dosya`;
    case 'desen.ozel': return `${parsePatternList(p.patterns).length} desen${p.ignoreCase ? ' · ignoreCase' : ''}`;
    case 'molekul.ExactMatch': return `strateji: ${p.strategy}`;
    case 'cikti.jsonl': case 'cikti.sarif': return p.filename;
    default: return comp.badge ?? comp.subtitle ?? '';
  }
}

// ------------------------------------------------------------------ özellikler paneli
/**
 * Kutunun bağlantıları, yön okuyla okunur etiketleriyle.
 * @param {Workflow} wf
 * @param {WorkflowNode} node
 * @param {(n: WorkflowNode) => Component} compOf
 */
export function connectionItems(wf, node, compOf) {
  return wf.edges.filter((e) => e.from.node === node.id || e.to.node === node.id).map((e) => {
    const out = e.from.node === node.id;
    const other = wf.nodes.find((n) => n.id === (out ? e.to.node : e.from.node));
    return { edge: e, label: out ? `→ ${compOf(other).title} (${e.to.port})` : `← ${compOf(other).title} (${e.from.port})` };
  });
}

/**
 * Klavyeyle bağlama seçenekleri: bu kutunun çıkışlarından tuvaldeki uyumlu ve boş girişlere.
 * @param {Workflow} wf
 * @param {Catalog} catalog
 * @param {WorkflowNode} node
 * @param {(n: WorkflowNode) => Component} compOf
 */
export function connectOptions(wf, catalog, node, compOf) {
  const options = [];
  for (const out of compOf(node).outputs) {
    for (const other of wf.nodes) {
      if (other.id === node.id) continue;
      for (const inp of compOf(other).inputs) {
        if (canConnect(wf, catalog, { node: node.id, port: out.name }, { node: other.id, port: inp.name }).ok) {
          options.push({ value: JSON.stringify([out.name, other.id, inp.name]), label: `${out.label ?? out.name} → ${compOf(other).title} · ${inp.label ?? inp.name}` });
        }
      }
    }
  }
  return options;
}

/**
 * Molekülün karar kaydı: girdinin şekli, uygun atomların tahmini süreleri (en ucuzdan
 * pahalıya) ve uygun olmayanların nedeni.
 * @param {{ requested: string, selected: string, why?: string, estimates?: Record<string, { applicable: boolean, ms?: number, reason?: string }>, shape?: Record<string, any> }} rec
 */
export function decisionModel(rec) {
  const est = Object.entries(rec.estimates ?? {});
  const ok = est.filter(([, e]) => e.applicable).sort((a, b) => a[1].ms - b[1].ms);
  const na = est.filter(([, e]) => !e.applicable);
  const max = Math.max(...ok.map(([, e]) => e.ms), 1e-9);
  const sh = rec.shape ?? {};
  return {
    requested: rec.requested !== 'auto' ? ` (istenen: ${rec.requested})` : '',
    shape: [['n (ilk kayıt)', sh.n], ['σ', sh.sigma], ['σe (etkin)', sh.sigmaEff], ['k', sh.k], ['mMin / mMax', `${sh.mMin} / ${sh.mMax}`], ['mMean', sh.mMean], ['örneklendi', sh.sampled ? 'evet (64 × 256 karakter)' : 'hayır (tam sayım)']]
      .map(([k, v]) => [k, String(v)]),
    bars: ok.map(([name, e]) => ({ name, short: name.replace('Search', ''), selected: name === rec.selected, width: barPct(e.ms, max), value: `${nf(e.ms, 3)} ms`, title: `${name}: ${e.ms} ms (tahmin)` })),
    unfit: na.map(([name, e]) => ({ short: name.replace('Search', ''), reason: `uygun değil: ${e.reason}` })),
  };
}

const EXPECTED_LABELS = { bulgu: 'molekül dalı', bulgu_atom: 'tek atom dalı', tek_bulgu: 'tek desen dalı', cok_bulgu: '16 desen dalı' };

/** Hazır paketin beklenen sonucu: tek dalda "N bulgu", birden çok dalda dal adlarıyla. */
export function expectedText(expected) {
  const keys = Object.keys(expected);
  return keys.length === 1 ? `${nf(expected[keys[0]], 0)} bulgu` : keys.map((k) => `${EXPECTED_LABELS[k] ?? k}: ${nf(expected[k], 0)}`).join(' · ');
}

// ------------------------------------------------------------------ bileşen paleti
/** Arama kutusundaki metin: kırpılmış, Türkçe kurallarla küçük harf. */
export const normalizeQuery = (value) => String(value ?? '').trim().toLocaleLowerCase('tr-TR');

/** Arama metni bir bileşene uyuyor mu? (ad, açıklama, kategori, tür, uç türleri) @param {Component} c */
export function matchesQuery(c, q) {
  if (!q) return true;
  return [c.title, c.subtitle, c.badge, c.category, c.help, c.type, ...c.inputs.map((p) => p.type), ...c.outputs.map((p) => p.type)]
    .filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(q);
}

/** Aramaya uyan bileşenler, katalogdaki kategori sırasıyla; boş kategoriler atlanır. @param {Catalog} catalog */
export function paletteGroups(catalog, q) {
  const groups = [];
  for (const category of catalog.categories) {
    const items = [...catalog.values()].filter((c) => c.category === category && matchesQuery(c, q));
    if (items.length) groups.push({ category, items });
  }
  return groups;
}

/**
 * Bileşen düğmesinin rozeti, ipucu ve ekran okuyucu adı. Ad görünen yazıyla (ad + rozet)
 * başlar, sonra ne yapılacağını söyler (WCAG 2.5.3).
 * @param {Component} c
 */
export function paletteItem(c) {
  const badge = c.badge ?? c.subtitle ?? (c.outputs[0]?.type ?? '');
  return {
    badge,
    title: `${c.help ?? ''}\nGiriş: ${c.inputs.map((p) => p.type).join(', ') || '—'} · Çıkış: ${c.outputs.map((p) => p.type).join(', ') || '—'}`,
    ariaLabel: `${[c.title, badge].filter(Boolean).join(' ')}: tuvale ekle (${c.category})`,
  };
}
