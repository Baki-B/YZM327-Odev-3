// Tuval görünümü: kutular, kablolar, seçim, sürükleme, uçlardan bağlantı, yakınlaştırma.
// Durumu yalnızca okur; değişiklikleri denetleyiciye (actions.js) bildirir, olay yolundan
// gelen olaylarda kendini yeniden çizer.
import { state, catalog, doc, compOf, nodeById, sameEdge, runOf } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, h, s, isMobile } from '../lib/dom.js';
import { catClass, tyClass } from '../lib/format.js';
import { NODE_W, HEAD, PAD, ROW, GRID, nodeHeight, portPos as portPosOf, edgePath, boardSize, fitZoom, clampZoom, snap } from '../lib/geometry.js';
import { canConnect } from '../../src/workflows/engine.js';
import { nodeFooterText, strongestLint } from '../lib/view-models.js';
import * as act from '../actions.js';

const portPos = (node, side, name) => portPosOf(compOf(node), node, side, name);
const drag = { temp: null };
/** Kutunun en önemli denetim bulgusu (kutu çerçevesinde işaret). */
const lintOf = (id) => strongestLint(state.lint, id);

/** Kutunun alt satırı (süre ve özet ya da ayarlarının özeti). */
export const nodeFooter = (node) => nodeFooterText(node, compOf(node), runOf(node.id));

// ------------------------------------------------------------------ yakınlaştırma
export function applyZoom() {
  const { w, h: hh } = boardSize(doc.wf.nodes, compOf);
  const board = $('board');
  board.style.width = `${w}px`;
  board.style.height = `${hh}px`;
  board.style.transform = `scale(${state.zoom})`;
  const sizer = board.parentElement;
  sizer.style.width = `${w * state.zoom}px`;
  sizer.style.height = `${hh * state.zoom}px`;
  $('kablolar').setAttribute('width', String(w));
  $('kablolar').setAttribute('height', String(hh));
  $('olcek').textContent = `${Math.round(state.zoom * 100)}%`;
}

export function setZoom(z) {
  state.zoom = clampZoom(z);
  applyZoom();
}

export function fit() {
  const sc = $('tuval');
  if (!doc.wf.nodes.length) return setZoom(1);
  setZoom(fitZoom(boardSize(doc.wf.nodes, compOf), { width: sc.clientWidth, height: sc.clientHeight }, isMobile()));
  sc.scrollTo({ left: 0, top: 0 });
}

export function boardPoint(ev) {
  const r = $('board').getBoundingClientRect();
  return { x: (ev.clientX - r.left) / state.zoom, y: (ev.clientY - r.top) / state.zoom };
}

// ------------------------------------------------------------------ çizim
export function renderCanvas() {
  const layer = $('dugumler');
  layer.replaceChildren();
  for (const node of doc.wf.nodes) layer.append(nodeEl(node));
  applyZoom();
  renderWires();
  const hint = $('baglanti-ipucu');
  if (!state.armed) hint.hidden = true;
}

