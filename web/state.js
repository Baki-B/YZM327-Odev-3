// Atölyenin paylaşılan durumu (store). Görünümler okur; yalnızca denetleyici (actions.js)
// değiştirir ve değişikliği olay yoluyla (lib/bus.js) duyurur.
import { createCatalog } from '../src/workflows/catalog.js';
import { createWorkflow } from '../src/workflows/engine.js';
import { History } from '../src/workflows/history.js';

export const catalog = createCatalog();

/** İş akışını taşıyan belge: komutlar iş akışını bunun üzerinden değiştirir (tamamen değiştirme dahil). */
export const doc = { wf: createWorkflow({ name: 'Yeni iş akışı' }) };

/** Geri al / yinele geçmişi (Command deseni). */
export const history = new History(doc, { limit: 200 });

export const state = {
  /** @returns {import('../src/workflows/engine.js').Workflow} */
  get wf() { return doc.wf; },
  set wf(v) { doc.wf = v; },
  sel: null,          // { kind: 'node', id } | { kind: 'edge', edge }
  run: null,          // son çalıştırmanın sonucu (runSerialized çıktısı)
  live: {},           // çalışırken düğüm durumları
  running: false,
  dirty: false,       // son çalıştırmadan sonra iş akışı değişti mi?
  zoom: 1,
  pkg: null,          // açık hazır paket
  armed: null,        // klavye / tıklama ile bağlantı: { node, port, side }
  race: null,
  tab: 'bulgular',
  explain: null,
  lint: [],           // canlı denetim bulguları (her değişiklikte yeniden)
  clipboard: null,    // tarayıcı panosu kullanılamazsa iç pano (kopyala / yapıştır)
};

export const compOf = (node) => catalog.get(node.type);
export const nodeById = (id) => doc.wf.nodes.find((n) => n.id === id);
export const sameEdge = (a, b) => a.from.node === b.from.node && a.from.port === b.from.port && a.to.node === b.to.node && a.to.port === b.to.port;

/** Son çalıştırmanın bu kutu için sonucu (iş akışı değişmediyse). */
export const runOf = (id) => state.live[id] ?? (state.run && !state.dirty ? state.run.nodes[id] : null);
