// Çalıştırma çekirdeği: Web Worker (worker.js) ve yedek ana iş parçacığı çalıştırıcısı aynı
// kodu kullanır. Son çalıştırmanın girdileri bellekte tutulur ki "Atomları yarıştır" aynı
// girdiyi yeniden yüklemeden ölçebilsin.
import { createCatalog, mergePatternSets } from '../src/workflows/catalog.js';
import { deserializeWorkflow, runWorkflow } from '../src/workflows/engine.js';
import { raceAtoms } from '../src/workflows/race.js';
import { sha256Hex } from '../src/workflows/provenance.js';
import { loadSampleBrowser } from './samples.js';

const catalog = createCatalog();
let last = null;

/**
 * Kaynak kutularının (Source.File üreten) çıktısındaki her dosyanın SHA-256 özeti: çalıştırma
 * kaydı (provenance) girdilerin aynı olup olmadığını bununla gösterir. Web Crypto yoksa boş.
 */
async function inputDigests(wf, res) {
  const out = {};
  if (!globalThis.crypto?.subtle) return out;
  for (const node of wf.nodes) {
    const comp = catalog.get(node.type);
    const port = comp?.outputs.find((p) => p.type === 'Source.File');
    const files = port && res.nodes[node.id]?.status === 'bitti' ? res.nodes[node.id].outputs?.[port.name] : null;
    if (!Array.isArray(files)) continue;
    out[node.id] = [];
    for (const f of files) out[node.id].push({ path: f.path, chars: f.text.length, sha256: await sha256Hex(f.text) });
  }
  return out;
}

/** İş akışını çalıştırır; düğüm çıktılarını (büyük metinler) değil, yalnızca bilgileri döndürür. */
export async function runSerialized(data, onNode = () => {}) {
  const wf = deserializeWorkflow(data, catalog);
  const t0 = performance.now();
  const res = await runWorkflow(wf, catalog, {
    loadSample: loadSampleBrowser,
    now: () => performance.now(),
    onNode: (id, r) => onNode(id, { status: r.status, ms: r.ms ?? null, summary: r.info?.summary ?? null, error: r.error ?? null }),
  });
  const totalMs = performance.now() - t0;
  last = { wf, res };
  const nodes = {};
  for (const [id, r] of Object.entries(res.nodes)) nodes[id] = { status: r.status, ms: r.ms, info: r.info, error: r.error };
  let inputs = {};
  try { inputs = await inputDigests(wf, res); } catch { /* özet hesaplanamazsa kayıt özetsiz olur */ }
  return { ok: res.ok, problems: res.problems, order: res.order, totalMs, nodes, inputs };
}

/** Son çalıştırmada verilen arama kutusunun (molekül ya da atom) girdileriyle atomları yarıştırır. */
export function raceNode(nodeId, reps = 5) {
  if (!last) throw new Error('Önce iş akışını çalıştırın.');
  const { wf, res } = last;
  const into = wf.edges.filter((e) => e.to.node === nodeId);
  const entriesEdge = into.find((e) => e.to.port === 'entries');
  if (!entriesEdge) throw new Error('Bu kutunun kayıt girişi yok.');
  const entries = res.nodes[entriesEdge.from.node]?.outputs?.[entriesEdge.from.port];
  const sets = into.filter((e) => e.to.port === 'patterns').map((e) => res.nodes[e.from.node]?.outputs?.[e.from.port]);
  if (!entries || sets.some((s) => !s)) throw new Error('Bu kutunun girdileri son çalıştırmada üretilmedi; iş akışını yeniden çalıştırın.');
  const set = mergePatternSets(sets);
  const r = raceAtoms(entries, set, { now: () => performance.now(), reps });
  return { ...r, chars: entries.reduce((s, e) => s + e.seq.length, 0), records: entries.length, patterns: set.patterns.length, reps };
}
