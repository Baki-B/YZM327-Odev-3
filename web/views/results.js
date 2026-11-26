// Sonuç paneli: durum rozeti ve sekmeler (Bulgular, Özet, Açıklama, Atom yarışı, Denetim).
import { state, doc } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, h } from '../lib/dom.js';
import { nf, fmtMs } from '../lib/format.js';
import { LINT_RULES } from '../../src/workflows/lint.js';
import { badgeModel, findingTotal, findingsEmptyText, findingsHeading, findingRow, FINDINGS_LIMIT, gateCounter, patternBars, raceModel, lintNote, lintTab } from '../lib/view-models.js';
import * as act from '../actions.js';

export const TABS = ['bulgular', 'ozet', 'aciklama', 'yaris', 'denetim'];

export function setBadge() {
  const b = $('durum');
  const m = badgeModel({ running: state.running, run: state.run, dirty: state.dirty, nodes: doc.wf.nodes });
  b.textContent = m.text;
  b.dataset.state = m.state;
}

function previewCell(pv) {
  if (!pv) return h('td', { class: 'pv' });
  return h('td', { class: 'pv', title: pv.title }, pv.before, h('mark', { text: pv.hit }), pv.after);
}

function renderFindings(run, nodesOf) {
  const pb = $('panel-bulgular');
  pb.replaceChildren();
  const tables = nodesOf('cikti.tablo');
  const empty = findingsEmptyText(run, state.dirty, tables.length);
  if (empty) pb.append(h('p', { class: 'empty', text: empty }));
  for (const n of tables) {
    const list = run.nodes[n.id].info.findings ?? [];
    pb.append(h('h4', { text: findingsHeading(n.id, list.length) }),
      list.length ? h('table', { class: 'findings' },
        h('thead', {}, h('tr', {}, h('th', { text: 'dosya:satır:sütun' }), h('th', { text: 'desen' }), h('th', { text: 'kural' }), h('th', { text: 'satır' }))),
        h('tbody', {}, ...list.slice(0, FINDINGS_LIMIT).map(findingRow).map((r) => h('tr', {},
          h('td', { class: 'loc', text: r.loc }),
          h('td', { class: 'mono', text: r.pattern }),
          h('td', { class: 'mono rule', 'data-severity': r.severity, title: r.severityTitle, text: r.rule }),
          previewCell(r.preview))))) : h('p', { class: 'empty', text: 'Bulgu yok.' }));
  }
}

