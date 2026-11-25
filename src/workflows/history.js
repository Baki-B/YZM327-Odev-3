// Komut geçmişi: geri al / yinele (Command deseni).
//
// Atölyede iş akışını değiştiren her işlem (kutu ekleme, silme, taşıma, bağlama, ayar
// değiştirme, paket yükleme...) bir komut nesnesidir: do() uygular, undo() geri alır.
// Geçmiş, uygulanan komutları bir yığında tutar; geri alınanlar ikinci yığına geçer.
// DOM'suzdur: aynı modül tarayıcıda ve node:test ile Node'da çalışır.
//
// Komutlar iş akışını doğrudan değil bir "belge" tutucusu ({ wf }) üzerinden değiştirir;
// böylece iş akışının tamamını değiştiren işlemler (paket yükleme, temizleme) de geri alınabilir.
//
// Birleştirme: aynı "key" değerini taşıyan ardışık komutlar (ör. bir ayar kutusuna harf harf
// yazmak, ok tuşuyla kutuyu adım adım taşımak) tek bir geri alma adımında birleşir. seal()
// birleştirmeyi keser (ör. alan odaktan çıkınca).

import { addNode, connect, createWorkflow, removeEdge, serializeWorkflow } from './engine.js';

/**
 * @typedef {import('./engine.js').Workflow} Workflow
 * @typedef {import('./engine.js').WorkflowNode} WorkflowNode
 * @typedef {import('./engine.js').Edge} Edge
 * @typedef {import('./engine.js').Catalog} Catalog
 * @typedef {{ wf: Workflow }} Doc
 */

/**
 * Bir komut. do() ve undo() birbirinin tersidir.
 * @typedef {object} Command
 * @property {string} label                    kullanıcıya gösterilen ad ("Kutu ekleme")
 * @property {(doc: Doc) => void} do
 * @property {(doc: Doc) => void} undo
 * @property {string} [key]                    aynı anahtarlı ardışık komutlar birleşebilir
 * @property {(next: Command) => Command | null} [merge]  bu komutla sonrakini tek komutta birleştirir
 */

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const nodeIndex = (wf, id) => wf.nodes.findIndex((n) => n.id === id);
const sameEdge = (a, b) => a.from.node === b.from.node && a.from.port === b.from.port && a.to.node === b.to.node && a.to.port === b.to.port;

/** İş akışının bağımsız bir kopyası (komutların sakladığı anlık görüntüler için). */
export function cloneWorkflow(wf) {
  const s = serializeWorkflow(wf);
  return createWorkflow({ name: s.name, target: s.target, nodes: clone(s.nodes), edges: s.edges });
}

export class History {
  /** @type {Command[]} */
  #undo = [];
  /** @type {Command[]} */
  #redo = [];
  #sealed = true;

  /**
   * @param {Doc} doc
   * @param {{ limit?: number }} [options]  en fazla kaç adım saklanacağı
   */
  constructor(doc, { limit = 200 } = {}) {
    this.doc = doc;
    this.limit = limit;
  }

  /** Komutu uygular ve geçmişe ekler. Komut hata fırlatırsa geçmiş değişmez. */
  execute(cmd) {
    cmd.do(this.doc);
    this.#push(cmd);
    return cmd;
  }

  /** Zaten uygulanmış bir komutu geçmişe ekler (ör. fareyle sürükleme bitince). */
  record(cmd) {
    this.#push(cmd);
    return cmd;
  }

  #push(cmd) {
    const top = this.#undo.at(-1);
    if (!this.#sealed && top && cmd.key !== undefined && top.key === cmd.key && top.merge) {
      const merged = top.merge(cmd);
      if (merged) {
        this.#undo[this.#undo.length - 1] = merged;
        this.#redo = [];
        return;
      }
    }
    this.#undo.push(cmd);
    if (this.#undo.length > this.limit) this.#undo.shift();
    this.#redo = [];
    this.#sealed = false;
  }

  /** Birleştirmeyi keser: sonraki komut, aynı anahtarı taşısa da ayrı bir adım olur. */
  seal() {
    this.#sealed = true;
  }

  /** Son komutu geri alır; geri alınan komutu (ya da yoksa null) döndürür. */
  undo() {
    const cmd = this.#undo.pop();
    if (!cmd) return null;
    cmd.undo(this.doc);
    this.#redo.push(cmd);
    this.#sealed = true;
    return cmd;
  }

  /** Son geri alınan komutu yeniden uygular. */
  redo() {
    const cmd = this.#redo.pop();
    if (!cmd) return null;
    cmd.do(this.doc);
    this.#undo.push(cmd);
    this.#sealed = true;
    return cmd;
  }

  clear() {
    this.#undo = [];
    this.#redo = [];
    this.#sealed = true;
  }

