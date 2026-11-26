// Çalıştırma kaydı (provenance): bir çalıştırmanın yeniden üretilebilmesi ve denetlenebilmesi
// için gereken her şey tek bir JSON belgesinde: iş akışı, bileşenlerin sürümleri, girdi
// dosyalarının SHA-256 özetleri, her kutunun durumu, süresi ve özeti, molekülün kararları.
// Snakemake --report, Nextflow'un trace/report dosyaları ve Galaxy'nin iş geçmişi aynı
// ihtiyaca yanıt verir.
//
// Saf işlevdir: saat okumaz (createdAt dışarıdan verilir), özet (hash) hesaplamaz (girdi
// özetleri dışarıdan verilir); bu yüzden aynı girdiyle her zaman aynı kaydı üretir ve test edilir.
// Yüklenen dosyaların içeriği kayda yazılmaz; yalnızca yolu, uzunluğu ve özeti yazılır.

import { VERSION } from '../version.js';

/**
 * @typedef {import('./engine.js').Catalog} Catalog
 * @typedef {{ path: string, chars: number, sha256: string }} InputDigest
 * @typedef {{ status: string, ms?: number | null, info?: any, error?: string | null, cached?: boolean }} NodeRun
 * @typedef {{ ok: boolean, order?: string[], totalMs?: number, problems?: Array<{ message: string }>, nodes: Record<string, NodeRun> }} RunResult
 */

export const RUN_RECORD_FORMAT = 'kod-bilimi-atolyesi/run-record';
export const RUN_RECORD_VERSION = 1;
const LONG_TEXT = 200;

/** Uzun metin ve dosya ayarlarını kayıttan çıkarır (içerik yerine uzunluk). */
export function summarizeParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === 'string' && v.length > LONG_TEXT) out[k] = { karakter: v.length, not: 'içerik kayda yazılmadı; özeti "inputs" alanında' };
    else if (Array.isArray(v) && v.every((f) => f && typeof f.path === 'string' && typeof f.text === 'string')) out[k] = v.map((f) => ({ path: f.path, karakter: f.text.length }));
    else out[k] = v;
  }
  return out;
}

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/**
 * @param {object} o
 * @param {{ name: string, target: string, nodes: Array<{ id: string, type: string, x: number, y: number, params: object }>, edges: Array<object> }} o.workflow  serializeWorkflow çıktısı
 * @param {Catalog} o.catalog
 * @param {RunResult} o.run
 * @param {string} o.createdAt                         ISO 8601 zaman damgası
 * @param {Record<string, InputDigest[]>} [o.inputs]   kaynak kutusu kimliği → girdi özetleri
 * @param {Record<string, unknown>} [o.environment]    çalıştırma ortamı (ör. tarayıcı, çalıştırıcı)
 */
export function buildRunRecord({ workflow, catalog, run, createdAt, inputs = {}, environment = {} }) {
  const order = run.order?.length ? run.order : workflow.nodes.map((n) => n.id);
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  let findings = 0;
  const nodes = order.filter((id) => byId.has(id)).map((id) => {
    const n = byId.get(id);
    const comp = catalog.get(n.type);
    const r = run.nodes?.[id] ?? { status: 'çalışmadı' };
    const info = r.info ?? {};
    const producesFindings = comp?.outputs.some((p) => p.type === 'Finding');
    if (producesFindings && r.status === 'bitti' && typeof info.count === 'number') findings += info.count;
    const entry = {
      id,
      type: n.type,
      title: comp?.title ?? n.type,
      version: comp?.manifest?.version ?? null,
      status: r.status,
      ms: round3(r.ms),
      summary: info.summary ?? null,
      error: r.error ?? null,
    };
    if (typeof info.count === 'number') entry.count = info.count;
    if (info.gate) entry.gate = info.gate;
    if (r.cached) entry.cached = true;
    if (info.record) {
      entry.decision = {
        requested: info.record.requested,
        selected: info.record.selected,
        why: info.record.why,
        shape: info.record.shape,
        estimatesMs: Object.fromEntries(Object.entries(info.record.estimates ?? {}).map(([k, e]) => [k, e.applicable ? round3(e.ms) : null])),
      };
    }
    return entry;
  });
  return {
    format: RUN_RECORD_FORMAT,
    version: RUN_RECORD_VERSION,
    createdAt,
    tool: { name: 'Kod Bilimi Atölyesi', version: VERSION },
    environment,
    workflow: { ...workflow, nodes: workflow.nodes.map((n) => ({ ...n, params: summarizeParams(n.params) })) },
    result: { ok: run.ok, totalMs: round3(run.totalMs ?? null), findings, problems: (run.problems ?? []).map((p) => p.message) },
    inputs: Object.entries(inputs).map(([node, files]) => ({ node, files })),
    nodes,
    reproduce: 'Atölyede "İçe aktar" ile "workflow" alanını yükleyip aynı girdilerle çalıştırın; girdi dosyalarının SHA-256 özetleri "inputs" alanındakilerle aynı olmalı.',
  };
}

/** Bir dizgiyi verilen özet işleviyle (ör. Web Crypto SHA-256) onaltılık özete çevirir. */
export async function sha256Hex(text, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto (crypto.subtle) bu ortamda yok.');
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
