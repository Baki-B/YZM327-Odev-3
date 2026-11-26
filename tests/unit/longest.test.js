// En uzun eşleşme süzgeci (src/scan/filters.js, leftmostLongest): tanımdan kaba kuvvetle
// hesaplanan sonuçla rastgele vakalarda karşılaştırılır; komut satırı (CodeScan, --longest) ve
// atölyenin "Eşleşme → Bulgu" kutusu aynı bulguları verir.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leftmostLongest } from '../../src/scan/filters.js';
import { AhoCorasickSearch } from '../../src/atomic/AhoCorasickSearch.js';
import { CodeScan } from '../../src/workflows/CodeScan.js';
import { ExactMatch } from '../../src/molecules/ExactMatch.js';
import { matchesToFindings } from '../../src/workflows/catalog.js';
import { sourceToEntry } from '../../src/adapters/sourceToEntry.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const search = (patterns, seq, header = 'k') => [...new AhoCorasickSearch({ patterns }).process({ header, seq })];
const brief = (list) => list.map((m) => `${m.pattern}@${m.position}`);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tanım: bütün eşleşmeler konuma, sonra uzunluğa (büyükten), sonra desen sırasına göre; açgözlü seçim. */
function oracle(patterns, text) {
  const all = [];
  for (let pos = 0; pos < text.length; pos++) {
    patterns.forEach((p, i) => { if (text.startsWith(p, pos)) all.push({ pattern: p, position: pos, length: p.length, i }); });
  }
  all.sort((a, b) => a.position - b.position || b.length - a.length || a.i - b.i);
  const out = [];
  let end = 0;
  for (const m of all) if (m.position >= end) { out.push(m); end = m.position + m.length; }
  return out;
}

describe('en uzun eşleşme süzgeci', () => {
  test('iç içe desenler: aynı konumda en uzunu, örtüşen sonrakiler atlanır', () => {
    const matches = search(['pass', 'password', 'word'], 'password=1 pass');
    assert.deepEqual(brief(matches), ['pass@0', 'password@0', 'word@4', 'pass@11']);
    assert.deepEqual(brief([...leftmostLongest(matches, (m) => m.header)]), ['password@0', 'pass@11']);
  });

  test('her kayıt (dosya) ayrı süzülür', () => {
    const a = search(['ab', 'abc'], 'abcab', 'a');
    const b = search(['ab', 'abc'], 'abc', 'b');
    assert.deepEqual([...leftmostLongest([...a, ...b], (m) => m.header)].map((m) => `${m.header}:${m.pattern}@${m.position}`), ['a:abc@0', 'a:ab@3', 'b:abc@0']);
  });

  test('300 rastgele vakada tanımla aynı', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const alphabet = 'abc';
      const pick = () => alphabet[Math.floor(r() * alphabet.length)];
      const text = Array.from({ length: Math.floor(r() * 120) }, pick).join('');
      const patterns = [...new Set(Array.from({ length: 1 + Math.floor(r() * 5) }, () => Array.from({ length: 1 + Math.floor(r() * 5) }, pick).join('')))];
      const got = [...leftmostLongest(search(patterns, text), (m) => m.header)];
      assert.deepEqual(brief(got), brief(oracle(patterns, text)), `tohum ${seed}: ${JSON.stringify(patterns)}`);
    }
  });

  test('komut satırı (CodeScan) = atölye kutusu; süzülen sayısı raporlanır', () => {
    const files = [
      { path: 'a.py', text: 'password = "x"  # pass\nuser_password = 1\n' },
      { path: 'b.js', text: 'const pass = getPassword(); // password\n' },
    ];
    const patterns = ['pass', 'password', 'Password'];
    const scan = new CodeScan({ patterns, longest: true });
    const cli = [...scan.run(files)];
    const all = [...new CodeScan({ patterns }).run(files)];
    assert.ok(cli.length < all.length);
    assert.equal(scan.stats.notLongest, all.length - cli.length);
    const entries = files.map(sourceToEntry);
    const matches = [...new ExactMatch({ patterns, strategy: 'auto' }).run(entries)];
    const ui = matchesToFindings({ matches, entries }, { longest: true });
    const key = (f) => `${f.file}:${f.line}:${f.column}:${f.pattern}`;
    assert.deepEqual(ui.findings.map(key), cli.map(key));
    assert.equal(ui.notLongest, all.length - cli.length);
  });

  test('ios scan --longest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'en-uzun-'));
    try {
      writeFileSync(join(dir, 'x.txt'), 'password pass\n');
      const run = (...extra) => spawnSync(process.execPath, ['bin/ios.js', 'scan', '--patterns', 'pass,password', ...extra, '--json', dir], { cwd: ROOT, encoding: 'utf8' });
      const lines = (r) => r.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      assert.deepEqual(lines(run()).map((f) => `${f.pattern}@${f.column}`), ['pass@1', 'password@1', 'pass@10']);
      assert.deepEqual(lines(run('--longest')).map((f) => `${f.pattern}@${f.column}`), ['password@1', 'pass@10']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
