#!/usr/bin/env node
// Komut satırı.
//   node bin/ios.js run ExactMatch --patterns ACGT,GGCC [--ignoreCase] [--strategy auto] < girdi.fasta > cikti.jsonl
//   node bin/ios.js explain --patterns ACGT,GGCC [--ignoreCase] [--strategy auto] < girdi.fasta
//   node bin/ios.js scan (--patterns A,B | --preset todo,secrets,...) [seçenekler] <dosya|klasör>...
//   node bin/ios.js workflow (run|lint|explain|diagram) <is-akisi.json>
//   node bin/ios.js list
// run: stdout'a yalnızca JSONL (satır başına bir Sequence.Match); karar özeti stderr'e.
// Çıkış kodları: 0 başarılı · 1 bulgu var (--fail) ya da iş akışı kapısı kaldı / hata · 2 kullanım hatası.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFasta } from '../src/fasta.js';
import { ExactMatch } from '../src/molecules/ExactMatch.js';
import { registry } from '../src/registry.js';
import { CodeScan } from '../src/workflows/CodeScan.js';
import { PRESETS } from '../src/workflows/presets.js';
import { compileIgnore } from '../src/scan/filters.js';
import { rulesOfFindings } from '../src/scan/rules.js';
import { toSarif, TOOL } from '../src/scan/report.js';
import { createCatalog } from '../src/workflows/catalog.js';
import { deserializeWorkflow, explainWorkflow, runWorkflow } from '../src/workflows/engine.js';
import { lintWorkflow, lintSummary } from '../src/workflows/lint.js';
import { toDot, toMermaid } from '../src/workflows/diagram.js';
import { loadSampleNode } from '../src/workflows/samplesNode.js';

const USAGE = `Kullanım:
  ios run ExactMatch --patterns ACGT,GGCC [--ignoreCase] [--strategy auto|<atom>] < girdi.fasta > cikti.jsonl
  ios run <AtomAdı> --patterns ACGT,GGCC [--ignoreCase] < girdi.fasta
  ios explain --patterns ACGT,GGCC [--ignoreCase] [--strategy auto] < girdi.fasta
  ios scan (--patterns A,B | --preset ${Object.keys(PRESETS).join('|')}[,...]) [seçenekler] <dosya|klasör>...
      --format text|json|sarif   çıktı biçimi (varsayılan text; --json ve --sarif kısaltmaları)
      --fail                     bulgu varsa çıkış kodu 1 (sürekli entegrasyon kapısı)
      --word                     yalnızca tam sözcük eşleşmeleri
      --no-inline-ignore         "ios:ignore" yorumlarını yok say (bastırılmış satırları da raporla)
      --ignore-file <yol>        yok sayılacak yollar (varsayılan: ./.iosignore varsa o)
      --no-ignore-file           .iosignore dosyasını okuma
      --baseline <dosya.sarif>   yalnızca bu eski taramada olmayan (yeni) bulguları raporla
      --no-redact                SARIF'te gizli bilgi değerlerini maskeleme
      --ignoreCase, --strategy <atom>, --quiet
  ios workflow run <is-akisi.json> [--json]     atölyede kurulan iş akışını tarayıcısız çalıştırır
  ios workflow lint <is-akisi.json> [--json]    çalıştırmadan önce denetler (hata varsa çıkış kodu 1)
  ios workflow explain <is-akisi.json>          iş akışını Türkçe cümlelerle anlatır
  ios workflow diagram <is-akisi.json> [--format mermaid|dot]
  ios list
Çıkış kodları: 0 başarılı · 1 bulgu var (--fail), kapı kaldı ya da hata · 2 kullanım hatası`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = {
    patterns: [], ignoreCase: false, strategy: 'auto', format: null, fail: false, presets: [], quiet: false,
    word: false, inlineIgnore: true, ignoreFile: null, useIgnoreFile: true, baseline: null, redact: true, help: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new UsageError(`${a} bir değer bekliyor`);
      return argv[++i];
    };
    if (a === '--patterns' || a === '-p') opts.patterns.push(...value().split(',').filter((s) => s !== ''));
    else if (a === '--pattern') opts.patterns.push(value());
    else if (a === '--ignoreCase' || a === '-i') opts.ignoreCase = true;
    else if (a === '--strategy' || a === '-s') opts.strategy = value();
    else if (a === '--preset') opts.presets.push(...value().split(',').filter((s) => s !== ''));
    else if (a === '--json') opts.format = 'json';
    else if (a === '--sarif') opts.format = 'sarif';
    else if (a === '--format' || a === '-f') opts.format = value();
    else if (a === '--fail') opts.fail = true;
    else if (a === '--word' || a === '-w') opts.word = true;
    else if (a === '--no-inline-ignore') opts.inlineIgnore = false;
    else if (a === '--ignore-file') opts.ignoreFile = value();
    else if (a === '--no-ignore-file') opts.useIgnoreFile = false;
    else if (a === '--baseline') opts.baseline = value();
    else if (a === '--no-redact') opts.redact = false;
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) throw new UsageError(`Bilinmeyen seçenek: ${a}`);
    else positional.push(a);
  }
  return { opts, positional };
}

