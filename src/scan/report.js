// Bulgu raporlama: parmak izi (fingerprint), gizli bilgi maskeleme, satır özeti ve SARIF 2.1.0.
//
//   Parmak izi  Bir bulguyu satır numarasından bağımsız tanıyan kısa özet (kural + dosya +
//               satırın metni). Dosyanın başına satır eklense de aynı kalır; bu sayede eski
//               bir taramanın sonucu "taban çizgisi" (baseline) olarak verilip yalnızca YENİ
//               bulgular raporlanabilir (detect-secrets, semgrep, gitleaks aynı yolu izler).
//   Maskeleme   Gizli bilgi kurallarında, desenden sonra gelen değer "****" ile gizlenir;
//               çıktı paylaşılsa bile parola sızmaz (gitleaks --redact).
//   SARIF       Statik analiz sonuçları için OASIS standardı; GitHub kod tarama ekranı,
//               VS Code ve birçok CI aracı okur.

/**
 * @typedef {import('./rules.js').Rule} Rule
 * @typedef {object} Finding
 * @property {string} file
 * @property {number} line
 * @property {number} column
 * @property {string} pattern
 * @property {number} [position]
 * @property {number} [length]
 * @property {string} [ruleId]
 * @property {string} [severity]
 * @property {string} [snippet]
 * @property {string} [fingerprint]
 */

import { VERSION } from '../version.js';

/** SARIF'te aracı tanıtan bilgiler (komut satırı ve atölye aynısını kullanır). */
export const TOOL = { name: 'ios-scan', version: VERSION, informationUri: 'https://github.com/Baki-B/YZM327-Odev-3' };

/** 32 bit FNV-1a özeti. */
function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 64 bitlik (16 onaltılık hane) özet: iki farklı başlangıçla FNV-1a. Güvenlik amaçlı değildir. */
export function hash64(str) {
  return fnv1a(str, 0x811c9dc5).toString(16).padStart(8, '0') + fnv1a(str, 0x050c5d1f).toString(16).padStart(8, '0');
}

const normalize = (s) => String(s).trim().replace(/\s+/g, ' ');

/**
 * Parmak izi üreticisi: aynı dosyada aynı kural ve aynı metinli satır birden çok kez
 * geçiyorsa sıra numarası da özete girer. Akış hâlinde (bulgu bulgu) kullanılabilir.
 * @returns {(f: { ruleId?: string, pattern: string, file: string }, lineText: string) => string}
 */
export function fingerprinter() {
  const seen = new Map();
  return (f, lineText) => {
    const base = `${f.ruleId ?? f.pattern}\u0000${f.file}\u0000${normalize(lineText)}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return hash64(`${base}\u0000${k}`);
  };
}

/**
 * Her bulguya parmak izi ekler (bulgularda lineText alanı olmalı).
 * @param {Array<Finding & { lineText: string }>} findings
 */
export function addFingerprints(findings) {
  const fp = fingerprinter();
  for (const f of findings) f.fingerprint = fp(f, f.lineText);
  return findings;
}

const VALUE_END = new Set([' ', '\t', '"', "'", '`', ',', ';', ')', ']', '}', '<', '>']);
const ASSIGN = new Set(['=', ':']);
const TOKEN = /[A-Za-z0-9+/_\-.~]/;
export const MASK = '****';

/**
 * Bir gizli bilgi deseninin hemen ardından gelen metindeki değeri maskeler.
 *   "AKIA" + "IOSFODNN7EXAMPLE"   → "AKIA" + "****"        (desen bir belirtecin başı)
 *   "password=" + "hunter2 # not" → "password=" + "**** # not"
 *   "API_KEY" + ' = "abc"'        → "API_KEY" + ' = "****"'
 * @param {string} after  eşleşmenin bittiği yerden satır sonuna kadar olan metin
 * @param {string} hit    eşleşen metin (desenin kendisi)
 */
