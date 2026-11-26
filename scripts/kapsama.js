// Test kapsaması (code coverage): birim testleri çalışırken hangi satır, dal ve işlevlerin
// çalıştığını Node'un yerleşik ölçümüyle (--experimental-test-coverage) bulur. Ek paket gerekmez.
//   Kapsam: src/ (çekirdek), bin/ (komut satırı; alt süreç olarak da ölçülür), web/lib/ (DOM'suz
//   arayüz yardımcıları). Arayüzün DOM'a bağlı kısmı (web/views, web/actions) gerçek tarayıcıda
//   scripts/arayuz-denetimi.js ile sınanır, burada ölçülmez.
//   Çıktı: docs/kalite/kapsama.json ve kapsama.md
//   Eşikler: satır %95, dal %85, işlev %95; altına düşerse çıkış kodu 1 (CI kapısı).
// Kullanım (proje kökünden): npm run kapsama
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'kalite');
export const THRESHOLDS = { lines: 95, branches: 85, functions: 95 };
const INCLUDE = ['src/**', 'bin/**', 'web/lib/**'];

const lcov = join(mkdtempSync(join(tmpdir(), 'kapsama-')), 'lcov.info');
const args = ['--test', '--experimental-test-coverage', ...INCLUDE.map((g) => `--test-coverage-include=${g}`),
  '--test-reporter=lcov', `--test-reporter-destination=${lcov}`, '--test-reporter=tap', '--test-reporter-destination=stdout', 'tests/unit/**/*.test.js'];
const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
if (r.status !== 0) {
  process.stderr.write(r.stdout + r.stderr);
  console.error('Testler başarısız; kapsama ölçülmedi.');
  process.exit(1);
}

/** lcov.info → dosya başına sayılar */
const files = [];
let cur = null;
for (const line of readFileSync(lcov, 'utf8').split('\n')) {
  const [k, v] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)];
  if (k === 'SF') cur = { file: relative(ROOT, v).replace(/\\/g, '/'), lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
  else if (cur && ['LF', 'LH', 'BRF', 'BRH', 'FNF', 'FNH'].includes(k)) cur[k.toLowerCase()] = Number(v);
  else if (line === 'end_of_record' && cur) { files.push(cur); cur = null; }
}
const sum = (key) => files.reduce((s, f) => s + f[key], 0);
const pct = (hit, all) => (all === 0 ? 100 : Math.round((hit / all) * 1000) / 10);
const totals = {
  lines: { hit: sum('lh'), all: sum('lf'), pct: pct(sum('lh'), sum('lf')) },
  branches: { hit: sum('brh'), all: sum('brf'), pct: pct(sum('brh'), sum('brf')) },
  functions: { hit: sum('fnh'), all: sum('fnf'), pct: pct(sum('fnh'), sum('fnf')) },
};
const perFile = files
  .map((f) => ({ file: f.file, lines: pct(f.lh, f.lf), branches: pct(f.brh, f.brf), functions: pct(f.fnh, f.fnf), uncoveredLines: f.lf - f.lh }))
  .sort((a, b) => a.lines - b.lines || a.file.localeCompare(b.file));
const failed = Object.entries(THRESHOLDS).filter(([k, min]) => totals[k].pct < min);

mkdirSync(OUT, { recursive: true });
const tests = { pass: Number(r.stdout.match(/^# pass (\d+)/m)?.[1]), fail: Number(r.stdout.match(/^# fail (\d+)/m)?.[1]) };
const result = { node: process.version, include: INCLUDE, thresholds: THRESHOLDS, tests, totals, files: perFile.length, perFile, ok: failed.length === 0 };
writeFileSync(join(OUT, 'kapsama.json'), JSON.stringify(result, null, 2) + '\n');
const fmt = (x) => String(x).replace('.', ',');
const md = [
  '# Test kapsaması',
  '',
  `\`npm run kapsama\` (Node ${process.version}, yerleşik ölçüm). Kapsam: ${INCLUDE.map((g) => `\`${g}\``).join(', ')}; ${perFile.length} dosya.`,
  '',
  '| Ölçüt | Çalışan / toplam | Oran | Eşik |',
  '|---|---|---|---|',
  ...Object.entries(totals).map(([k, t]) => `| ${{ lines: 'Satır', branches: 'Dal', functions: 'İşlev' }[k]} | ${t.hit} / ${t.all} | %${fmt(t.pct)} | %${THRESHOLDS[k]} |`),
  '',
  'En düşük satır kapsamalı on dosya:',
  '',
  '| Dosya | Satır | Dal | İşlev |',
  '|---|---|---|---|',
  ...perFile.slice(0, 10).map((f) => `| \`${f.file}\` | %${fmt(f.lines)} | %${fmt(f.branches)} | %${fmt(f.functions)} |`),
  '',
].join('\n');
writeFileSync(join(OUT, 'kapsama.md'), md);
for (const [k, t] of Object.entries(totals)) console.log(`${k.padEnd(9)} ${String(t.hit).padStart(5)} / ${String(t.all).padEnd(5)} %${t.pct} (eşik %${THRESHOLDS[k]})`);
console.log(`${tests.pass} test geçti, ${tests.fail} başarısız; ${perFile.length} dosya → docs/kalite/kapsama.json, kapsama.md`);
if (failed.length) {
  console.error(`Eşiğin altında: ${failed.map(([k]) => k).join(', ')}`);
  process.exitCode = 1;
}
