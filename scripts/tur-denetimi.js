// Statik tür denetimi: TypeScript denetleyicisi (tsc --checkJs) JavaScript dosyalarını JSDoc
// türleriyle denetler (tsconfig.json). TypeScript projenin bağımlılığı değildir:
//   npm install --no-save --no-package-lock typescript@6.0.3 @types/node@22
// Çıktı: docs/kalite/tur-denetimi.json (hata sayısı); hata varsa çıkış kodu 1.
// Kullanım (proje kökünden): npm run tur-denetimi
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
let tsc;
try {
  tsc = require.resolve('typescript/bin/tsc');
} catch {
  console.error('TypeScript bulunamadı. Kurulum: npm install --no-save --no-package-lock typescript@6.0.3 @types/node@22');
  process.exit(1);
}
const version = JSON.parse(readFileSync(require.resolve('typescript/package.json'), 'utf8')).version;
const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { cwd: ROOT, encoding: 'utf8' });
const out = (r.stdout ?? '') + (r.stderr ?? '');
const errors = (out.match(/error TS\d+/g) ?? []).length;
const before = (readFileSync(new URL('../docs/kalite/tur-denetimi-oncesi.txt', import.meta.url), 'utf8').match(/error TS\d+/g) ?? []).length;
// Olumsuz kontroller: tests/types/ altındaki her "@ts-expect-error" yönergesi bilerek bozuk bir
// bileşendir (ör. manifest'i olmayan atom). tsc o satırda hata vermezse yönerge kullanılmamış
// sayılır (TS2578) ve denetim kalır: rol türleri gevşerse bu dosya yakalar.
const TYPES = new URL('../tests/types/', import.meta.url);
const negatives = readdirSync(TYPES).filter((f) => f.endsWith('.js'))
  .reduce((sum, f) => sum + (readFileSync(new URL(f, TYPES), 'utf8').match(/^\s*\/\/ @ts-expect-error/gm) ?? []).length, 0);
mkdirSync(new URL('../docs/kalite/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/kalite/tur-denetimi.json', import.meta.url), JSON.stringify({ typescript: version, errors, before, negatives, ok: errors === 0 && r.status === 0 }, null, 2) + '\n');
if (out.trim()) process.stdout.write(out);
console.log(`TypeScript ${version}: ${errors} tür hatası (ilk ölçümde ${before}); rol arayüzleri için ${negatives} olumsuz kontrol (tests/types/) → docs/kalite/tur-denetimi.json`);
process.exitCode = errors === 0 && r.status === 0 ? 0 : 1;
