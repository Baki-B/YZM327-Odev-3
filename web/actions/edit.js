// Denetleyici: düzenleme. Kutu ekleme, taşıma, bağlama, silme, ayar değiştirme, geri al /
// yinele, kopyala / yapıştır / çoğalt. Her değişiklik geri alınabilir bir komuttur
// (src/workflows/history.js).
import { catalog, doc, history, state, compOf, nodeById, sameEdge } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, toast } from '../lib/dom.js';
import { freeSpot } from '../lib/geometry.js';
import { canConnect, FORMAT } from '../../src/workflows/engine.js';
import {
  addNodeCommand, connectCommand, fragmentOf, macroCommand, moveNodeCommand, pasteCommand, removeEdgeCommand,
  removeNodeCommand, setFieldCommand, setParamCommand,
} from '../../src/workflows/history.js';
import { autosave, changed, exec, refreshLint, resetRun, select } from './core.js';
import { importText } from './io.js';

const FRAGMENT = 'kod-bilimi-atolyesi/fragment';

// ------------------------------------------------------------------ kutular ve bağlantılar
/** Paletten kutu ekler (konum verilmezse görünen alanda boş bir yere). */
export function addComponent(type, at = null) {
  const sc = $('tuval');
  const pos = at ?? freeSpot(doc.wf.nodes, { left: sc.scrollLeft / state.zoom, top: sc.scrollTop / state.zoom });
  const cmd = addNodeCommand(catalog, type, pos);
  if (!exec(cmd)) return null;
  select({ kind: 'node', id: cmd.node.id });
  bus.emit('odak', { id: cmd.node.id, added: true });
  toast(`"${compOf(cmd.node).title}" eklendi. Uçlarına tıklayarak bağlayın.`);
  return cmd.node;
}

/** Klavyeyle taşıma: ardışık adımlar tek geri alma adımında birleşir. */
export function moveNodeBy(id, dx, dy) {
  const n = nodeById(id);
  if (!n) return;
  const after = { x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) };
  history.execute(moveNodeCommand(id, { x: n.x, y: n.y }, after));
  bus.emit('tasindi', { id });
  bus.emit('gecmis');
  autosave();
}

/** Fareyle sürükleme: kutu sürüklenirken canlı taşınır, bırakınca tek komut olarak kaydedilir. */
export function moveNodeLive(id, x, y) {
  const n = nodeById(id);
  if (!n) return;
  n.x = x;
  n.y = y;
  bus.emit('tasindi', { id, live: true });
}

export function moveNodeDone(id, before) {
  const n = nodeById(id);
  if (!n || (n.x === before.x && n.y === before.y)) return;
  history.record(moveNodeCommand(id, before, { x: n.x, y: n.y }));
  history.seal();
  bus.emit('tasindi', { id });
  bus.emit('gecmis');
  autosave();
}

/** İki ucu bağlar (sürükle-bırak, iki tıklama ya da klavye). Reddedilirse nedenini söyler. */
export function connectPorts(a, b) {
  state.armed = null;
  bus.emit('uc');
  if (a.side === b.side) {
    bus.emit('baglanti-red', { ports: [a, b] });
    toast('İki ucun biri çıkış, diğeri giriş olmalı.', 'err');
    return false;
  }
  const from = a.side === 'out' ? a : b;
  const to = a.side === 'out' ? b : a;
  const r = canConnect(doc.wf, catalog, { node: from.node, port: from.port }, { node: to.node, port: to.port });
  if (!r.ok) {
    bus.emit('baglanti-red', { ports: [a, b] });
    toast(`Bağlantı reddedildi. ${r.reason}`, 'err');
    return false;
  }
  if (!exec(connectCommand(catalog, { node: from.node, port: from.port }, { node: to.node, port: to.port }))) return false;
  toast(`Bağlandı: ${compOf(nodeById(from.node)).title} → ${compOf(nodeById(to.node)).title}`);
  return true;
}

export function removeEdge(edge) {
  if (state.sel?.kind === 'edge' && sameEdge(state.sel.edge, edge)) state.sel = null;
  if (exec(removeEdgeCommand(edge))) toast('Bağlantı silindi.');
  bus.emit('secim');
}