function nodeEl(node) {
  const comp = compOf(node);
  const selected = state.sel?.kind === 'node' && state.sel.id === node.id;
  const r = runOf(node.id);
  const lint = lintOf(node.id);
  const el = h('div', {
    class: `node ${catClass(comp.category)}${selected ? ' sel' : ''}`, tabindex: '0', role: 'group',
    'data-id': node.id, 'data-status': r?.status ?? null, 'data-gate': r?.info?.gate ?? null, 'data-lint': lint?.level ?? null,
    title: lint ? `Denetim (${lint.level}): ${lint.message}` : null,
    'aria-label': `${comp.title} kutusu (${comp.category}). Ok tuşları taşır, Delete siler, Ctrl+D çoğaltır.${lint ? ` Denetim: ${lint.message}` : ''}`,
    style: { left: `${node.x}px`, top: `${node.y}px`, height: `${nodeHeight(comp)}px` },
  });
  const head = h('div', { class: 'node-head' },
    h('span', { class: 'node-ico', 'aria-hidden': 'true', text: comp.icon ?? '•' }),
    h('div', { style: { minWidth: '0' } }, h('div', { class: 'node-cat', text: comp.category }), h('div', { class: 'node-title', text: comp.title })));
  el.append(head);
  const rows = h('div', { class: 'node-rows', style: { height: `${PAD * 2 + Math.max(1, comp.inputs.length, comp.outputs.length) * ROW}px` } });
  const n = Math.max(comp.inputs.length, comp.outputs.length);
  for (let i = 0; i < n; i++) {
    rows.append(h('div', { class: 'node-row', style: { top: `${PAD + i * ROW}px` } },
      comp.inputs[i] ? h('span', { text: comp.inputs[i].label ?? comp.inputs[i].name }) : h('span'),
      comp.outputs[i] ? h('span', { class: 'out', text: comp.outputs[i].label ?? comp.outputs[i].name }) : null));
  }
  el.append(rows);
  /** @type {Array<['in' | 'out', import('../../src/contracts.js').Port[]]>} */
  const sides = [['in', comp.inputs], ['out', comp.outputs]];
  for (const [side, list] of sides) {
    list.forEach((p, i) => {
      const armed = state.armed && state.armed.node === node.id && state.armed.port === p.name && state.armed.side === side;
      let okTarget = false;
      if (state.armed && state.armed.side !== side && state.armed.node !== node.id) {
        const a = { node: state.armed.node, port: state.armed.port };
        const b = { node: node.id, port: p.name };
        okTarget = (side === 'in' ? canConnect(doc.wf, catalog, a, b) : canConnect(doc.wf, catalog, b, a)).ok;
      }
      const btn = h('button', {
        type: 'button', class: `port ${side} ${tyClass(p.type)}${armed ? ' armed' : ''}${okTarget ? ' ok-target' : ''}`,
        style: { top: `${HEAD + PAD + i * ROW + ROW / 2 - 7}px` },
        'data-node': node.id, 'data-port': p.name, 'data-side': side, 'data-type': p.type,
        title: `${side === 'in' ? 'Giriş' : 'Çıkış'}: ${p.label ?? p.name} (${p.type}${p.multi ? ', birden çok bağlantı alır' : ''})`,
        'aria-label': `${comp.title}: ${side === 'in' ? 'giriş' : 'çıkış'} ${p.label ?? p.name}, tür ${p.type}`,
      });
      wirePort(btn);
      el.append(btn);
    });
  }
  el.append(h('div', { class: 'node-foot' }, h('i', { class: 'st', 'aria-hidden': 'true' }), h('span', { text: nodeFooter(node) })));
  wireNode(el, head, node);
  return el;
}

export function renderWires() {
  const svg = $('kablolar');
  svg.replaceChildren();
  for (const e of doc.wf.edges) {
    const a = nodeById(e.from.node);
    const b = nodeById(e.to.node);
    if (!a || !b) continue;
    const type = compOf(a).outputs.find((p) => p.name === e.from.port)?.type ?? '';
    const d = edgePath(portPos(a, 'out', e.from.port), portPos(b, 'in', e.to.port));
    const sel = state.sel?.kind === 'edge' && sameEdge(state.sel.edge, e);
    svg.append(s('path', { d, class: `w ${tyClass(type)}${sel ? ' sel' : ''}` }));
    const hit = s('path', { d, class: 'hit' });
    const title = s('title');
    title.textContent = `${compOf(a).title} → ${compOf(b).title} (${type}). Tıklayıp Delete ile silin.`;
    hit.append(title);
    hit.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      act.select({ kind: 'edge', edge: e });
    });
    svg.append(hit);
  }
  if (drag.temp) svg.append(drag.temp);
}

function renderSelection() {
  for (const el of document.querySelectorAll('.node')) {
    el.classList.toggle('sel', state.sel?.kind === 'node' && state.sel.id === /** @type {HTMLElement} */ (el).dataset.id);
  }
  renderWires();
}

const nodeElOf = (id) => /** @type {HTMLElement | null} */ (document.querySelector(`.node[data-id="${CSS.escape(id)}"]`));
const portElOf = (p) => /** @type {HTMLElement | null} */ (document.querySelector(`.port[data-node="${CSS.escape(p.node)}"][data-port="${CSS.escape(p.port)}"][data-side="${p.side}"]`));

function placeNode(id) {
  const n = nodeById(id);
  const el = nodeElOf(id);
  if (!n || !el) return;
  el.style.left = `${n.x}px`;
  el.style.top = `${n.y}px`;
}

/**
 * Kutuya klavye odağı verir. Kutu çizilmişse hemen; çizilmemişse bir sonraki karede ve yalnızca
 * kullanıcı o arada odağı başka bir yere taşımadıysa (gecikmeli odak kullanıcının odağını çalmasın).
 */
export function focusNode(id) {
  const el = nodeElOf(id);
  if (el) return el.focus({ preventScroll: false });
  const before = document.activeElement;
  requestAnimationFrame(() => {
    if (document.activeElement !== before && document.activeElement !== document.body) return;
    nodeElOf(id)?.focus({ preventScroll: false });
  });
}

