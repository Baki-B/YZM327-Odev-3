// Tarama katmanı (src/scan/): kurallar, süzgeçler, parmak izi, maskeleme, SARIF; komut satırının
// yeni seçenekleri; komut satırı ile atölyenin aynı SARIF'i üretmesi; kural örnek dosyaları.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '../../src/workflows/presets.js';
import { RULES, ruleForPattern, rulesFor, rulesOfFindings, isSecretPattern, slug } from '../../src/scan/rules.js';
import { isSuppressed, isWholeWord, compileIgnore, lineAt } from '../../src/scan/filters.js';
import { hash64, maskAfter, snippetOf, toSarif, toUri, TOOL, MASK } from '../../src/scan/report.js';
import { lineStarts } from '../../src/adapters/sourceToEntry.js';
import { CodeScan } from '../../src/workflows/CodeScan.js';
import { createCatalog } from '../../src/workflows/catalog.js';
import { createWorkflow, addNode, connect, runWorkflow, serializeWorkflow } from '../../src/workflows/engine.js';
import { PACKAGES } from '../../src/workflows/packages.js';
import { VERSION } from '../../src/version.js';

const BIN = fileURLToPath(new URL('../../bin/ios.js', import.meta.url));
const FIXTURES = new URL('../data/kurallar/', import.meta.url);

describe('kurallar', () => {
  test('her hazır desenin tek ve kalıcı bir kuralı var', () => {
    const total = Object.values(PRESETS).reduce((s, p) => s + p.patterns.length, 0);
    assert.equal(RULES.length, total);
    assert.equal(new Set(RULES.map((r) => r.id)).size, total, 'kimlikler benzersiz');
    for (const r of RULES) {
      assert.match(r.id, /^[a-z-]+\/[a-z0-9-]+$/);
      assert.ok(['error', 'warning', 'note'].includes(r.severity), r.id);
      assert.ok(r.title && r.help, r.id);
    }
    for (const id of ['todo/todo', 'secrets/akia', 'secrets/begin-rsa-private-key', 'banned-api/eval', 'banned-api/innerhtml', 'errors/panic']) assert.ok(RULES.some((r) => r.id === id), id);
  });
  test('güvenlik kurallarında CWE ve GitHub önem puanı; gizli bilgi kurallarında maskeleme', () => {
    assert.equal(ruleForPattern('eval(').cwe, 'CWE-95');
    assert.equal(ruleForPattern('innerHTML').cwe, 'CWE-79');
    assert.equal(ruleForPattern('pickle.loads').cwe, 'CWE-502');
    assert.equal(ruleForPattern('BEGIN RSA PRIVATE KEY').securitySeverity, '9.0');
    assert.equal(ruleForPattern('api_key').cwe, 'CWE-798');
    assert.equal(isSecretPattern('AKIA'), true);
    assert.equal(isSecretPattern('TODO'), false);
    assert.equal(ruleForPattern('FATAL').severity, 'error');
    assert.equal(ruleForPattern('ERROR').severity, 'warning');
  });
  test('özel desen: "ozel/<desen>" kuralı; kural listeleri sıralı ve tekrarsız', () => {
    assert.equal(ruleForPattern('Merhaba Dünya!').id, 'ozel/merhaba-d-nya');
    assert.equal(slug('!!!'), 'desen');
    const rs = rulesFor(['todo', 'secrets', 'todo'], ['TODO', 'özel']);
    assert.equal(rs.length, PRESETS.todo.patterns.length + PRESETS.secrets.patterns.length + 1);
    const used = rulesOfFindings([{ pattern: 'kendi' }, { pattern: 'AKIA' }, { pattern: 'TODO' }, { pattern: 'AKIA' }]);
    assert.deepEqual(used.map((r) => r.id), ['todo/todo', 'secrets/akia', 'ozel/kendi']);
  });
});

