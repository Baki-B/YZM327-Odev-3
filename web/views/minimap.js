// Mini harita: tuvalin küçültülmüş görünümü (kutular ve görünen alan); tıklanan yer görünen
// alanın ortasına gelir. Fare için bir kolaylıktır: klavye kullanıcısı "Sığdır" ve kaydırmayı
// kullanır, bu yüzden ekran okuyuculardan gizlidir. Varsayılan olarak kapalıdır, araç çubuğunun
// üstündeki "▦" düğmesiyle açılır: açık kaldığında tuvalin köşesini kapatır (n8n, Node-RED gibi).
// Telefonda gösterilmez.
import { state, doc, compOf } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, s } from '../lib/dom.js';
import { catClass } from '../lib/format.js';
import { minimapModel, minimapToBoard } from '../lib/layout.js';

const SIZE = { width: 180, height: 120 };
let open = false;

/** Görünen alan, tuval koordinatında. */
function viewOf() {
  const sc = $('tuval');
  return { left: sc.scrollLeft / state.zoom, top: sc.scrollTop / state.zoom, width: sc.clientWidth / state.zoom, height: sc.clientHeight / state.zoom };
}

export function renderMinimap() {
  const svg = $('mini-harita');
  svg.replaceChildren();
  const visible = open && doc.wf.nodes.length > 0;
  svg.classList.toggle('empty', !visible);
  if (!visible) return;
  const m = minimapModel(doc.wf, compOf, viewOf(), SIZE);
  for (const n of m.nodes) svg.append(s('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 2, class: `mm-node ${catClass(n.category)}`, 'data-id': n.id }));
  svg.append(s('rect', { x: m.view.x, y: m.view.y, width: m.view.w, height: m.view.h, class: 'mm-view' }));
}

export function initMinimap() {
  const svg = $('mini-harita');
  const toggle = $('harita-ac');
  toggle.addEventListener('click', () => {
    open = !open;
    toggle.setAttribute('aria-pressed', String(open));
    renderMinimap();
  });
  svg.addEventListener('pointerdown', (e) => {
    const r = svg.getBoundingClientRect();
    const p = minimapToBoard({ x: e.clientX - r.left, y: e.clientY - r.top }, minimapModel(doc.wf, compOf, viewOf(), SIZE));
    const sc = $('tuval');
    sc.scrollTo({ left: p.x * state.zoom - sc.clientWidth / 2, top: p.y * state.zoom - sc.clientHeight / 2 });
  });
  $('tuval').addEventListener('scroll', renderMinimap, { passive: true });
  addEventListener('resize', renderMinimap);
  for (const ev of ['degisti', 'yuklendi', 'tasindi', 'olcek']) bus.on(ev, renderMinimap);
  renderMinimap();
}
