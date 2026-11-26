// Otomatik yerleşim: katmanlı çizim (Sugiyama yönteminin sadeleştirilmiş hâli). DOM'suz; Node'da
// sınanır (tests/unit/layout.test.js).
//   1. Katman: her kutu, girdilerini üreten kutuların en büyük katmanının bir sağına konur (en
//      uzun yol). Girdisi olmayan kutu (ör. desen kümesi), çıktısını kullanan ilk kutunun hemen
//      soluna çekilir; böylece kablolar kısalır.
//   2. Sıra: her sütunda kutular komşularının ortalama sırasına göre dizilir (barycenter);
//      aşağı ve yukarı birkaç süpürmeden kesişen kablosu en az olan sıra seçilir.
//   3. Konum: sütunlar soldan sağa, kutular yukarıdan aşağıya; sütunlar dikeyde ortalanır ve
//      ızgaraya oturtulur.
import { NODE_W, nodeHeight, snap } from './geometry.js';
import { topologicalOrder } from '../../src/workflows/engine.js';

/** @typedef {import('../../src/contracts.js').Workflow} Workflow */
/** @typedef {import('../../src/contracts.js').WorkflowNode} WorkflowNode */
/** @typedef {import('../../src/contracts.js').WorkflowComponent} Component */
/** @typedef {{ x: number, y: number }} Point */

/** İki doğru parçası birbirini (uç noktalar dışında) kesiyor mu? */
function properCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Doğru parçalarının kaç çifti kesişiyor? @param {Array<[Point, Point]>} segs */
function countCrossings(segs) {
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (properCross(...segs[i], ...segs[j])) n++;
  return n;
}

/**
 * Tuvaldeki kesişen kablo sayısı (kablolar kutunun sağ kenarından hedefin sol kenarına düz
 * çizgi sayılır).
 * @param {Workflow} wf
 * @param {(n: WorkflowNode) => Component} compOf
 * @param {Map<string, Point>} [pos]  verilmezse kutuların şimdiki konumu
 */
export function edgeCrossings(wf, compOf, pos) {
  const at = (id) => {
    const n = wf.nodes.find((x) => x.id === id);
    const p = pos?.get(id) ?? { x: n.x, y: n.y };
    return { ...p, h: nodeHeight(compOf(n)) };
  };
  return countCrossings(wf.edges.map((e) => {
    const a = at(e.from.node);
    const b = at(e.to.node);
    return [{ x: a.x + NODE_W, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }];
  }));
}

/**
 * Kutuların yeni konumları (kimlik → { x, y }). İş akışını değiştirmez; uygulamak denetleyicinin
 * işidir (tek adımda geri alınabilir taşıma komutlarıyla).
 * @param {Workflow} wf
 * @param {(n: WorkflowNode) => Component} compOf
 * @param {{ x0?: number, y0?: number, gapX?: number, gapY?: number, sweeps?: number }} [opts]
 * @returns {Map<string, Point>}
 */
export function layeredLayout(wf, compOf, { x0 = 40, y0 = 40, gapX = 70, gapY = 30, sweeps = 6 } = {}) {
  const parents = new Map(wf.nodes.map((n) => [n.id, []]));
  const children = new Map(wf.nodes.map((n) => [n.id, []]));
  for (const e of wf.edges) {
    if (!parents.has(e.to.node) || !children.has(e.from.node)) continue;
    parents.get(e.to.node).push(e.from.node);
    children.get(e.from.node).push(e.to.node);
  }
  // 1. katman: en uzun yol; girdisi olmayan kutu kullanıcısının hemen soluna
  const order = topologicalOrder(wf);
  const layer = new Map();
  for (const n of order) layer.set(n.id, Math.max(-1, ...parents.get(n.id).map((p) => layer.get(p))) + 1);
  for (const n of order) {
    const kids = children.get(n.id);
    if (!parents.get(n.id).length && kids.length) layer.set(n.id, Math.min(...kids.map((k) => layer.get(k))) - 1);
  }
  // 2. sıra: başlangıçta şimdiki dikey konuma göre (eşitse listedeki sıraya göre)
  const columns = Array.from({ length: Math.max(-1, ...layer.values()) + 1 }, () => []);
  const index = new Map(wf.nodes.map((n, i) => [n.id, i]));
  const y = new Map(wf.nodes.map((n) => [n.id, n.y ?? 0]));
  for (const n of wf.nodes) columns[layer.get(n.id)].push(n.id);
  for (const col of columns) col.sort((a, b) => y.get(a) - y.get(b) || index.get(a) - index.get(b));
  const rankOf = () => new Map(columns.flatMap((col) => col.map((id, i) => [id, i])));
  const crossingsOf = () => {
    const r = rankOf();
    return countCrossings(wf.edges.filter((e) => layer.has(e.from.node) && layer.has(e.to.node))
      .map((e) => [{ x: layer.get(e.from.node), y: r.get(e.from.node) }, { x: layer.get(e.to.node), y: r.get(e.to.node) }]));
  };
  let best = columns.map((col) => [...col]);
  let bestCrossings = crossingsOf();
  for (let s = 0; s < sweeps && bestCrossings > 0; s++) {
    const down = s % 2 === 0;
    const neighbours = down ? parents : children;
    const seq = columns.map((_, i) => i);
    if (!down) seq.reverse();
    for (const li of seq) {
      const r = rankOf();
      columns[li] = columns[li]
        .map((id, i) => {
          const ns = neighbours.get(id);
          return { id, i, b: ns.length ? ns.reduce((sum, k) => sum + r.get(k), 0) / ns.length : i };
        })
        .sort((a, b) => a.b - b.b || a.i - b.i)
        .map((k) => k.id);
    }
    const c = crossingsOf();
    if (c < bestCrossings) {
      bestCrossings = c;
      best = columns.map((col) => [...col]);
    }
  }
  // 3. konum: sütunlar dikeyde ortalanır
  const height = new Map(wf.nodes.map((n) => [n.id, nodeHeight(compOf(n))]));
  const colHeight = best.map((col) => col.reduce((sum, id) => sum + height.get(id), 0) + gapY * Math.max(0, col.length - 1));
  const tallest = Math.max(0, ...colHeight);
  const out = new Map();
  best.forEach((col, li) => {
    let top = y0 + (tallest - colHeight[li]) / 2;
    for (const id of col) {
      out.set(id, { x: snap(x0 + li * (NODE_W + gapX)), y: snap(top) });
      top += height.get(id) + gapY;
    }
  });
  return out;
}