export function maskAfter(after, hit = '') {
  if (!after) return after;
  // 1) desen bir belirtecin ortasında bitiyor: belirtecin geri kalanı değerdir
  if (hit && TOKEN.test(hit[hit.length - 1] ?? '') && /[A-Za-z0-9]/.test(after[0])) {
    let i = 0;
    while (i < after.length && TOKEN.test(after[i])) i++;
    return MASK + after.slice(i);
  }
  // 2) desenden sonra (boşluk / tırnak) atama işareti ve bir değer geliyor
  let i = 0;
  if (!(hit && ASSIGN.has(hit[hit.length - 1]))) {
    while (i < after.length && (after[i] === ' ' || after[i] === '\t' || after[i] === '"' || after[i] === "'")) i++;
    if (!ASSIGN.has(after[i])) return after;
    while (i < after.length && ASSIGN.has(after[i])) i++;
  }
  while (i < after.length && (after[i] === ' ' || after[i] === '\t')) i++;
  let quote = '';
  if (after[i] === '"' || after[i] === "'" || after[i] === '`') quote = after[i++];
  let j = i;
  while (j < after.length && (quote ? after[j] !== quote : !VALUE_END.has(after[j]))) j++;
  if (j === i) return after;
  return after.slice(0, i) + MASK + after.slice(j);
}

/**
 * Bulgunun satır özeti (en fazla 200 karakter); gizli bilgi kuralında değer maskelenir.
 * @param {string} lineText
 * @param {number} column   1'den başlar
 * @param {number} length
 * @param {boolean} secret
 */
export function snippetOf(lineText, column, length, secret) {
  const start = column - 1;
  const hit = lineText.slice(start, start + length);
  let before = lineText.slice(0, start);
  let after = lineText.slice(start + length);
  if (secret) after = maskAfter(after, hit);
  if (before.length > 80) before = '…' + before.slice(-79);
  const room = Math.max(20, 200 - before.length - hit.length);
  if (after.length > room) after = after.slice(0, room - 1) + '…';
  return (before + hit + after).trim();
}

const LEVEL = { error: 'error', warning: 'warning', note: 'note' };

/** Yolu SARIF'in istediği göreli URI'ye çevirir (ileri eğik çizgi, parça parça kodlanmış). */
export function toUri(path) {
  return String(path).replace(/\\/g, '/').replace(/^\.\//, '').split('/').map(encodeURIComponent).join('/');
}

/**
 * SARIF 2.1.0 belgesi.
 * @param {Finding[]} findings  ruleId alanı olmalı (CodeScan details ya da atölye bulgusu)
 * @param {{ rules: Rule[], tool: { name: string, version: string, informationUri?: string }, automationId?: string }} options
 */
export function toSarif(findings, { rules, tool, automationId = 'ios-scan' }) {
  const index = new Map(rules.map((r, i) => [r.id, i]));
  const sarifRules = rules.map((r) => ({
    id: r.id,
    name: r.id.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')),
    shortDescription: { text: r.title },
    fullDescription: { text: `${r.title}. Aranan desen: "${r.pattern}".` },
    help: { text: r.help, markdown: r.help },
    defaultConfiguration: { level: LEVEL[r.severity] ?? 'warning' },
    properties: {
      category: r.category,
      tags: [r.category, ...(r.category === 'güvenlik' ? ['security'] : []), ...(r.cwe ? [`external/cwe/${r.cwe.toLowerCase()}`] : [])],
      ...(r.securitySeverity ? { 'security-severity': r.securitySeverity } : {}),
      ...(r.cwe ? { cwe: r.cwe } : {}),
      pattern: r.pattern,
    },
  }));
  const results = findings.map((f) => {
    const rule = rules[index.get(f.ruleId)];
    const region = { startLine: f.line, startColumn: f.column, ...(f.length ? { endColumn: f.column + f.length } : {}), ...(f.snippet ? { snippet: { text: f.snippet } } : {}) };
    return {
      ruleId: f.ruleId,
      ...(index.has(f.ruleId) ? { ruleIndex: index.get(f.ruleId) } : {}),
      level: LEVEL[f.severity ?? rule?.severity] ?? 'warning',
      message: { text: `${rule?.title ?? f.ruleId}: "${f.pattern}" bulundu.` },
      locations: [{ physicalLocation: { artifactLocation: { uri: toUri(f.file), uriBaseId: '%SRCROOT%' }, region } }],
      ...(f.fingerprint ? { partialFingerprints: { 'iosFingerprint/v1': f.fingerprint } } : {}),
    };
  });
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: tool.name, version: tool.version, semanticVersion: tool.version, ...(tool.informationUri ? { informationUri: tool.informationUri } : {}), rules: sarifRules } },
      automationDetails: { id: `${automationId}/` },
      columnKind: 'utf16CodeUnits',
      results,
    }],
  };
}
