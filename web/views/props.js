// Özellikler paneli: seçili kutunun ayarları, uçları, bağlantıları, karar kaydı; seçim yoksa
// iş akışının genel durumu. Ayarlar denetleyici üzerinden (geri alınabilir komutlarla) değişir.
import { state, catalog, doc, compOf, nodeById } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, h, isMac } from '../lib/dom.js';
import { nf, fmtMs, catClass, tyClass } from '../lib/format.js';
import { SHORTCUTS, keyLabel } from '../lib/shortcuts.js';
import { TYPES } from '../../src/workflows/catalog.js';
import { validateWorkflow } from '../../src/workflows/engine.js';
import { packageById } from '../../src/workflows/packages.js';
import { lintSummary } from '../../src/workflows/lint.js';
import { runnerMode } from '../runner.js';
import { connectionItems, connectOptions, decisionModel, expectedText } from '../lib/view-models.js';
import * as act from '../actions.js';

const TYPE_ORDER = ['Source.File', 'FASTA.Entry', 'Pattern.Set', 'Sequence.Match', 'Finding'];

export function chip(type) {
  return h('span', { class: 'chip', title: TYPES[type] ?? '' }, h('i', { class: tyClass(type) }), type);
}

const kbd = (k) => h('span', { class: 'kbd', text: keyLabel(k, isMac()) });
export function shortcutKeys(sc) {
  const join = (keys) => keys.flatMap((k, i) => (i ? [' + ', kbd(k)] : [kbd(k)]));
  return [...join(sc.keys), ...(sc.alt ? [' ya da ', ...join(sc.alt)] : [])];
}

function paramField(node, p) {
  const id = `p-${node.id}-${p.key}`;
  const val = node.params[p.key];
  const set = (v, rerender = false) => act.setParam(node, p.key, v, { rerender });
  const seal = () => act.sealHistory();
  if (p.kind === 'bool') {
    return h('div', { class: 'field' }, h('label', { class: 'check' },
      h('input', { type: 'checkbox', id, checked: Boolean(val), onchange: (e) => set(e.target.checked) }), p.label));
  }
  if (p.kind === 'select') {
    const sel = h('select', { id, onchange: (e) => set(e.target.value, true) }, ...p.options.map((o) => h('option', { value: o.value, selected: o.value === val, text: o.label })));
    return h('div', { class: 'field' }, h('label', { class: 'l', for: id, text: p.label }), sel);
  }
  if (p.kind === 'textarea') {
    const ta = /** @type {HTMLTextAreaElement} */ (h('textarea', { id, rows: '6', spellcheck: 'false', oninput: (e) => set(e.target.value), onchange: seal }));
    ta.value = val ?? '';
    const extra = p.upload ? h('input', {
      type: 'file', 'aria-label': `${p.label}: dosyadan yükle`,
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        act.setParams(node, { [p.key]: await f.text(), path: f.name }, 'Dosyadan yükleme');
      },
    }) : null;
    return h('div', { class: 'field' }, h('label', { class: 'l', for: id, text: p.label }), ta, extra);
  }
  if (p.kind === 'files') {
    const list = val ?? [];
    return h('div', { class: 'field' },
      h('label', { class: 'l', for: id, text: p.label }),
      h('input', {
        id, type: 'file', multiple: true,
        onchange: async (e) => {
          const files = [...e.target.files];
          const read = await Promise.all(files.map(async (f) => ({ path: f.webkitRelativePath || f.name, text: await f.text() })));
          act.setParams(node, { [p.key]: [...(node.params[p.key] ?? []), ...read] }, 'Dosya yükleme');
        },
      }),
      list.length ? h('ul', { class: 'conn-list', style: { marginTop: '6px' } }, ...list.map((f, i) => h('li', {},
        h('span', { class: 'mono', text: `${f.path} · ${nf(f.text.length, 0)} karakter` }),
        h('button', { type: 'button', onclick: () => set(list.filter((_, j) => j !== i), true), 'aria-label': `${f.path} dosyasını çıkar`, text: 'çıkar' })))) : h('p', { class: 'sub', text: 'Henüz dosya yok.' }));
  }
  const inp = /** @type {HTMLInputElement} */ (h('input', { id, type: 'text', oninput: (e) => set(e.target.value), onchange: seal, autocomplete: 'off' }));
  inp.value = val ?? '';
  return h('div', { class: 'field' }, h('label', { class: 'l', for: id, text: p.label }), inp);
}

