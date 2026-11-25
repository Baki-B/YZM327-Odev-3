// Tuval geometrisi: kutu boyutları, uç konumları, kablo eğrileri, boş yer bulma.
// DOM'suzdur (tests/unit/web.test.js); bileşen bilgisi parametre olarak verilir.

export const NODE_W = 190;
export const HEAD = 38;
export const PAD = 6;
export const ROW = 22;
export const FOOT = 24;
export const GRID = 10;

/** @typedef {{ inputs: Array<{ name: string }>, outputs: Array<{ name: string }> }} PortsOf */

/** Kutunun yüksekliği: başlık + uç satırları + alt bilgi. */
export function nodeHeight(comp) {
  return HEAD + PAD * 2 + Math.max(1, comp.inputs.length, comp.outputs.length) * ROW + FOOT;
}

/** Bir ucun tuvaldeki konumu (kablonun bağlandığı nokta). */
export function portPos(comp, node, side, name) {
  const list = side === 'out' ? comp.outputs : comp.inputs;
  const i = Math.max(0, list.findIndex((p) => p.name === name));
  return { x: node.x + (side === 'out' ? NODE_W : 0), y: node.y + HEAD + PAD + i * ROW + ROW / 2 };
}

/** İki nokta arasında yatay teğetli kübik Bézier kablo. */
export function edgePath(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

/** Izgaraya yuvarlar. */
export const snap = (v) => Math.round(v / GRID) * GRID;

/**
 * Tuvalin boyutu: içerik (cw, ch) ve kaydırma payıyla çizim alanı (w, h).
 * @param {Array<{ x: number, y: number }>} nodes
 * @param {(n: any) => PortsOf} compOf
 */
export function boardSize(nodes, compOf) {
  let w = 0;
  let h = 0;
  for (const n of nodes) {
    w = Math.max(w, n.x + NODE_W);
    h = Math.max(h, n.y + nodeHeight(compOf(n)));
  }
  return { cw: w + 30, ch: h + 30, w: Math.max(w + 400, 1400), h: Math.max(h + 300, 900) };
}

/**
 * Görünen alanın sol üstünden başlayarak başka bir kutuyla çakışmayan bir konum bulur.
 * @param {Array<{ x: number, y: number }>} nodes
 * @param {{ left: number, top: number }} origin  görünen alanın tuval koordinatındaki sol üst köşesi
 */
export function freeSpot(nodes, origin) {
  let x = snap(origin.left + 40);
  let y = snap(origin.top + 40);
  for (let tries = 0; tries < 60; tries++) {
    const hit = nodes.some((n) => Math.abs(n.x - x) < NODE_W + 10 && Math.abs(n.y - y) < 100);
    if (!hit) break;
    y += 110;
    if (tries % 4 === 3) { x += NODE_W + 40; y = snap(origin.top + 40); }
  }
  return { x, y };
}

/**
 * Tuvali görünen alana sığdıran yakınlaştırma oranı.
 * @param {{ cw: number, ch: number }} content
 * @param {{ width: number, height: number }} view
 * @param {boolean} mobile  telefonda yazılar okunur kalsın diye alt sınır daha yüksek
 */
export function fitZoom(content, view, mobile) {
  const z = Math.min(1, (view.width - 16) / content.cw, Math.max(0.55, (view.height - 16) / content.ch));
  return Math.max(mobile ? 0.7 : 0.45, z);
}

/** Yakınlaştırmayı sınırlar ve iki ondalığa yuvarlar. */
export const clampZoom = (z) => Math.min(1.6, Math.max(0.4, Math.round(z * 100) / 100));