describe('süzgeçler', () => {
  const text = 'a = 1  # TODO\n# ios:ignore-next-line\nb = 2  # TODO\nc = 3  # TODO  ios:ignore\nd  # ios:ignore-next-line ama aynı satır sayılmaz TODO\n';
  const starts = lineStarts(text);
  test('satır içi bastırma: aynı satır ve bir üst satır', () => {
    assert.equal(isSuppressed(text, starts, 1), false);
    assert.equal(isSuppressed(text, starts, 3), true);
    assert.equal(isSuppressed(text, starts, 4), true);
    assert.equal(isSuppressed(text, starts, 5), false, '"-next-line" işareti kendi satırını bastırmaz');
    assert.equal(lineAt('x\r\ny', [0, 3], 1), 'x');
    assert.equal(lineAt('x', [0], 5), '');
  });
  test('tam sözcük: harf/rakam uçlarında sınır aranır, noktalamada aranmaz', () => {
    const t = 'return returned _return x.return() medieval( eval( çreturn';
    const at = (w, from = 0) => t.indexOf(w, from);
    assert.equal(isWholeWord(t, at('return'), 6), true);
    assert.equal(isWholeWord(t, at('returned'), 6), false);
    assert.equal(isWholeWord(t, at('_return') + 1, 6), false);
    assert.equal(isWholeWord(t, at('.return') + 1, 6), true);
    assert.equal(isWholeWord(t, at('medieval(') + 3, 5), false);
    assert.equal(isWholeWord(t, at(' eval(') + 1, 5), true);
    assert.equal(isWholeWord(t, at('çreturn') + 1, 6), false, 'Türkçe harf de sözcük karakteri');
  });
  test('.iosignore: yorum, kök, klasör, joker karakterler', () => {
    const ig = compileIgnore('# yorum\n\nnode_modules/\n/build\n*.min.js\ntests/data/**\ndocs/?.md\n');
    assert.deepEqual(ig.patterns, ['node_modules/', '/build', '*.min.js', 'tests/data/**', 'docs/?.md']);
    assert.equal(ig.ignores('a/node_modules/x.js'), true);
    assert.equal(ig.ignores('node_modules/'), true);
    assert.equal(ig.ignores('build/out.js'), true);
    assert.equal(ig.ignores('src/build/out.js'), false, '/build yalnızca kökte');
    assert.equal(ig.ignores('web/app.min.js'), true);
    assert.equal(ig.ignores('web/app.js'), false);
    assert.equal(ig.ignores('tests/data/kurallar/todo.txt'), true);
    assert.equal(ig.ignores('docs/a.md'), true);
    assert.equal(ig.ignores('docs/ab.md'), false);
    assert.equal(ig.ignores('.\\tests\\data\\x'), true, 'Windows ayıracı');
  });
});

describe('raporlama: parmak izi, maskeleme, SARIF', () => {
  test('hash64 kararlı, 16 hane, farklı girdiye farklı', () => {
    assert.equal(hash64('abc'), hash64('abc'));
    assert.match(hash64('abc'), /^[0-9a-f]{16}$/);
    assert.notEqual(hash64('abc'), hash64('abd'));
  });
  test('maskeleme: atama, tırnak, belirteç devamı; desenin kendisi görünür kalır', () => {
    assert.equal(maskAfter('hunter2 # not', 'password='), `${MASK} # not`);
    assert.equal(maskAfter(' = "abc"', 'API_KEY'), ` = "${MASK}"`);
    assert.equal(maskAfter('": "xyz"}', 'api_key'), `": "${MASK}"}`);
    assert.equal(maskAfter('IOSFODNN7EXAMPLE"', 'AKIA'), `${MASK}"`);
    assert.equal(maskAfter('-----', 'BEGIN RSA PRIVATE KEY'), '-----');
    assert.equal(maskAfter(' dosyası', 'passwd'), ' dosyası');
    assert.equal(maskAfter('', 'x'), '');
    assert.equal(snippetOf('  API_KEY = "abc"', 3, 7, true), `API_KEY = "${MASK}"`);
    assert.equal(snippetOf('  API_KEY = "abc"', 3, 7, false), 'API_KEY = "abc"');
    const long = 'x'.repeat(300) + 'TODO' + 'y'.repeat(300);
    const s = snippetOf(long, 301, 4, false);
    assert.ok(s.length <= 201 && s.includes('TODO') && s.startsWith('…') && s.endsWith('…'), String(s.length));
  });
  test('parmak izi satır numarasından bağımsız: dosyanın başına satır eklenince değişmez', () => {
    const fp = (text) => [...new CodeScan({ patterns: ['TODO'], details: true }).run([{ path: 'a.py', text }])].map((f) => f.fingerprint);
    const a = fp('x = 1  # TODO bir\ny = 2  # TODO bir\n');
    const b = fp('\n\n# yeni başlık\nx = 1  # TODO bir\ny = 2  # TODO bir\n');
    assert.deepEqual(a, b);
    assert.notEqual(a[0], a[1], 'aynı metinli iki satır sıra numarasıyla ayrılır');
  });
  test('SARIF 2.1.0: kurallar, düzeyler, konum, URI kodlama, CWE etiketi, parmak izi', () => {
    const findings = [...new CodeScan({ patterns: [...PRESETS.secrets.patterns], ignoreCase: true, details: true }).run([{ path: 'alt klasör/ayar.py', text: 'API_KEY = "abc"\n' }])];
    const doc = toSarif(findings, { rules: rulesOfFindings(findings), tool: TOOL });
    assert.equal(doc.version, '2.1.0');
    const run = doc.runs[0];
    assert.equal(run.tool.driver.name, 'ios-scan');
    assert.equal(run.tool.driver.version, VERSION);
    assert.equal(run.results.length, 1);
    const r = run.results[0];
    assert.equal(r.ruleId, 'secrets/api-key');
    assert.equal(r.level, 'error');
    assert.equal(run.tool.driver.rules[r.ruleIndex].id, r.ruleId);
    const loc = r.locations[0].physicalLocation;
    assert.equal(loc.artifactLocation.uri, 'alt%20klas%C3%B6r/ayar.py');
    assert.deepEqual([loc.region.startLine, loc.region.startColumn, loc.region.endColumn], [1, 1, 8]);
    assert.equal(loc.region.snippet.text, `API_KEY = "${MASK}"`);
    assert.match(r.partialFingerprints['iosFingerprint/v1'], /^[0-9a-f]{16}$/);
    const rule = run.tool.driver.rules[0];
    assert.ok(rule.properties.tags.includes('security') && rule.properties.tags.includes('external/cwe/cwe-798'));
    assert.equal(rule.properties['security-severity'], '7.5');
    assert.equal(toUri('.\\a\\b c.js'), 'a/b%20c.js');
  });
});