// ------------------------------------------------------------------ kutu taşıma (fare / dokunma / klavye)
function wireNode(el, head, node) {
  el.addEventListener('focus', () => {
    if (!(state.sel?.kind === 'node' && state.sel.id === node.id)) act.select({ kind: 'node', id: node.id });
  });
  el.addEventListener('blur', () => act.sealHistory());
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    const step = e.shiftKey ? 50 : GRID;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      act.moveNodeBy(node.id, moves[e.key][0], moves[e.key][1]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      act.deleteSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      $('props').focus();
    }
  });
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    act.select({ kind: 'node', id: node.id });
    const start = { x: e.clientX, y: e.clientY, nx: node.x, ny: node.y };
    head.setPointerCapture(e.pointerId);
    const move = (ev) => {
      act.moveNodeLive(node.id, Math.max(0, snap(start.nx + (ev.clientX - start.x) / state.zoom)), Math.max(0, snap(start.ny + (ev.clientY - start.y) / state.zoom)));
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      act.moveNodeDone(node.id, { x: start.nx, y: start.ny });
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  });
}

// ------------------------------------------------------------------ bağlantı: uçtan sürükle-bırak, iki uca sırayla tıkla / Enter
function wirePort(btn) {
  const me = () => ({ node: btn.dataset.node, port: btn.dataset.port, side: btn.dataset.side });
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) activatePort(me()); // klavye (Enter / Boşluk)
  });
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const from = me();
    const p0 = portPos(nodeById(from.node), from.side, from.port);
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    btn.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moved = true;
      const p = boardPoint(ev);
      const d = from.side === 'out' ? edgePath(p0, p) : edgePath(p, p0);
      if (!drag.temp) drag.temp = s('path', { class: 'temp' });
      drag.temp.setAttribute('d', d);
      if (!drag.temp.isConnected) $('kablolar').append(drag.temp);
    };
    const up = (ev) => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      drag.temp?.remove();
      drag.temp = null;
      if (!moved) return activatePort(from);
      const target = /** @type {HTMLElement | null} */ (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.port'));
      if (!target || target === btn) return;
      act.connectPorts(from, { node: target.dataset.node, port: target.dataset.port, side: target.dataset.side });
    };
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
}

function activatePort(p) {
  const a = state.armed;
  if (a && a.side !== p.side && a.node !== p.node) return act.connectPorts(a, p);
  if (a && a.node === p.node && a.port === p.port && a.side === p.side) return act.disarm();
  act.arm(p);
}

function showArmed() {
  renderCanvas();
  const p = state.armed;
  const hint = $('baglanti-ipucu');
  if (!p) {
    hint.hidden = true;
    return;
  }
  const comp = compOf(nodeById(p.node));
  const port = (p.side === 'out' ? comp.outputs : comp.inputs).find((x) => x.name === p.port);
  hint.textContent = `${comp.title} → ${port.label ?? port.name} (${port.type}) seçildi: şimdi bir ${p.side === 'out' ? 'giriş' : 'çıkış'} ucuna tıklayın ya da Tab ile gidip Enter'a basın. Esc: vazgeç.`;
  hint.hidden = false;
  portElOf(p)?.focus();
}

// ------------------------------------------------------------------ olaylar
export function initCanvas() {
  bus.on('degisti', ({ structure }) => { if (structure) renderCanvas(); });
  bus.on('yuklendi', () => { renderCanvas(); fit(); });
  bus.on('secim', renderSelection);
  bus.on('calisma', renderCanvas);
  bus.on('uc', showArmed);
  bus.on('tasindi', ({ id, live }) => {
    placeNode(id);
    renderWires();
    if (!live) applyZoom();
  });
  bus.on('param', ({ id }) => {
    const n = nodeById(id);
    const foot = nodeElOf(id)?.querySelector('.node-foot span');
    if (n && foot) foot.textContent = nodeFooter(n);
    if (n) {
      const el = nodeElOf(id);
      const lint = lintOf(id);
      if (el) el.dataset.lint = lint?.level ?? '';
    }
  });
  bus.on('canli', (p) => {
    const el = nodeElOf(p.node);
    if (!el) return;
    el.dataset.status = p.status;
    const node = nodeById(p.node);
    if (node) el.querySelector('.node-foot span').textContent = nodeFooterText(node, compOf(node), p);
  });
  bus.on('baglanti-red', ({ ports }) => {
    renderCanvas();
    for (const p of ports) portElOf(p)?.classList.add('reject');
  });
  bus.on('odak', ({ id, canvas }) => {
    if (canvas) $('tuval').focus();
    else if (id) focusNode(id);
  });
  window.addEventListener('resize', () => applyZoom());
}

export { NODE_W };