function connectionsOf(node) {
  const comp = compOf(node);
  const items = connectionItems(doc.wf, node, compOf).map(({ edge, label }) =>
    h('li', {}, h('span', { text: label }), h('button', { type: 'button', text: 'sil', 'aria-label': `Bağlantıyı sil: ${label}`, onclick: () => act.removeEdge(edge) })));
  // Klavyeyle bağlantı: bu kutunun bir çıkışından uyumlu bir girişe
  const options = connectOptions(doc.wf, catalog, node, compOf);
  const sel = /** @type {HTMLSelectElement} */ (h('select', { id: 'bagla-sec', 'aria-label': 'Bağlanacak giriş' }, ...options.map((o) => h('option', { value: o.value, text: o.label }))));
  return h('div', {},
    items.length ? h('ul', { class: 'conn-list' }, ...items) : h('p', { class: 'sub', text: 'Bağlantı yok.' }),
    comp.outputs.length ? h('div', { class: 'field', style: { marginTop: '8px' } },
      h('label', { class: 'l', for: 'bagla-sec', text: 'Klavyeyle bağla (uyumlu girişler)' }),
      options.length ? h('div', { class: 'row' }, sel, h('button', {
        type: 'button', text: 'Bağla',
        onclick: () => {
          const [port, target, tport] = JSON.parse(sel.value);
          act.connectPorts({ node: node.id, port, side: 'out' }, { node: target, port: tport, side: 'in' });
        },
      })) : h('p', { class: 'sub', text: 'Tuvalde bu kutunun çıkışını alabilecek boş bir giriş yok.' })) : null);
}

