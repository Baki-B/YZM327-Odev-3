// Mutasyon denetimi: koda bilerek küçük hatalar yerleştirip testlerin bunları
// yakalayıp yakalamadığına bakar. Her mutasyon projenin geçici bir kopyasında,
// tek başına uygulanır; `npm test` ile aynı komut çalıştırılır.
// Bir mutasyon "yakalandı" sayılır, eğer en az bir test başarısız olursa.
// Çıktı: docs/mutasyon.md
// Kullanım: npm run mutation

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const MUTATIONS = [
  {
    file: 'src/functions/horspool.js', what: 'Horspool kayması bir fazla (m − i)',
    from: 'shift[p[i]] = m - 1 - i;', to: 'shift[p[i]] = m - i;',
  },
  {
    file: 'src/functions/kmp.js', what: 'KMP uyuşmazlıkta sınırı unutur (q = 0)',
    from: 'while (q > 0 && p[q] !== c) q = fail[q - 1];', to: 'while (q > 0 && p[q] !== c) q = 0;',
  },
  {
    file: 'src/functions/bm4dnaDs.js', what: 'bm4DNADS sentinel denetiminde < yerine <= (j > n)',
    from: 'if (j >= n) return;', to: 'if (j > n) return;',
  },
  {
    file: 'src/functions/bm4dnaHmbs.js', what: 'bm4DNAHMbs desende olmayan q-gram için m kadar kayar (ödevin ipucu hatası)',
    from: 'const dflt = m - q + 1;', to: 'const dflt = m;',
  },
  {
    file: 'src/functions/shiftOr.js', what: 'Shift-Or (m > 32) son pencereyi atlar',
    from: 'const limit = n - m + w;', to: 'const limit = n - m + w - 1;',
  },
  {
    file: 'src/functions/wuManber.js', what: 'Wu-Manber çakışmada en küçük kaymayı değil sonuncuyu tutar',
    from: 'if (sft < shift[h]) shift[h] = sft;', to: 'shift[h] = sft;',
  },
  {
    file: 'src/functions/ahoCorasick.js', what: 'Aho-Corasick sözlük bağlarını kurmaz (iç içe desenler kaçar)',
    from: 'dict[s] = word[f] !== -1 ? f : dict[f];', to: 'dict[s] = -1;',
  },
  {
    file: 'src/functions/hits.js', what: 'Sonuçlar sıralanmaz',
    from: 'const keys = this.keys.subarray(0, this.count).sort();', to: 'const keys = this.keys.subarray(0, this.count);',
  },
  {
    file: 'src/functions/alphabet.js', what: 'ignoreCase ASCII sınırı bir fazla ({ → [)',
    from: 'return code >= 97 && code <= 122 ? code - 32 : code;', to: 'return code >= 97 && code <= 123 ? code - 32 : code;',
  },
  {
    file: 'src/atomic/ExactSearchAtom.js', what: 'Metinden uzun bir desen varsa hiç aranmaz (minLen yerine maxLen)',
    from: 'if (n > 0 && this.minLen <= n) {', to: 'if (n > 0 && this.maxLen <= n) {',
  },
  {
    file: 'src/functions/boyerMoore.js', what: 'Boyer-Moore tam eşleşmeden sonra iyi sonek kayması yerine m kayar (örtüşen eşleşme kaçar)',
    from: 's += good[0];', to: 's += m;',
  },
  {
    file: 'src/molecules/ExactMatch.js', what: 'Molekül en pahalı atomu seçer (sıralama ters)',
    from: 'ranked.sort((a, b) => a.seconds - b.seconds);', to: 'ranked.sort((a, b) => b.seconds - a.seconds);',
  },  // İş akışı, tarama ve arayüz katmanları (geri al / yinele, denetim, süzgeçler, SARIF, roller)
  {
    file: "src/workflows/history.js", what: "Geri alınan komut yinele yığınına konmaz",
    from: "    this.#redo.push(cmd);", to: "    // this.#redo.push(cmd);",
  },
  {
    file: "src/workflows/history.js", what: "Birleştirme seal() sonrasında da sürer (ayrı adımlar tek adıma karışır)",
    from: "if (!this.#sealed && top && cmd.key !== undefined", to: "if (top && cmd.key !== undefined",
  },
  {
    file: "src/workflows/history.js", what: "Kutu silmeyi geri almak bağlantıları eski sırasına koymaz",
    from: "for (const { i, edge } of saved.edges) doc.wf.edges.splice(i, 0, clone(edge));", to: "for (const { edge } of saved.edges) doc.wf.edges.push(clone(edge));",
  },
  {
    file: "src/workflows/lint.js", what: "Çıkmaz kutu denetimi çıkış yerine giriş bağlantısına bakar",
    from: "!wf.edges.some((e) => e.from.node === n.id)", to: "!wf.edges.some((e) => e.to.node === n.id)",
  },
  {
    file: "src/scan/filters.js", what: "\"ios:ignore-next-line\" alttaki satırı değil kendi satırını bastırır",
    from: "return line > 1 && lineAt(text, starts, line - 1).includes(INLINE_IGNORE_NEXT);", to: "return line > 1 && lineAt(text, starts, line).includes(INLINE_IGNORE_NEXT);",
  },
  {
    file: "src/scan/filters.js", what: "Tam sözcük: sağ sınır yanlış karakterde denetlenir",
    from: "if (isWordChar(last) && isWordChar(text[position + length])) return false;", to: "if (isWordChar(last) && isWordChar(text[position + length - 1])) return false;",
  },
  {
    file: "src/scan/report.js", what: "Gizli bilgi değeri maskelenmez",
    from: "  return after.slice(0, i) + MASK + after.slice(j);", to: "  return after;",
  },
  {
    file: "src/scan/report.js", what: "Aynı metinli iki satır aynı parmak izini alır (sıra numarası artmaz)",
    from: "    seen.set(base, k + 1);", to: "    seen.set(base, k);",
  },
  {
    file: "src/scan/report.js", what: "SARIF'te önem düzeyi her zaman \"warning\"",
    from: "      level: LEVEL[f.severity ?? rule?.severity] ?? 'warning',", to: "      level: 'warning',",
  },
  {
    file: "src/workflows/engine.js", what: "Tür denetimi kapalı: uyumsuz uçlar bağlanır",
    from: "  if (out.type !== inp.type) {", to: "  if (false) {",
  },
  {
    file: "src/contracts.js", what: "Rol denetimi selection.features işlevini aramaz",
    from: "      if (!isFn(s.features)) out.push('selection.features bir işlev olmalı');", to: "      // features denetimi unutuldu",
  },
  {
    file: "web/lib/geometry.js", what: "Sığdırma telefonda da masaüstü alt sınırını kullanır (yazılar okunmaz)",
    from: "  return Math.max(mobile ? 0.7 : 0.45, z);", to: "  return Math.max(0.45, z);",
  },
  {
    file: "src/workflows/CodeScan.js", what: "Satır içi bastırma varsayılan olarak kapalı",
    from: "strategy = 'auto', inlineIgnore = true,", to: "strategy = 'auto', inlineIgnore = false,",
  },
];