describe('kural örnek dosyaları (semgrep usulü işaretli örnekler)', () => {
  for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.txt'))) {
    const preset = file.replace(/\.txt$/, '');
    test(`${preset}: işaretli her satır beklenen kuralları, işaretsizler hiçbirini tetikler`, () => {
      const lines = readFileSync(new URL(file, FIXTURES), 'utf8').split('\n');
      const expected = new Map();
      const scanned = lines.map((l, i) => {
        if (!l.startsWith('#>')) return l;
        const ids = l.slice(2).trim();
        expected.set(i + 2, ids === '-' ? [] : ids.split(/\s+/));
        return '';
      });
      assert.ok(expected.size >= 5, 'en az beş işaretli örnek');
      const got = new Map();
      for (const f of new CodeScan({ ...PRESETS[preset], details: true }).run([{ path: file, text: scanned.join('\n') }])) {
        if (!got.has(f.line)) got.set(f.line, []);
        got.get(f.line).push(f.ruleId);
      }
      for (let line = 1; line <= lines.length; line++) {
        assert.deepEqual(got.get(line) ?? [], expected.get(line) ?? [], `${file}:${line}: ${lines[line - 1]}`);
      }
    });
  }
  test('--word: bilinen yanlış pozitifler (XXXL, medieval) elenir', () => {
    const one = (preset, text) => [...new CodeScan({ ...PRESETS[preset], word: true }).run([{ path: 'x', text }])].length;
    assert.equal(one('todo', 'beden = "XXXL"'), 0);
    assert.equal(one('todo', '# XXX: not'), 1);
    assert.equal(one('banned-api', 'medieval(x)'), 0);
    assert.equal(one('banned-api', 'y = eval(x)'), 1);
  });
});