function readStdinFasta() {
  return parseFasta(readFileSync(0, 'utf8'));
}

/** Çıktıyı küçük parçalar halinde yazar (büyük çıktıda bellek ve hız için). */
function writeLines(lines) {
  let buf = '';
  for (const line of lines) {
    buf += line + '\n';
    if (buf.length > 1 << 16) {
      process.stdout.write(buf);
      buf = '';
    }
  }
  if (buf) process.stdout.write(buf);
}

function cmdRun(component, opts) {
  if (!component) throw new UsageError('run: bileşen adı gerekli (ör. ExactMatch)');
  let strategy = opts.strategy;
  if (component !== 'ExactMatch') {
    if (!registry.has(component)) {
      throw new Error(`Bilinmeyen bileşen "${component}". Geçerli: ExactMatch, ${registry.names().join(', ')}`);
    }
    strategy = component;
  }
  const em = new ExactMatch({ patterns: opts.patterns, ignoreCase: opts.ignoreCase, strategy });
  const entries = readStdinFasta();
  writeLines((function* () {
    for (const m of em.run(entries)) yield JSON.stringify(m);
  })());
  if (!opts.quiet) process.stderr.write(`[ExactMatch] seçilen: ${em.record.selected} — ${em.record.why}\n`);
}

function cmdExplain(opts) {
  const em = new ExactMatch({ patterns: opts.patterns, ignoreCase: opts.ignoreCase, strategy: opts.strategy });
  const entries = readStdinFasta();
  em.decide(entries[0] ?? { header: '', seq: '' });
  process.stdout.write(JSON.stringify(em.record, null, 2) + '\n');
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '_site', '.venv', 'venv', 'dist', 'build']);

/**
 * Dosya ağacını gezer. Gizli (nokta ile başlayan) ve derleme klasörleri, ikili dosyalar,
 * 5 MB'tan büyükler ve yok sayma kalıplarına uyanlar atlanır.
 * @param {string} path
 * @param {string} root
 * @param {{ ignores: (p: string) => boolean }} ignore
 * @param {{ ignored: number }} stats
 */
function* walk(path, root, ignore, stats) {
  const st = statSync(path);
  const rel = relative(root, path).replace(/\\/g, '/');
  if (st.isDirectory()) {
    if (rel && ignore.ignores(rel + '/')) { stats.ignored++; return; }
    for (const name of readdirSync(path).sort()) {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      yield* walk(join(path, name), root, ignore, stats);
    }
  } else if (st.isFile() && st.size <= 5 * 1024 * 1024) {
    if (rel && ignore.ignores(rel)) { stats.ignored++; return; }
    const buf = readFileSync(path);
    if (buf.subarray(0, 8192).includes(0)) return; // ikili dosya
    yield { path: relative(root, path) || path, text: buf.toString('utf8') };
  }
}

/** Taban çizgisi dosyasındaki parmak izleri (SARIF: partialFingerprints). */
function readBaseline(file) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new UsageError(`Taban çizgisi okunamadı (${file}): ${err.message}`);
  }
  const prints = new Set();
  for (const run of doc?.runs ?? []) for (const r of run.results ?? []) {
    const fp = r.partialFingerprints?.['iosFingerprint/v1'];
    if (fp) prints.add(fp);
  }
  if (!Array.isArray(doc?.runs)) throw new UsageError(`Taban çizgisi bir SARIF dosyası değil: ${file} (ios scan --format sarif çıktısı verin)`);
  return prints;
}