function renderSummary(run, nodesOf) {
  const po = $('panel-ozet');
  po.replaceChildren();
  if (!run) {
    po.append(h('p', { class: 'empty', text: 'Özet, çalıştırmadan sonra burada görünür.' }));
    return;
  }
  const counters = h('div', { class: 'counters' },
    h('div', { class: 'counter' }, h('b', { text: nf(findingTotal(run, doc.wf.nodes), 0) }), h('span', { text: 'toplam bulgu' })),
    h('div', { class: 'counter' }, h('b', { text: fmtMs(run.totalMs) }), h('span', { text: 'toplam süre (veri yükleme dahil)' })),
    ...nodesOf('cikti.kapi').map((n) => {
      const g = gateCounter(run.nodes[n.id].info);
      return h('div', { class: `counter ${g.failed ? 'bad' : 'good'}` }, h('b', { text: g.value }), h('span', { text: g.label }));
    }),
    ...doc.wf.nodes.filter((n) => n.type === 'molekul.ExactMatch' && run.nodes[n.id]?.info?.record).map((n) => h('div', { class: 'counter' }, h('b', { style: { fontSize: '16px' }, text: run.nodes[n.id].info.record.selected.replace('Search', '') }), h('span', { text: `molekülün seçimi (${n.id})` }))));
  po.append(counters);
  const cols = h('div', { class: 'cols' });
  for (const n of nodesOf('cikti.ozet')) {
    const info = run.nodes[n.id].info;
    cols.append(h('div', {},
      h('h4', { text: `Özet (${n.id}) · ${nf(info.total, 0)} bulgu` }),
      h('div', { class: 'bars' }, ...patternBars(info.byPattern).map((b) => h('div', { class: 'bar' }, h('span', { class: 'n mono', text: b.pattern }), h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${b.width}%`, background: 'var(--t-find)' } })), h('span', { class: 'v', text: b.count })))),
      info.byFile.length > 1 ? h('details', {}, h('summary', { text: `Dosyalara göre (ilk ${info.byFile.length})` }), h('ul', { class: 'conn-list' }, ...info.byFile.map(([f, c]) => h('li', {}, h('span', { class: 'mono', text: f }), h('b', { text: String(c) }))))) : null));
  }
  for (const n of nodesOf('cikti.jsonl')) {
    const info = run.nodes[n.id].info;
    cols.append(h('div', {}, h('h4', { text: `JSONL (${n.id})` }),
      h('p', { class: 'sub', text: `${info.summary} Biçim: ios scan --json ile aynı.` }),
      h('button', { type: 'button', text: `${info.filename} indir`, onclick: () => act.downloadOutput(info.filename, info.jsonl, 'application/x-ndjson') })));
  }
  for (const n of nodesOf('cikti.sarif')) {
    const info = run.nodes[n.id].info;
    cols.append(h('div', {}, h('h4', { text: `SARIF (${n.id})` }),
      h('p', { class: 'sub', text: `${info.summary} Biçim: ios scan --format sarif ile aynı; GitHub kod taramasına yüklenebilir.` }),
      h('button', { type: 'button', class: 'sarif-indir', text: `${info.filename} indir`, onclick: () => act.downloadOutput(info.filename, info.sarif, 'application/sarif+json') })));
  }
  po.append(cols);
  po.append(h('div', { class: 'row', style: { marginTop: '10px' } },
    h('button', { type: 'button', id: 'kayit-indir', text: 'Çalıştırma kaydını indir (JSON)', onclick: () => act.exportRunRecord() }),
    h('span', { class: 'sub', text: 'İş akışı, bileşen sürümleri, girdi dosyalarının SHA-256 özetleri, her kutunun süresi ve molekülün kararı: sonucu başkası aynı girdiyle yeniden üretebilir.' })));
}

function renderExplain() {
  const pa = $('panel-aciklama');
  pa.replaceChildren(
    state.explain ? h('pre', { class: 'explain', text: state.explain }) : h('p', { class: 'empty', text: '"Açıkla" düğmesi iş akışını düz Türkçe cümlelerle anlatır (kurala dayalı; yapay zekâ servisi kullanılmaz).' }),
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { type: 'button', id: 'mermaid-indir', text: 'Diyagram olarak indir (Mermaid)', onclick: () => act.exportMermaid() }),
      h('span', { class: 'sub', text: 'GitHub, GitLab ve birçok belge aracı Mermaid diyagramını Markdown içinde çizer. Komut satırı: ios workflow diagram is-akisi.json' })));
}

function renderRace() {
  const py = $('panel-yaris');
  py.replaceChildren();
  const rc = state.race;
  if (!rc) py.append(h('p', { class: 'empty', text: 'Bir ExactMatch ya da atom kutusunu seçip özellikler panelindeki "Atomları yarıştır" düğmesine basın (önce iş akışını çalıştırın).' }));
  else if (rc.pending) py.append(h('p', { class: 'empty', text: 'Atomlar bu tarayıcıda ölçülüyor (Web Worker içinde; arayüz donmaz)…' }));
  else if (rc.error) py.append(h('p', { class: 'problems', text: rc.error }));
  else {
    const m = raceModel(rc);
    py.append(
      h('p', { class: 'note', text: m.note }),
      h('table', { class: 'race' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Atom' }), h('th', { text: 'ölçülen (medyan)' }), h('th', {}), h('th', { text: 'molekülün tahmini' }), h('th', {}), h('th', { text: 'not' }))),
        h('tbody', {}, ...m.rows.map((r) => h('tr', { class: r.selected ? 'sel' : '' },
          h('td', { text: r.name }),
          h('td', { class: 'num', text: r.ms }),
          h('td', {}, h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${r.width}%` } }))),
          h('td', { class: 'num', text: r.est }),
          h('td', {}, r.estWidth == null ? null : h('div', { class: 'track' }, h('div', { class: 'fill est', style: { width: `${r.estWidth}%` } }))),
          h('td', { text: r.note }))))),
      h('p', { class: 'sub', style: { marginTop: '6px' }, text: 'Tahminler kalibrasyon makinesine göredir (bench/results/calibration.json); tarayıcı ve makine farklı olduğu için mutlak değerler değil, sıralama karşılaştırılmalıdır.' }));
  }
}

function renderLint() {
  const pd = $('panel-denetim');
  pd.replaceChildren();
  const list = state.lint;
  pd.append(h('p', { class: 'note', text: lintNote(list) }));
  if (!list.length) {
    pd.append(h('p', { class: 'empty', text: 'Sorun bulunmadı: her kutu bağlı, sonuç gösteren bir kutu var, ad ve hedef yazılmış.' }));
    return;
  }
  pd.append(h('ul', { class: 'lint-list' }, ...list.map((f) => h('li', { 'data-level': f.level },
    h('b', { text: `${f.level}: ` }), f.message, ' ',
    h('span', { class: 'sub', text: `(${f.code}: ${LINT_RULES[f.code]?.title ?? ''})` }),
    f.node ? h('button', { type: 'button', class: 'linkish', text: 'kutuya git', onclick: () => { act.select({ kind: 'node', id: f.node }); bus.emit('odak', { id: f.node }); } }) : null))));
}

export function renderResults() {
  const run = state.run && !state.dirty ? state.run : null;
  const nodesOf = (type) => doc.wf.nodes.filter((n) => n.type === type && run?.nodes[n.id]?.status === 'bitti');
  renderFindings(run, nodesOf);
  renderSummary(run, nodesOf);
  renderExplain();
  renderRace();
  renderLint();
  updateLintTab();
}

function updateLintTab() {
  const t = lintTab(state.lint);
  const tab = $('sekme-denetim');
  tab.textContent = t.text;
  tab.dataset.level = t.level;
}

export function showTab() {
  for (const t of TABS) {
    $(`sekme-${t}`).setAttribute('aria-selected', String(t === state.tab));
    $(`sekme-${t}`).tabIndex = t === state.tab ? 0 : -1;
    $(`panel-${t}`).hidden = t !== state.tab;
  }
  $('sonuclar').classList.remove('collapsed');
  $('sonuc-katla').setAttribute('aria-expanded', 'true');
}

export function initResults() {
  bus.on('degisti', () => { setBadge(); renderLint(); updateLintTab(); if (state.tab === 'aciklama') renderExplain(); });
  for (const ev of ['calisma', 'yuklendi']) bus.on(ev, () => { setBadge(); renderResults(); });
  bus.on('yaris', renderRace);
  bus.on('sekme', () => { showTab(); renderResults(); });
}
