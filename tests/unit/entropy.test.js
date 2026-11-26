// Entropi süzgeci (src/scan/entropy.js): Shannon entropisi bilinen değerlerde ve rastgele
// dizgilerde (sınırlar, sıradan bağımsızlık); değerin satırdan okunması; komut satırı (CodeScan,
// --min-entropy) ile atölyenin "Eşleşme → Bulgu" kutusu aynı bulguları verir. Gizli bilgi örnekleri
// açıkça sahtedir (SAHTE...).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shannonEntropy, secretValue, isLowEntropy } from '../../src/scan/entropy.js';
import { CodeScan } from '../../src/workflows/CodeScan.js';
import { ExactMatch } from '../../src/molecules/ExactMatch.js';
import { matchesToFindings } from '../../src/workflows/catalog.js';
import { sourceToEntry } from '../../src/adapters/sourceToEntry.js';
import { PRESETS } from '../../src/workflows/presets.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const near = (a, b) => Math.abs(a - b) < 1e-9;

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

/** Bulgunun değeri: deseni metinde bulur, secretValue'ya verir. */
const valueOf = (line, pattern) => secretValue(line, line.toLowerCase().indexOf(pattern.toLowerCase()), pattern.length);

const FILE = [
  'api_key = "SAHTEoRnEk9Q2xZ7wLm4Tn8Vb6Kc1Pq"', // yüksek entropi: kalır
  'token=XXXX-XXXX-XXXX', // yer tutucu: atılır
  '"apikey": "SAHTE-4f9c2e7a1b8d3f60"', // JSON: kalır
  'passwd: changeme', // YAML, düşük entropi: atılır
  '-----BEGIN RSA PRIVATE KEY-----', // değer yok: kalır
  'AKIASAHTEORNEK7Q2XZ9', // önek: sözcüğün tamamı, kalır
  'secret_key = getenv()', // değişken: atılır
  '# TODO: gizli bilgi kuralı değil, süzgeçten etkilenmez',
  '',
].join('\n');