const work = mkdtempSync(join(tmpdir(), 'mutasyon-'));
cpSync(ROOT, work, { recursive: true, filter: (src) => !src.includes('/bench/results') && !src.includes('/.git') });

const LIMIT_MS = 90 * 1000;

/** Bir süreç grubunun tamamını durdurur (grup yoksa sessizce geçer). @param {number} pid */
const killGroup = (pid) => {
  try { process.kill(-pid, 'SIGKILL'); } catch { /* grup zaten kapanmış */ }
};

/**
 * Birim testlerini geçici kopyada çalıştırır. Normal tur birkaç saniye sürer; 90 sn'yi aşan tur
 * sonsuz döngü sayılır. Testler ayrı bir süreç grubunda başlar ve tur bitince grubun tamamı
 * durdurulur: yalnızca ana süreç öldürülürse sonsuz döngüdeki test dosyaları sahipsiz kalıp
 * sonraki turların işlemcisini yiyordu.
 * @returns {Promise<{ code: number, fail: number, pass: number, killed: boolean, timedOut: boolean, signal: string | null }>}
 */
const run = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--test', '--test-concurrency=2', 'tests/unit/**/*.test.js'], {
    cwd: work, detached: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
  let out = '';
  child.stdout.setEncoding('utf8').on('data', (d) => { out += d; });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; killGroup(/** @type {number} */ (child.pid)); }, LIMIT_MS);
  child.on('error', reject);
  child.on('close', (status, signal) => {
    clearTimeout(timer);
    killGroup(/** @type {number} */ (child.pid));
    const fail = Number((out.match(/^# fail (\d+)/m) ?? [])[1] ?? NaN);
    const pass = Number((out.match(/^# pass (\d+)/m) ?? [])[1] ?? NaN);
    const killed = status === null;
    resolve({ code: killed ? -1 : status, fail, pass, killed, timedOut, signal });
  });
});

const baseline = await run();
if (baseline.code !== 0) throw new Error(`Değiştirilmemiş kopyada testler geçmiyor: ${JSON.stringify(baseline)}`);

const rows = [];
for (const mu of MUTATIONS) {
  const path = join(work, mu.file);
  const original = readFileSync(path, 'utf8');
  if (!original.includes(mu.from)) throw new Error(`${mu.file}: mutasyon yeri bulunamadı: ${mu.from}`);
  writeFileSync(path, original.replace(mu.from, mu.to));
  const r = await run();
  writeFileSync(path, original);
  const how = r.timedOut
    ? 'testler 90 sn içinde bitmedi (sonsuz döngü), süreç durduruldu'
    : r.killed ? `süreç ${r.signal} sinyaliyle durdu (bellek sınırı)` : `${r.fail} test başarısız`;
  rows.push({ ...mu, caught: r.code !== 0, how });
  process.stderr.write(`${r.code !== 0 ? 'YAKALANDI ' : 'KAÇTI     '} ${mu.what} (${how})\n`);
}
rmSync(work, { recursive: true, force: true });

const caught = rows.filter((r) => r.caught).length;
let md = `# Mutasyon denetimi\n\n`;
md += `Koda bilerek küçük hatalar yerleştirildi; her biri projenin geçici bir kopyasında tek başına uygulanıp bütün birim testleri çalıştırıldı. `;
md += `Bir mutasyon, en az bir test başarısız olursa ya da testler sonsuz döngü yüzünden bitmezse "yakalandı" sayılır.\n\n`;
md += `Değiştirilmemiş kopyada: ${baseline.pass} test geçti, ${baseline.fail} başarısız. `;
md += `Sonuç: **${rows.length} mutasyonun ${caught} tanesi yakalandı.** Komut: \`npm run mutation\` (${new Date().toISOString().slice(0, 10)}).\n\n`;
md += '| # | Dosya | Yerleştirilen hata | Değişiklik | Yakalandı mı | Nasıl |\n|---:|---|---|---|---|---|\n';
rows.forEach((r, i) => {
  md += `| ${i + 1} | \`${r.file}\` | ${r.what} | \`${r.from}\` → \`${r.to}\` | ${r.caught ? 'evet' : '**hayır**'} | ${r.how} |\n`;
});
writeFileSync(join(ROOT, 'docs', 'mutasyon.md'), md);
process.stdout.write(md);
if (caught < rows.length) process.exitCode = 1;