function recordView(rec, info) {
  const m = decisionModel(rec);
  return h('div', {},
    h('h3', { text: 'Karar kaydı (record)' }),
    h('p', {}, 'Seçilen atom: ', h('b', { text: rec.selected }), m.requested),
    h('dl', { class: 'kv' }, ...m.shape.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
    h('h3', { text: 'Atomların tahmini süresi' }),
    h('div', { class: 'bars', role: 'list' }, ...m.bars.map((b) => h('div', { class: `bar${b.selected ? ' selected' : ''}`, role: 'listitem', title: b.title },
      h('span', { class: 'n', text: b.short }),
      h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${b.width}%` } })),
      h('span', { class: 'v', text: b.value }))),
    ...m.unfit.map((u) => h('div', { class: 'bar na', role: 'listitem' }, h('span', { class: 'n', text: u.short }), h('span', { class: 'sub', text: u.reason }), h('span')))),
    h('h3', { text: 'Neden' }),
    h('p', { class: 'why', text: rec.why }),
    info?.searchMs != null ? h('p', { class: 'sub', text: `Karar + arama bu tarayıcıda ${fmtMs(info.searchMs)} sürdü; ${nf(info.count, 0)} eşleşme.` }) : null);
}

function packageInfo() {
  const p = state.pkg && packageById(state.pkg);
  if (!p) return null;
  const expected = expectedText(p.expected);
  return h('section', { class: 'pkg', 'aria-label': 'Hazır paket' },
    h('h3', { text: `Paket: # ${p.channel}` }),
    h('p', { text: p.summary }),
    h('p', {}, h('b', { text: 'Beklenen sonuç: ' }), expected),
    h('details', {}, h('summary', { text: 'Aynı işi yapan komut satırı' }), ...p.cli.map((c) => h('code', { class: 'cmd', text: c }))));
}

function nodeView(box, node) {
  const comp = compOf(node);
  const r = state.run && !state.dirty ? state.run.nodes[node.id] : null;
  const race = state.race;
  box.append(
    h('h2', {}, h('span', { class: catClass(comp.category), 'aria-hidden': 'true' }, h('span', { class: 'node-ico', text: comp.icon ?? '•' })), comp.title),
    h('p', { class: 'sub', text: `${comp.category} · kimlik: ${node.id}${comp.subtitle ? ' · ' + comp.subtitle : ''}` }),
    comp.help ? h('p', { class: 'note', text: comp.help }) : null);
  const lint = state.lint.filter((f) => f.node === node.id);
  if (lint.length) box.append(h('ul', { class: 'lint-list' }, ...lint.map((f) => h('li', { 'data-level': f.level }, h('b', { text: `${f.level}: ` }), f.message))));
  if (comp.manifest) {
    const m = comp.manifest;
    box.append(h('h3', { text: 'Manifest' }), h('dl', { class: 'kv' },
      ...[['name', m.name], ['kind', m.kind], ['task', m.task], ['version', m.version], ['kaynak', (m.references ?? []).join('; ') || '—']].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
  }
  if (comp.params?.length) box.append(h('h3', { text: 'Ayarlar' }), ...comp.params.map((p) => paramField(node, p)));
  box.append(h('h3', { text: 'Uçlar' }), h('ul', { class: 'ports-list' },
    ...comp.inputs.map((p) => h('li', {}, h('span', { text: `giriş: ${p.label ?? p.name}${p.multi ? ' (çoklu)' : ''}` }), chip(p.type))),
    ...comp.outputs.map((p) => h('li', {}, h('span', { text: `çıkış: ${p.label ?? p.name}` }), chip(p.type)))));
  box.append(h('h3', { text: 'Bağlantılar' }), connectionsOf(node));
  if (r) {
    box.append(h('h3', { text: 'Son çalıştırma' }), h('p', { class: r.status === 'bitti' ? 'sub' : 'problems' },
      `${r.status} · ${fmtMs(r.ms)}${r.info?.summary ? ' · ' + r.info.summary : ''}${r.error ? ' · ' + r.error : ''}`));
    if (r.info?.record) box.append(recordView(r.info.record, r.info));
  } else if (node.type === 'molekul.ExactMatch') {
    box.append(h('h3', { text: 'Karar kaydı (record)' }), h('p', { class: 'sub', text: 'İş akışını çalıştırınca burada veri şekli, her atomun tahmini süresi, seçilen atom ve nedeni görünür.' }));
  }
  if (node.type === 'molekul.ExactMatch' || node.type.startsWith('atom.')) {
    const pending = race?.pending && race.node === node.id;
    box.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { type: 'button', id: 'yaristir', disabled: !r || r.status !== 'bitti' || state.running || Boolean(race?.pending), onclick: () => act.race(node.id), text: pending ? 'Ölçülüyor…' : 'Atomları yarıştır' })),
      h('p', { class: 'sub', style: { marginTop: '6px' }, text: 'Aynı girdide bütün atomları bu tarayıcıda ölçer (ısınma + 5 tekrarın medyanı) ve molekülün tahminiyle yan yana koyar. Gösterim amaçlıdır; rapordaki sayılar Node ölçümleridir.' }));
  }
  box.append(h('div', { class: 'row', style: { marginTop: '14px' } },
    h('button', { type: 'button', id: 'cogalt', text: 'Çoğalt', title: 'Ctrl+D', onclick: () => act.duplicateSelection() }),
    h('button', { type: 'button', class: 'danger', text: 'Kutuyu sil', onclick: () => act.deleteSelection() })));
}

function workflowView(box) {
  const problems = validateWorkflow(doc.wf, catalog);
  const ls = lintSummary(state.lint);
  box.append(
    h('h2', { text: 'İş akışı' }),
    packageInfo(),
    h('p', { class: 'sub', text: `${doc.wf.nodes.length} kutu, ${doc.wf.edges.length} bağlantı · çalıştırma: ${runnerMode() === 'worker' ? 'Web Worker (arayüz donmaz)' : runnerMode()}` }),
    problems.length ? h('div', {}, h('h3', { text: 'Çalıştırmadan önce' }), h('ul', { class: 'problems' }, ...problems.map((p) => h('li', { text: p.message })))) : h('p', { class: 'note', text: doc.wf.nodes.length ? 'İş akışı çalıştırılmaya hazır.' : 'Soldan bir hazır paket seçin ya da bileşenleri tuvale sürükleyin.' }),
    state.lint.length ? h('p', { class: 'sub' }, `Denetim: ${ls.hata} hata, ${ls['uyarı']} uyarı, ${ls.bilgi} bilgi · `, h('button', { type: 'button', class: 'linkish', text: 'Denetim sekmesini aç', onclick: () => act.setTab('denetim') })) : null,
    h('h3', { text: 'Uç türleri' }),
    h('div', { class: 'legend' }, ...TYPE_ORDER.map(chip)),
    h('p', { class: 'sub', style: { marginTop: '6px' }, text: 'Yalnızca aynı türdeki uçlar bağlanır; uyumsuz bağlantı nedeniyle birlikte reddedilir.' }),
    h('h3', { text: 'Klavye' }),
    h('ul', { class: 'shortcuts' }, ...SHORTCUTS.slice(0, 5).map((sc) => h('li', {}, ...shortcutKeys(sc), `: ${sc.what}`))),
    h('button', { type: 'button', class: 'linkish', text: 'Bütün kısayollar (?)', onclick: () => bus.emit('kisayollar') }));
}

/** Paneli yeniden çizer; klavye odağı ve imleç konumu korunur. */
export function renderProps() {
  const box = $('props');
  const active = /** @type {HTMLInputElement | null} */ (document.activeElement);
  const keep = active && box.contains(active) && active.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  box.replaceChildren();
  const sel = state.sel;
  if (sel?.kind === 'edge') {
    const a = nodeById(sel.edge.from.node);
    const b = nodeById(sel.edge.to.node);
    const type = compOf(a).outputs.find((p) => p.name === sel.edge.from.port)?.type;
    box.append(h('h2', { text: 'Bağlantı' }),
      h('p', {}, `${compOf(a).title} · ${sel.edge.from.port} → ${compOf(b).title} · ${sel.edge.to.port}`),
      h('p', {}, chip(type)),
      h('button', { type: 'button', class: 'danger', text: 'Bağlantıyı sil', onclick: () => act.deleteSelection() }));
  } else if (sel?.kind === 'node' && nodeById(sel.id)) nodeView(box, nodeById(sel.id));
  else workflowView(box);
  if (keep) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(keep.id));
    if (el) {
      el.focus({ preventScroll: true });
      try { if (keep.start != null) el.setSelectionRange(keep.start, keep.end); } catch { /* seçimi olmayan öğe */ }
    }
  }
}

export function initProps() {
  bus.on('degisti', ({ structure, becameDirty }) => { if (structure || becameDirty) renderProps(); });
  bus.on('param', ({ rerender }) => { if (rerender) renderProps(); });
  for (const ev of ['secim', 'calisma', 'yaris', 'yuklendi']) bus.on(ev, renderProps);
  // Çalıştırıcı (Web Worker ya da ana iş parçacığı) hazır olunca panel hangisinin kullanıldığını yazar.
  bus.on('runner', () => { if (!state.sel) renderProps(); });
}