describe('entropi süzgeci', () => {
  test('Shannon entropisi: bilinen değerler', () => {
    assert.equal(shannonEntropy(''), 0);
    assert.equal(shannonEntropy('aaaa'), 0);
    assert.ok(near(shannonEntropy('ab'), 1));
    assert.ok(near(shannonEntropy('abcd'), 2));
    assert.ok(near(shannonEntropy('0123456789abcdef'), 4));
    assert.ok(near(shannonEntropy('aab'), -(2 / 3) * Math.log2(2 / 3) - (1 / 3) * Math.log2(1 / 3)));
    assert.ok(near(shannonEntropy('ğüşiöç'), Math.log2(6)), 'Türkçe harfler tek karakter sayılır');
    // belgelerdeki örnekler (docs/anlatim.md, KARARLAR 54): yer tutucular ve zayıf parola 3 bitin altında
    for (const weak of ['changeme', 'XXXX-XXXX-XXXX', 'hunter2', 'os.environ']) assert.ok(shannonEntropy(weak) < 3, weak);
    assert.ok(shannonEntropy('SAHTEoRnEk9Q2xZ7wLm4Tn8Vb6Kc1Pq') > 4, 'rastgele görünen sahte anahtar 4 bitin üstünde');
  });

  test('rastgele dizgilerde: 0 ≤ H ≤ log₂(farklı karakter sayısı), sıradan bağımsız', () => {
    const alphabet = 'abcXYZ019+/=_-ç';
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const s = Array.from({ length: 1 + Math.floor(r() * 60) }, () => alphabet[Math.floor(r() * alphabet.length)]);
      const h = shannonEntropy(s.join(''));
      const distinct = new Set(s).size;
      assert.ok(h >= 0 && h <= Math.log2(distinct) + 1e-9, `tohum ${seed}`);
      if (distinct === 1) assert.equal(h, 0);
      const shuffled = [...s].sort(() => r() - 0.5).join('');
      assert.ok(near(h, shannonEntropy(shuffled)), `tohum ${seed}: sıra entropiyi değiştirmemeli`);
    }
  });

  test('değerin okunması: atama biçimleri, önek, değer yok', () => {
    const cases = [
      ['password=hunter2 # yorum', 'password=', 'hunter2'],
      ['token="SAHTE123"', 'token=', 'SAHTE123'],
      ['api_key = "SAHTEabc"', 'api_key', 'SAHTEabc'],
      ["api_key: 'SAHTEabc'", 'api_key', 'SAHTEabc'],
      ['"apikey": "SAHTEabc",', 'apikey', 'SAHTEabc'],
      ['secret_key := SAHTEabc;', 'secret_key', 'SAHTEabc'],
      ['apikey => SAHTEabc', 'apikey', 'SAHTEabc'],
      ['api_key == SAHTEabc', 'api_key', 'SAHTEabc'],
      ['x = os.environ["API_KEY"]  # api_key', 'api_key', null],
      ['api_key = os.environ["PW"]', 'api_key', 'os.environ'],
      ['AKIASAHTE7Q2X rest', 'AKIA', 'AKIASAHTE7Q2X'],
      ['-----BEGIN RSA PRIVATE KEY-----', 'BEGIN RSA PRIVATE KEY', null],
      ['parolanızı (password) girin', 'password', null],
      ['api_key = ""', 'api_key', ''],
      ['api_key =\nSAHTE', 'api_key', ''],
    ];
    for (const [line, pattern, want] of cases) assert.equal(valueOf(line, pattern), want, line);
    assert.equal(isLowEntropy('api_key = ""', 0, 7, 3), true, 'boş değer atılır');
    assert.equal(isLowEntropy('api_key = ""', 0, 7, 0), false, 'eşik 0: süzgeç kapalı');
    assert.equal(isLowEntropy('parola (password)', 8, 8, 3), false, 'değer yoksa bulgu kalır');
  });

  test('komut satırı (CodeScan) = atölye kutusu; yalnızca gizli bilgi kuralları süzülür', () => {
    const files = [{ path: 'ayar.py', text: FILE }];
    const patterns = [...PRESETS.secrets.patterns, 'TODO'];
    const key = (f) => `${f.line}:${f.pattern}`;
    const all = [...new CodeScan({ patterns, ignoreCase: true }).run(files)];
    const scan = new CodeScan({ patterns, ignoreCase: true, minEntropy: 3 });
    const cli = [...scan.run(files)];
    assert.deepEqual(all.map(key), ['1:api_key', '2:token=', '3:apikey', '4:passwd', '5:BEGIN RSA PRIVATE KEY', '6:AKIA', '7:secret_key', '8:TODO']);
    assert.deepEqual(cli.map(key), ['1:api_key', '3:apikey', '5:BEGIN RSA PRIVATE KEY', '6:AKIA', '8:TODO']);
    assert.equal(scan.stats.lowEntropy, 3);
    const entries = files.map(sourceToEntry);
    const matches = [...new ExactMatch({ patterns, ignoreCase: true, strategy: 'auto' }).run(entries)];
    const ui = matchesToFindings({ matches, entries }, { minEntropy: 3 });
    assert.deepEqual(ui.findings.map(key), cli.map(key));
    assert.equal(ui.lowEntropy, 3);
    const strict = [...new CodeScan({ patterns, ignoreCase: true, minEntropy: 4.5 }).run(files)].map(key);
    assert.ok(strict.length < cli.length && strict.includes('5:BEGIN RSA PRIVATE KEY') && strict.includes('8:TODO'), 'eşik yükselince daha çok bulgu atılır');
  });

  test('ios scan --min-entropy; geçersiz eşik kullanım hatası', () => {
    const dir = mkdtempSync(join(tmpdir(), 'entropi-'));
    try {
      writeFileSync(join(dir, 'ayar.py'), FILE);
      const run = (...extra) => spawnSync(process.execPath, ['bin/ios.js', 'scan', '--preset', 'secrets', ...extra, '--json', dir], { cwd: ROOT, encoding: 'utf8' });
      const lines = (r) => r.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).line);
      assert.deepEqual(lines(run()), [1, 2, 3, 4, 5, 6, 7]);
      const r = run('--min-entropy', '3');
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(lines(r), [1, 3, 5, 6]);
      assert.match(r.stderr, /3 gizli bilgi bulgusu değeri düşük entropili olduğu için elendi/);
      assert.deepEqual(lines(run('--min-entropy', '3,0')), [1, 3, 5, 6], 'ondalık virgül');
      const bad = run('--min-entropy', 'yüksek');
      assert.equal(bad.status, 2);
      assert.match(bad.stderr, /--min-entropy bir sayı bekliyor/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