describe('komut satırı ile atölye aynı SARIF\'i üretir', () => {
  test('aynı dosyalar, aynı kurallar, aynı sonuçlar ve parmak izleri', async () => {
    const files = [
      { path: 'a.py', text: 'x = 1  # TODO bir\nAPI_KEY = "abc"\n# ios:ignore-next-line\n# TODO bastırıldı\n' },
      { path: 'b/c.js', text: 'el.innerHTML = s; // FIXME\n' },
    ];
    const patterns = [...PRESETS.todo.patterns];
    const cli = [...new CodeScan({ patterns, details: true }).run(files)];
    const cliDoc = toSarif(cli, { rules: rulesOfFindings(cli), tool: TOOL });
    const catalog = createCatalog();
    const wf = createWorkflow();
    addNode(wf, catalog, 'kaynak.dosyalar', { id: 'src', params: { files } });
    addNode(wf, catalog, 'uyarlayici.kaynak', { id: 'ad' });
    addNode(wf, catalog, 'desen.todo', { id: 'pat' });
    addNode(wf, catalog, 'molekul.ExactMatch', { id: 'em' });
    addNode(wf, catalog, 'uyarlayici.bulgu', { id: 'bul' });
    addNode(wf, catalog, 'cikti.sarif', { id: 'sarif' });
    connect(wf, catalog, { node: 'src', port: 'files' }, { node: 'ad', port: 'files' });
    connect(wf, catalog, { node: 'ad', port: 'entries' }, { node: 'em', port: 'entries' });
    connect(wf, catalog, { node: 'pat', port: 'patterns' }, { node: 'em', port: 'patterns' });
    connect(wf, catalog, { node: 'em', port: 'matches' }, { node: 'bul', port: 'matches' });
    connect(wf, catalog, { node: 'bul', port: 'findings' }, { node: 'sarif', port: 'findings' });
    const res = await runWorkflow(wf, catalog, { yieldEvery: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.nodes.sarif.info.sarif, JSON.stringify(cliDoc, null, 2) + '\n');
    assert.equal(res.nodes.bul.info.suppressed, 1);
    assert.equal(cliDoc.runs[0].results.length, 2);
    assert.ok(serializeWorkflow(wf).nodes.find((n) => n.id === 'bul').params.inlineIgnore);
  });
});

// ------------------------------------------------------------------ komut satırı
function ios(args, cwd) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function project() {
  const dir = mkdtempSync(join(tmpdir(), 'ios-scan2-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'vendor'));
  writeFileSync(join(dir, 'src', 'a.py'), 'x = 1  # TODO bir\ny = eval(s)  # FIXME  ios:ignore\nAPI_KEY = "abc"\nreturned = 1\n');
  writeFileSync(join(dir, 'vendor', 'lib.js'), '// TODO dış kütüphane\n');
  return dir;
}

describe('ios scan: yeni seçenekler', () => {
  test('birden çok hazır küme tek komutta; büyük/küçük harf ayarları ayrı gruplarda', () => {
    const dir = project();
    const r = ios(['scan', '--preset', 'todo,secrets', '--preset', 'banned-api', 'src'], dir);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(r.out.trimEnd().split('\n'), [join('src', 'a.py') + ':1:10: TODO', join('src', 'a.py') + ':3:1: api_key']);
    assert.match(r.err, /2 bulgu "ios:ignore" yorumuyla bastırıldı/);
    assert.match(r.err, /seçilen atom: \w+ \+ \w+/);
  });
  test('--no-inline-ignore bastırılmış satırları da raporlar; --word tam sözcük', () => {
    const dir = project();
    assert.equal(ios(['scan', '--preset', 'todo', '--no-inline-ignore', 'src'], dir).out.trimEnd().split('\n').length, 2);
    assert.equal(ios(['scan', '--patterns', 'return', 'src'], dir).out.trimEnd().split('\n').length, 1);
    assert.equal(ios(['scan', '--patterns', 'return', '--word', 'src'], dir).out, '');
  });
  test('.iosignore varsayılan olarak okunur; --no-ignore-file ve --ignore-file', () => {
    const dir = project();
    writeFileSync(join(dir, '.iosignore'), '# dış kod\nvendor/\n');
    const r = ios(['scan', '--preset', 'todo', '.'], dir);
    assert.equal(r.out.trimEnd().split('\n').length, 1);
    assert.match(r.err, /1 yol \.iosignore ile atlandı/);
    assert.equal(ios(['scan', '--preset', 'todo', '--no-ignore-file', '.'], dir).out.trimEnd().split('\n').length, 2);
    writeFileSync(join(dir, 'baska.ignore'), 'src/\n');
    assert.equal(ios(['scan', '--preset', 'todo', '--ignore-file', 'baska.ignore', '.'], dir).out.trimEnd().split('\n').length, 1);
    assert.equal(ios(['scan', '--preset', 'todo', '--ignore-file', 'yok.ignore', '.'], dir).code, 2);
  });
  test('--format sarif geçerli SARIF; --baseline yalnızca yeni bulguları verir; --fail', () => {
    const dir = project();
    const s = ios(['scan', '--preset', 'todo,secrets', '--format', 'sarif', 'src'], dir);
    assert.equal(s.code, 0, s.err);
    const doc = JSON.parse(s.out);
    assert.equal(doc.runs[0].results.length, 2);
    assert.equal(doc.runs[0].results[1].locations[0].physicalLocation.region.snippet.text, `API_KEY = "${MASK}"`);
    writeFileSync(join(dir, 'eski.sarif'), s.out);
    writeFileSync(join(dir, 'src', 'a.py'), '\n# başa eklenen satır\n' + readFileSync(join(dir, 'src', 'a.py'), 'utf8') + '# TODO yeni\n');
    const b = ios(['scan', '--preset', 'todo,secrets', '--baseline', 'eski.sarif', '--fail', 'src'], dir);
    assert.equal(b.code, 1);
    assert.deepEqual(b.out.trimEnd().split('\n'), [join('src', 'a.py') + ':7:3: TODO']);
    assert.match(b.err, /2 bulgu taban çizgisinde zaten vardı/);
    const unmasked = JSON.parse(ios(['scan', '--preset', 'secrets', '--sarif', '--no-redact', 'src'], dir).out);
    assert.equal(unmasked.runs[0].results[0].locations[0].physicalLocation.region.snippet.text, 'API_KEY = "abc"');
  });
  test('kullanım hataları çıkış kodu 2: bilinmeyen biçim, küme, bozuk taban çizgisi, desensiz tarama', () => {
    const dir = project();
    writeFileSync(join(dir, 'bozuk.sarif'), '{"x":1}');
    assert.equal(ios(['scan', '--preset', 'todo', '--format', 'xml', 'src'], dir).code, 2);
    assert.equal(ios(['scan', '--preset', 'yok', 'src'], dir).code, 2);
    assert.equal(ios(['scan', '--preset', 'todo', '--baseline', 'bozuk.sarif', 'src'], dir).code, 2);
    assert.equal(ios(['scan', '--preset', 'todo', '--baseline', 'olmayan.sarif', 'src'], dir).code, 2);
    assert.equal(ios(['scan', 'src'], dir).code, 2);
    assert.equal(ios(['scan', '--preset', 'todo'], dir).code, 2);
  });
});

describe('ios workflow: atölyede kurulan iş akışı komut satırında', () => {
  const pkgFile = (id) => {
    const dir = mkdtempSync(join(tmpdir(), 'ios-wf-'));
    const file = join(dir, `${id}.json`);
    writeFileSync(file, JSON.stringify(PACKAGES.find((p) => p.id === id).build()));
    return { dir, file };
  };
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));
  test('run: paket bulgu sayısı atölyeyle aynı; kapı kalınca çıkış kodu 1', () => {
    const { file } = pkgFile('gizli-bilgi');
    const r = ios(['workflow', 'run', file, '--json'], ROOT);
    assert.equal(r.code, 1, 'gizli bilgi bulundu: kapı kaldı');
    const out = JSON.parse(r.out);
    assert.equal(out.gate, 'kaldı');
    assert.equal(out.nodes.bulgu.count, PACKAGES.find((p) => p.id === 'gizli-bilgi').expected.bulgu);
    const t = ios(['workflow', 'run', pkgFile('teknik-borc').file], ROOT);
    assert.equal(t.code, 0, t.err);
    assert.match(t.out, /bulgu\tbitti\t18 bulgu/);
  });
  test('lint, explain, diagram', () => {
    const { dir, file } = pkgFile('log');
    assert.equal(ios(['workflow', 'lint', file], ROOT).code, 0);
    assert.match(ios(['workflow', 'explain', file], ROOT).out, /"Log incelemesi" iş akışında/);
    assert.match(ios(['workflow', 'diagram', file], ROOT).out, /^flowchart LR/);
    assert.match(ios(['workflow', 'diagram', file, '--format', 'dot'], ROOT).out, /^digraph/);
    const broken = JSON.parse(readFileSync(file, 'utf8'));
    broken.edges = [];
    writeFileSync(join(dir, 'bozuk.json'), JSON.stringify(broken));
    const l = ios(['workflow', 'lint', join(dir, 'bozuk.json'), '--json'], ROOT);
    assert.equal(l.code, 1);
    assert.ok(JSON.parse(l.out).some((f) => f.level === 'hata'));
    assert.equal(ios(['workflow', 'fly', file], ROOT).code, 2);
    assert.equal(ios(['workflow', 'run'], ROOT).code, 2);
    assert.equal(ios(['workflow', 'diagram', file, '--format', 'png'], ROOT).code, 2);
    assert.equal(ios(['workflow', 'run', join(dir, 'olmayan.json')], ROOT).code, 1);
  });
});