function cmdScan(targets, opts) {
  const format = opts.format ?? 'text';
  if (!['text', 'json', 'sarif'].includes(format)) throw new UsageError(`Bilinmeyen biçim "${format}". Geçerli: text, json, sarif`);
  // Desen grupları: her hazır kümenin kendi ignoreCase ayarı var; aynı ayardakiler tek
  // aramada birleşir (molekül her grup için ayrı karar verir).
  const groups = new Map(); // ignoreCase → desenler
  const addGroup = (ic, list) => {
    if (!groups.has(ic)) groups.set(ic, []);
    for (const p of list) if (!groups.get(ic).includes(p)) groups.get(ic).push(p);
  };
  for (const name of opts.presets) {
    const p = PRESETS[name];
    if (!p) throw new UsageError(`Bilinmeyen hazır küme "${name}". Geçerli: ${Object.keys(PRESETS).join(', ')}`);
    addGroup(opts.ignoreCase || p.ignoreCase, p.patterns);
  }
  if (opts.patterns.length) addGroup(opts.ignoreCase || (opts.presets.length === 1 && PRESETS[opts.presets[0]].ignoreCase), opts.patterns);
  if (targets.length === 0) throw new UsageError('scan: en az bir dosya ya da klasör verin');
  if (groups.size === 0) throw new UsageError('scan: --patterns ya da --preset verin');

  /** @type {{ ignores: (p: string) => boolean, patterns: string[] }} */
  let ignore = { ignores: () => false, patterns: [] };
  const ignorePath = opts.ignoreFile ?? (opts.useIgnoreFile && existsSync('.iosignore') ? '.iosignore' : null);
  if (ignorePath && opts.useIgnoreFile) {
    if (!existsSync(ignorePath)) throw new UsageError(`Yok sayma dosyası bulunamadı: ${ignorePath}`);
    ignore = compileIgnore(readFileSync(ignorePath, 'utf8'));
  }
  const walkStats = { ignored: 0 };
  const sources = [];
  for (const t of targets) for (const s of walk(t, process.cwd(), ignore, walkStats)) sources.push(s);
  const order = new Map(sources.map((s, i) => [s.path, i]));

  const details = format === 'sarif' || Boolean(opts.baseline);
  const scans = [];
  let findings = [];
  for (const [ignoreCase, patterns] of groups) {
    const scan = new CodeScan({ patterns, ignoreCase, strategy: opts.strategy, inlineIgnore: opts.inlineIgnore, word: opts.word, details, redact: opts.redact });
    for (const f of scan.run(sources)) findings.push(f);
    scans.push(scan);
  }
  if (scans.length > 1) findings.sort((a, b) => order.get(a.file) - order.get(b.file) || a.position - b.position);

  let known = 0;
  if (opts.baseline) {
    const prints = readBaseline(opts.baseline);
    const before = findings.length;
    findings = findings.filter((f) => !prints.has(f.fingerprint));
    known = before - findings.length;
  }

  if (format === 'sarif') {
    const doc = toSarif(findings, { rules: rulesOfFindings(findings), tool: TOOL });
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  } else {
    writeLines((function* () {
      for (const f of findings) yield format === 'json' ? JSON.stringify({ file: f.file, line: f.line, column: f.column, pattern: f.pattern, position: f.position }) : `${f.file}:${f.line}:${f.column}: ${f.pattern}`;
    })());
  }
  if (!opts.quiet) {
    const suppressed = scans.reduce((s, x) => s + x.stats.suppressed, 0);
    const notWord = scans.reduce((s, x) => s + x.stats.notWholeWord, 0);
    const extra = [
      suppressed ? `${suppressed} bulgu "ios:ignore" yorumuyla bastırıldı` : '',
      notWord ? `${notWord} bulgu tam sözcük olmadığı için elendi` : '',
      walkStats.ignored ? `${walkStats.ignored} yol yok sayma dosyasıyla atlandı` : '',
      opts.baseline ? `${known} bulgu taban çizgisinde zaten vardı` : '',
    ].filter(Boolean).join('; ');
    const selected = scans.map((s) => s.record.selected).join(' + ');
    process.stderr.write(`[scan] ${findings.length} bulgu; seçilen atom: ${selected}${extra ? `; ${extra}` : ''}\n`);
  }
  if (opts.fail && findings.length > 0) process.exitCode = 1;
}