  get canUndo() { return this.#undo.length > 0; }
  get canRedo() { return this.#redo.length > 0; }
  /** Geri alınacak komutun adı (düğme ipucu için). */
  get undoLabel() { return this.#undo.at(-1)?.label ?? null; }
  get redoLabel() { return this.#redo.at(-1)?.label ?? null; }
  get size() { return { undo: this.#undo.length, redo: this.#redo.length }; }
}

// ---------------------------------------------------------------------------- komutlar

/**
 * Kutu ekleme. İlk uygulamada kimlik ve varsayılan ayarlar belirlenir; yinelemede aynı kutu kurulur.
 * @param {Catalog} catalog
 * @param {string} type
 * @param {{ id?: string, x?: number, y?: number, params?: object }} [options]
 * @returns {Command & { node: WorkflowNode | null }}
 */
export function addNodeCommand(catalog, type, { id, x = 0, y = 0, params = {} } = {}) {
  /** @type {WorkflowNode | null} */
  let made = null;
  return {
    label: 'Kutu ekleme',
    get node() { return made; },
    do(doc) {
      const node = made
        ? addNode(doc.wf, catalog, made.type, { id: made.id, x: made.x, y: made.y, params: clone(made.params) })
        : addNode(doc.wf, catalog, type, { id, x, y, params: clone(params) });
      made = { ...node, params: clone(node.params) };
    },
    undo(doc) {
      const i = nodeIndex(doc.wf, made.id);
      if (i >= 0) doc.wf.nodes.splice(i, 1);
    },
  };
}

/**
 * Kutu silme; kutuya bağlı bağlantılar da silinir. Geri almada kutu ve bağlantılar eski
 * sıralarına (dizideki konumlarına) döner.
 * @param {string} id
 * @returns {Command}
 */
export function removeNodeCommand(id) {
  let saved = null;
  return {
    label: 'Kutu silme',
    do(doc) {
      const wf = doc.wf;
      const index = nodeIndex(wf, id);
      if (index < 0) throw new Error(`Silinecek kutu bulunamadı: ${id}`);
      const edges = [];
      wf.edges.forEach((e, i) => { if (e.from.node === id || e.to.node === id) edges.push({ i, edge: clone(e) }); });
      saved = { index, node: clone(wf.nodes[index]), edges };
      wf.nodes.splice(index, 1);
      wf.edges = wf.edges.filter((e) => e.from.node !== id && e.to.node !== id);
    },
    undo(doc) {
      doc.wf.nodes.splice(saved.index, 0, clone(saved.node));
      for (const { i, edge } of saved.edges) doc.wf.edges.splice(i, 0, clone(edge));
    },
  };
}

/**
 * Bağlantı kurma. Kurulamıyorsa do() motorun nedenli hatasını fırlatır (geçmişe eklenmez).
 * @param {Catalog} catalog
 * @param {{ node: string, port: string }} from
 * @param {{ node: string, port: string }} to
 * @returns {Command}
 */
export function connectCommand(catalog, from, to) {
  const edge = { from: { node: from.node, port: from.port }, to: { node: to.node, port: to.port } };
  return {
    label: 'Bağlantı kurma',
    do(doc) { connect(doc.wf, catalog, edge.from, edge.to); },
    undo(doc) { removeEdge(doc.wf, edge); },
  };
}

/**
 * Bağlantı silme (geri almada aynı sıraya döner).
 * @param {Edge} edge
 * @returns {Command}
 */
export function removeEdgeCommand(edge) {
  const e = clone(edge);
  let index = -1;
  return {
    label: 'Bağlantı silme',
    do(doc) {
      index = doc.wf.edges.findIndex((x) => sameEdge(x, e));
      if (index < 0) throw new Error('Silinecek bağlantı bulunamadı.');
      doc.wf.edges.splice(index, 1);
    },
    undo(doc) { doc.wf.edges.splice(index, 0, clone(e)); },
  };
}

/**
 * Kutu taşıma. Ardışık taşımalar (aynı kutu) tek adımda birleşir.
 * @param {string} id
 * @param {{ x: number, y: number }} before
 * @param {{ x: number, y: number }} after
 * @returns {Command}
 */
export function moveNodeCommand(id, before, after) {
  const set = (doc, p) => {
    const n = doc.wf.nodes[nodeIndex(doc.wf, id)];
    if (!n) throw new Error(`Taşınacak kutu bulunamadı: ${id}`);
    n.x = p.x;
    n.y = p.y;
  };
  return {
    label: 'Kutu taşıma',
    key: `tasi:${id}`,
    do(doc) { set(doc, after); },
    undo(doc) { set(doc, before); },
    merge(next) { return next.key === this.key ? moveNodeCommand(id, before, /** @type {any} */ (next).after) : null; },
    after,
  };
}

/**
 * Bir kutunun bir ayarını değiştirme. Aynı ayara ardışık yazmalar birleşir.
 * @param {string} id
 * @param {string} param
 * @param {unknown} before
 * @param {unknown} after
 * @returns {Command}
 */
export function setParamCommand(id, param, before, after) {
  const b = clone(before);
  const a = clone(after);
  const set = (doc, v) => {
    const n = doc.wf.nodes[nodeIndex(doc.wf, id)];
    if (!n) throw new Error(`Ayarı değişecek kutu bulunamadı: ${id}`);
    n.params[param] = clone(v);
  };
  return {
    label: 'Ayar değiştirme',
    key: `ayar:${id}:${param}`,
    do(doc) { set(doc, a); },
    undo(doc) { set(doc, b); },
    merge(next) { return next.key === this.key ? setParamCommand(id, param, b, /** @type {any} */ (next).after) : null; },
    after: a,
  };
}

/**
 * İş akışının adı ya da hedefi.
 * @param {'name' | 'target'} field
 * @param {string} before
 * @param {string} after
 * @returns {Command}
 */
export function setFieldCommand(field, before, after) {
  return {
    label: field === 'name' ? 'Ad değiştirme' : 'Hedef değiştirme',
    key: `alan:${field}`,
    do(doc) { doc.wf[field] = after; },
    undo(doc) { doc.wf[field] = before; },
    merge(next) { return next.key === this.key ? setFieldCommand(field, before, /** @type {any} */ (next).after) : null; },
    after,
  };
}

/**
 * İş akışının tamamını değiştirme (paket yükleme, içe aktarma, temizleme).
 * İki iş akışının da bağımsız kopyası saklanır.
 * @param {Workflow} before
 * @param {Workflow} after
 * @param {string} [label]
 * @param {{ before?: unknown, after?: unknown }} [meta]  arayüzün geri almada geri getireceği ek bilgi (ör. açık paket)
 * @returns {Command & { meta: { before?: unknown, after?: unknown } }}
 */
export function replaceWorkflowCommand(before, after, label = 'İş akışını değiştirme', meta = {}) {
  const b = cloneWorkflow(before);
  const a = cloneWorkflow(after);
  return {
    label,
    meta,
    do(doc) { doc.wf = cloneWorkflow(a); },
    undo(doc) { doc.wf = cloneWorkflow(b); },
  };
}

/**
 * Birden çok komutu tek adım olarak uygular (Composite). Biri hata verirse o ana kadar
 * uygulananlar geri alınır ve hata yeniden fırlatılır.
 * @param {string} label
 * @param {Command[]} commands
 * @returns {Command}
 */
export function macroCommand(label, commands) {
  return {
    label,
    do(doc) {
      const done = [];
      try {
        for (const c of commands) { c.do(doc); done.push(c); }
      } catch (err) {
        for (const c of done.reverse()) c.undo(doc);
        throw err;
      }
    },
    undo(doc) { for (const c of [...commands].reverse()) c.undo(doc); },
  };
}

/**
 * Seçili kutulardan bir "parça" (kopyala / yapıştır için): kutular ve aralarındaki bağlantılar.
 * @param {Workflow} wf
 * @param {string[]} ids
 */
export function fragmentOf(wf, ids) {
  const set = new Set(ids);
  return {
    format: 'kod-bilimi-atolyesi/fragment',
    version: 1,
    nodes: wf.nodes.filter((n) => set.has(n.id)).map((n) => clone({ id: n.id, type: n.type, x: n.x, y: n.y, params: n.params })),
    edges: wf.edges.filter((e) => set.has(e.from.node) && set.has(e.to.node)).map(clone),
  };
}

/**
 * Bir parçayı yeni kimliklerle, kaydırılmış konumda ekleyen tek bir komut.
 * @param {Catalog} catalog
 * @param {Workflow} wf          kimlik çakışmasını önlemek için mevcut iş akışı
 * @param {{ nodes: Array<{ id: string, type: string, x: number, y: number, params?: object }>, edges: Edge[] }} fragment
 * @param {{ dx?: number, dy?: number }} [offset]
 * @returns {Command & { ids: string[] }}
 */
export function pasteCommand(catalog, wf, fragment, { dx = 40, dy = 40 } = {}) {
  if (!fragment || !Array.isArray(fragment.nodes) || !Array.isArray(fragment.edges)) throw new Error('Yapıştırılan veri bir atölye parçası değil.');
  const used = new Set(wf.nodes.map((n) => n.id));
  const rename = new Map();
  for (const n of fragment.nodes) {
    if (typeof n?.id !== 'string' || typeof n?.type !== 'string' || !catalog.get(n.type)) throw new Error('Yapıştırılan parçada bilinmeyen bir kutu var.');
    const base = n.id.replace(/_kopya\d*$/, '');
    let id = `${base}_kopya`;
    for (let i = 2; used.has(id); i++) id = `${base}_kopya${i}`;
    used.add(id);
    rename.set(n.id, id);
  }
  const adds = fragment.nodes.map((n) => addNodeCommand(catalog, n.type, { id: rename.get(n.id), x: Math.max(0, (Number(n.x) || 0) + dx), y: Math.max(0, (Number(n.y) || 0) + dy), params: n.params ?? {} }));
  const links = fragment.edges
    .filter((e) => rename.has(e.from?.node) && rename.has(e.to?.node))
    .map((e) => connectCommand(catalog, { node: rename.get(e.from.node), port: e.from.port }, { node: rename.get(e.to.node), port: e.to.port }));
  const cmd = macroCommand(fragment.nodes.length === 1 ? 'Kutu yapıştırma' : `${fragment.nodes.length} kutu yapıştırma`, [...adds, ...links]);
  return Object.assign(cmd, { ids: [...rename.values()] });
}
