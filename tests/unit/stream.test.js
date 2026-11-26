// Akış kipi (src/stream.js): özellik tabanlı test. Rastgele metin, desen ve parça sınırlarında,
// her atom ve molekül için "parçalı sonuç = bütün sonuç": aynı eşleşmeler, aynı sırada, tam bir kez.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { searchChunks, chunksOf } from '../../src/stream.js';
import { BUILTIN } from '../../src/registry.js';
import { ExactMatch } from '../../src/molecules/ExactMatch.js';

/** Tohumlu sözde rastgele sayı üreteci (mulberry32): her çalıştırmada aynı vakalar. */
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

const ALPHABETS = ['ACGT', '01', 'abcAB ', 'aé😀b']; // DNA, ikili, ASCII (ignoreCase), vekil çiftli
const whole = (searcher, text) => [...searcher.process({ header: 'akış', seq: text })];
const molecule = (params) => {
  const em = new ExactMatch({ ...params, strategy: 'auto' });
  return { process: (entry) => em.run([entry]) };
};

/** Rastgele parçalara böler: 1 karakterlik, desenden kısa ve boş parçalar dahil. */
function randomChunks(text, r) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const size = r() < 0.15 ? 0 : 1 + Math.floor(r() * (r() < 0.5 ? 4 : 60));
    out.push(text.slice(i, i + size));
    i += size;
  }
  return out;
}

describe('akış kipi', () => {
  test('örnek: sınırda bölünen eşleşme bir kez, metnin başına göre konumla bulunur', () => {
    const Horspool = BUILTIN.find((A) => A.manifest.name === 'HorspoolSearch');
    const params = { patterns: ['ACGT', 'GTA'] };
    const got = [...searchChunks(new Horspool(params), params.patterns, ['TTAC', 'GTAC', 'GT'])];
    assert.deepEqual(got.map((m) => [m.pattern, m.position]), [['ACGT', 2], ['GTA', 4], ['ACGT', 6]]);
    assert.deepEqual(got, whole(new Horspool(params), 'TTACGTACGT'));
  });

  test('boş girdi ve boş parçalar; 1 karakterlik desen (örtüşme yok)', () => {
    const Kmp = BUILTIN.find((A) => A.manifest.name === 'KmpSearch');
    assert.deepEqual([...searchChunks(new Kmp({ patterns: ['A'] }), ['A'], [])], []);
    assert.deepEqual([...searchChunks(new Kmp({ patterns: ['A'] }), ['A'], ['', 'A', '', 'BA'])].map((m) => m.position), [0, 2]);
  });

  test('her atom ve molekül: 150 rastgele vakada parçalı sonuç = bütün sonuç', () => {
    let compared = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed);
      const alphabet = [...ALPHABETS[seed % ALPHABETS.length]];
      const pick = () => alphabet[Math.floor(r() * alphabet.length)];
      const text = Array.from({ length: Math.floor(r() * 400) }, pick).join('');
      const patterns = Array.from({ length: 1 + Math.floor(r() * 5) }, () => Array.from({ length: 1 + Math.floor(r() * 7) }, pick).join(''));
      if (r() < 0.3) patterns.push(patterns[0]); // yinelenen desen
      const ignoreCase = alphabet.includes('A') && r() < 0.5;
      const params = { patterns, ignoreCase };
      const chunks = randomChunks(text, r);
      for (const make of [...BUILTIN.map((A) => (p) => new A(p)), molecule]) {
        let expected;
        try {
          expected = whole(make(params), text);
        } catch {
          continue; // bu desenler bu atoma uygun değil (ör. alfabe sınırı); bütün arama da yapılamıyor
        }
        const got = [...searchChunks(make(params), patterns, chunks)];
        assert.deepEqual(got, expected, `tohum ${seed}, ${make.name}, parçalar ${JSON.stringify(chunks.slice(0, 5))}…`);
        compared++;
      }
    }
    assert.ok(compared >= 1000, `${compared} karşılaştırma`);
  });

  test('parça boyutu 1 ile metnin tamamı arasında her boyut aynı sonucu verir', () => {
    const Bm = BUILTIN.find((A) => A.manifest.name === 'BoyerMooreSearch');
    const text = 'ABABABAB ABBA BAB'.repeat(5);
    const params = { patterns: ['ABA', 'BAB', 'ABBA'] };
    const expected = whole(new Bm(params), text);
    for (let size = 1; size <= text.length; size++) {
      assert.deepEqual([...searchChunks(new Bm(params), params.patterns, chunksOf(text, size))], expected, `boyut ${size}`);
    }
  });
});