function readWorkflow(file, catalog) {
  if (!file) throw new UsageError('workflow: iş akışı dosyası verin (atölyede "Dışa aktar" ile indirilen JSON)');
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`İş akışı dosyası okunamadı (${file}): ${err.message}`);
  }
  return deserializeWorkflow(data, catalog);
}

/** @param {string[]} args  [alt komut, dosya] */
async function cmdWorkflow(args, opts) {
  const [sub, file] = args;
  const catalog = createCatalog();
  if (!['run', 'lint', 'explain', 'diagram'].includes(sub)) throw new UsageError(`workflow: alt komut run, lint, explain ya da diagram olmalı (verilen: ${sub ?? 'yok'})`);
  const wf = readWorkflow(file, catalog);
  if (sub === 'diagram') {
    const fmt = opts.format ?? 'mermaid';
    if (!['mermaid', 'dot'].includes(fmt)) throw new UsageError(`Bilinmeyen diyagram biçimi "${fmt}". Geçerli: mermaid, dot`);
    process.stdout.write(fmt === 'dot' ? toDot(wf, catalog) : toMermaid(wf, catalog));
    return;
  }
  if (sub === 'explain') {
    process.stdout.write(explainWorkflow(wf, catalog) + '\n');
    return;
  }
  if (sub === 'lint') {
    const findings = lintWorkflow(wf, catalog);
    if (opts.format === 'json') process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
    else for (const f of findings) process.stdout.write(`${f.level}\t${f.code}\t${f.node ?? '-'}\t${f.message}\n`);
    const s = lintSummary(findings);
    if (!opts.quiet) process.stderr.write(`[workflow lint] ${s.hata} hata, ${s['uyarı']} uyarı, ${s.bilgi} bilgi\n`);
    if (s.hata > 0) process.exitCode = 1;
    return;
  }
  const t0 = performance.now();
  const res = await runWorkflow(wf, catalog, { loadSample: loadSampleNode, now: () => performance.now(), yieldEvery: 0 });
  const totalMs = performance.now() - t0;
  const gateFailed = Object.values(res.nodes).some((r) => r.info?.gate === 'kaldı');
  if (opts.format === 'json') {
    const nodes = Object.fromEntries(Object.entries(res.nodes).map(([id, r]) => [id, { status: r.status, summary: r.info?.summary ?? null, count: r.info?.count ?? null, gate: r.info?.gate ?? null, selected: r.info?.record?.selected ?? null, error: r.error }]));
    process.stdout.write(JSON.stringify({ ok: res.ok, gate: gateFailed ? 'kaldı' : 'geçti', problems: res.problems.map((p) => p.message), order: res.order, nodes }, null, 2) + '\n');
  } else {
    for (const p of res.problems) process.stdout.write(`sorun\t${p.message}\n`);
    for (const id of res.order) {
      const r = res.nodes[id];
      process.stdout.write(`${id}\t${r.status}\t${r.info?.summary ?? r.error ?? ''}\n`);
    }
  }
  if (!opts.quiet) process.stderr.write(`[workflow run] ${res.ok ? 'bitti' : 'hata'}${gateFailed ? ' · kapı kaldı' : ''} · ${Math.round(totalMs)} ms\n`);
  if (!res.ok || gateFailed) process.exitCode = 1;
}

function cmdList() {
  for (const name of registry.names()) {
    const A = registry.get(name);
    const auto = A.selection ? 'auto adayı' : 'yalnızca adıyla';
    process.stdout.write(`${name.padEnd(20)} ${A.manifest.title} [${auto}] ${A.manifest.references.join('; ')}\n`);
  }
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const { opts, positional } = parseArgs(rest);
  if (!cmd || cmd === 'help' || opts.help) {
    process.stdout.write(USAGE + '\n');
    return;
  }
  switch (cmd) {
    case 'run': return cmdRun(positional[0], opts);
    case 'explain': return cmdExplain(opts);
    case 'scan': return cmdScan(positional, opts);
    case 'workflow': return cmdWorkflow(positional, opts);
    case 'list': return cmdList();
    default: throw new UsageError(`Bilinmeyen komut: ${cmd}`);
  }
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`hata: ${err.message}\n`);
  if (err instanceof UsageError) process.stderr.write(USAGE + '\n');
  process.exitCode = err instanceof UsageError ? 2 : 1;
});
