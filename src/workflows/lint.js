// İş akışı denetimi (lint): çalıştırmadan önce iş akışındaki olası hataları ve eksikleri bulur.
//
// validateWorkflow yalnızca "çalışır mı?" sorusunu yanıtlar (eksik zorunlu giriş, tür
// uyuşmazlığı, döngü). Denetim bunun üstüne "anlamlı mı?" sorusunu sorar: sonucu hiçbir yere
// gitmeyen kutu, hiçbir şeye bağlı olmayan kutu, sonuç gösteren kutusu olmayan iş akışı...
// Galaxy'nin iş akışı denetimi ve Snakemake'in --lint seçeneği aynı fikri bilimsel iş akışlarına
// uygular.
//
// Kurallar bileşen adlarına bakmaz, yalnızca kataloğun verdiği bilgilere (uçlar, manifest)
// bakar; yeni bir bileşen eklendiğinde bu dosya değişmez (Açık/Kapalı ilkesi).

import { validateWorkflow } from './engine.js';

/**
 * @typedef {import('./engine.js').Workflow} Workflow
 * @typedef {import('./engine.js').Catalog} Catalog
 * @typedef {'hata' | 'uyarı' | 'bilgi'} LintLevel
 * @typedef {{ level: LintLevel, code: string, node?: string, message: string }} LintFinding
 */

const ORDER = { hata: 0, 'uyarı': 1, bilgi: 2 };
const DEFAULT_NAMES = new Set(['', 'Yeni iş akışı', 'Adsız iş akışı']);

/** Denetim kurallarının listesi (belgeleme ve testler için). */
export const LINT_RULES = {
  calismaz: { level: 'hata', title: 'Çalıştırılamaz: eksik ya da hatalı bağlantı, döngü, bilinmeyen kutu' },
  bos: { level: 'uyarı', title: 'İş akışında hiç kutu yok' },
  yalniz: { level: 'uyarı', title: 'Hiçbir kutuya bağlı olmayan kutu' },
  cikmaz: { level: 'uyarı', title: 'Çıkışı hiçbir yere bağlanmamış kutu: ürettiği sonuç kullanılmıyor' },
  'sonuc-yok': { level: 'uyarı', title: 'Sonuç gösteren bir çıktı kutusu (çıkışı olmayan kutu) yok' },
  'test-referansi': { level: 'bilgi', title: 'Test referansı atomu (oracle) kullanılıyor: doğru ama yavaş' },
  ad: { level: 'bilgi', title: 'İş akışına ad verilmemiş' },
  hedef: { level: 'bilgi', title: 'İş akışının hedefi yazılmamış' },
};

/**
 * @param {Workflow} wf
 * @param {Catalog} catalog
 * @returns {LintFinding[]} önem sırasına göre (hata → uyarı → bilgi), aynı önemde kutu sırasıyla
 */
export function lintWorkflow(wf, catalog) {
  /** @type {LintFinding[]} */
  const out = [];
  const add = (code, message, node) => out.push({ level: /** @type {LintLevel} */ (LINT_RULES[code].level), code, message, ...(node ? { node } : {}) });

  for (const p of validateWorkflow(wf, catalog)) add('calismaz', p.message, p.node);
  if (wf.nodes.length === 0) add('bos', 'İş akışında hiç kutu yok: soldan bir hazır paket seçin ya da bileşen ekleyin.');

  const known = wf.nodes.filter((n) => catalog.get(n.type));
  const hasSink = known.some((n) => catalog.get(n.type).outputs.length === 0);
  for (const n of known) {
    const comp = catalog.get(n.type);
    const edges = wf.edges.filter((e) => e.from.node === n.id || e.to.node === n.id);
    if (wf.nodes.length > 1 && edges.length === 0) {
      add('yalniz', `"${comp.title}" (${n.id}) hiçbir kutuya bağlı değil.`, n.id);
      continue;
    }
    if (comp.outputs.length > 0 && !wf.edges.some((e) => e.from.node === n.id)) {
      add('cikmaz', `"${comp.title}" (${n.id}) kutusunun çıkışı hiçbir yere bağlı değil; ürettiği ${comp.outputs.map((p) => p.type).join(', ')} kullanılmıyor.`, n.id);
    }
    if (comp.manifest?.kind === 'atom' && comp.auto === false) {
      add('test-referansi', `"${comp.title}" (${n.id}) test referansıdır: sonucu doğrudur ama hızlı atomlardan yavaştır; gerçek taramada molekülü kullanın.`, n.id);
    }
  }
  if (known.length > 0 && !hasSink) add('sonuc-yok', 'Sonuç gösteren bir kutu yok: bir ÇIKTILAR bileşeni (ör. "Bulgu tablosu") ekleyin.');
  if (DEFAULT_NAMES.has(String(wf.name ?? '').trim())) add('ad', 'İş akışına ad verin: paylaşılan dosyada ve açıklamada görünür.');
  if (!String(wf.target ?? '').trim()) add('hedef', 'Hedefi yazın: bu iş akışı neyi bulmalı? (ör. "Koda gömülmüş parola kalmasın").');

  const pos = new Map(wf.nodes.map((n, i) => [n.id, i]));
  return out
    .map((f, i) => ({ f, i }))
    .sort((a, b) => ORDER[a.f.level] - ORDER[b.f.level] || (pos.get(a.f.node) ?? -1) - (pos.get(b.f.node) ?? -1) || a.i - b.i)
    .map(({ f }) => f);
}

/** Önem düzeyine göre sayılar: { hata, uyarı, bilgi }. */
export function lintSummary(findings) {
  const s = { hata: 0, 'uyarı': 0, bilgi: 0 };
  for (const f of findings) s[f.level]++;
  return s;
}