export function deleteSelection() {
  const sel = state.sel;
  if (!sel) return;
  state.sel = null;
  if (sel.kind === 'node') {
    const title = compOf(nodeById(sel.id))?.title;
    if (exec(removeNodeCommand(sel.id))) toast(`"${title}" silindi. Geri almak için Ctrl+Z.`);
  } else if (exec(removeEdgeCommand(sel.edge))) {
    toast('Bağlantı silindi. Geri almak için Ctrl+Z.');
  }
  bus.emit('secim');
  bus.emit('odak', { canvas: true });
}

/** Bir kutunun ayarı (yazarken her tuş bir komut; aynı alana ardışık yazmalar tek adımda birleşir). */
export function setParam(node, key, value, { rerender = false } = {}) {
  history.execute(setParamCommand(node.id, key, node.params[key], value));
  changed({ structure: false });
  bus.emit('param', { id: node.id, rerender });
}

/** Birden çok ayarı tek adımda değiştirir (ör. dosyadan yükleme: ad + içerik). */
export function setParams(node, values, label = 'Ayar değiştirme') {
  history.execute(macroCommand(label, Object.entries(values).map(([k, v]) => setParamCommand(node.id, k, node.params[k], v))));
  history.seal();
  changed({ structure: false });
  bus.emit('param', { id: node.id, rerender: true });
}

export function setField(field, value) {
  history.execute(setFieldCommand(field, doc.wf[field], value));
  changed({ structure: false });
}


// ------------------------------------------------------------------ geri al / yinele
function applyHistory(cmd, direction) {
  if (!cmd) {
    toast(direction === 'undo' ? 'Geri alınacak bir değişiklik yok.' : 'Yinelenecek bir değişiklik yok.');
    return;
  }
  const whole = 'meta' in cmd;
  if (whole) {
    state.pkg = /** @type {string | null} */ ((direction === 'undo' ? cmd.meta.before : cmd.meta.after) ?? null);
    resetRun();
  }
  if (state.sel?.kind === 'node' && !nodeById(state.sel.id)) state.sel = null;
  if (state.sel?.kind === 'edge' && !doc.wf.edges.some((e) => sameEdge(e, state.sel.edge))) state.sel = null;
  const moveOnly = typeof cmd.key === 'string' && cmd.key.startsWith('tasi:');
  if (whole) {
    refreshLint();
    bus.emit('yuklendi');
    bus.emit('gecmis');
    autosave();
  } else if (moveOnly) {
    bus.emit('tasindi', { id: cmd.key.slice(5) });
    bus.emit('gecmis');
    autosave();
  } else {
    changed();
  }
  bus.emit('secim');
  toast(`${direction === 'undo' ? 'Geri alındı' : 'Yinelendi'}: ${cmd.label}`);
}

export const undo = () => applyHistory(history.undo(), 'undo');
export const redo = () => applyHistory(history.redo(), 'redo');

// ------------------------------------------------------------------ kopyala / yapıştır / çoğalt
/** Seçili kutuyu bir "parça" olarak kopyalar; metnini döndürür (yoksa null). */
export function copySelection() {
  if (state.sel?.kind !== 'node') return null;
  const frag = fragmentOf(doc.wf, [state.sel.id]);
  state.clipboard = frag;
  toast(`"${compOf(nodeById(state.sel.id)).title}" kopyalandı. Ctrl+V ile yapıştırın.`);
  return JSON.stringify(frag);
}

export function pasteFragment(frag) {
  try {
    const cmd = pasteCommand(catalog, doc.wf, frag);
    history.execute(cmd);
    history.seal();
    changed();
    select({ kind: 'node', id: cmd.ids[0] });
    bus.emit('odak', { id: cmd.ids[0] });
    toast(`${cmd.label}: ${cmd.ids.join(', ')}`);
    return true;
  } catch (err) {
    toast(err.message, 'err');
    return false;
  }
}

/** Panodan gelen metin: atölye parçası, bütün bir iş akışı JSON'u ya da (yoksa) iç pano. */
export function pasteText(text) {
  let data = null;
  try { data = JSON.parse(text); } catch { /* düz metin */ }
  if (data?.format === FRAGMENT) return pasteFragment(data);
  if (data?.format === FORMAT) return importText(text, 'Yapıştırma');
  if (state.clipboard) return pasteFragment(state.clipboard);
  toast('Panoda atölye kutusu ya da iş akışı yok.', 'err');
  return false;
}

export function duplicateSelection() {
  if (state.sel?.kind !== 'node') return toast('Çoğaltmak için önce bir kutu seçin.');
  return pasteFragment(fragmentOf(doc.wf, [state.sel.id]));
}
