// Erişilebilirlik denetimi (WCAG 2.1 A ve AA): atölye, site ve sunum sayfaları gerçek tarayıcıda
// axe-core ile taranır. Playwright ve axe-core gerekir (yalnızca bu betik için; projenin
// bağımlılığı değildir). CI'da: npm install --no-save --no-package-lock playwright axe-core
//   Çıktı: docs/kalite/erisilebilirlik.json ve .md
//   Kapı: "critical" ya da "serious" etkili ihlal varsa çıkış kodu 1.
// Kullanım (proje kökünden): node scripts/erisilebilirlik-denetimi.js
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
let axePath;
try {
  ({ chromium } = require('playwright'));
  axePath = require.resolve('axe-core/axe.min.js');
} catch {
  console.error('Playwright ya da axe-core bulunamadı. Kurulum: npm install --no-save --no-package-lock playwright axe-core && npx playwright install chromium');
  process.exit(1);
}
// Sürüm dosyadan okunur (require ile değil): tür denetleyicisi CI'da axe-core kurulu olmadan da geçsin.
const axeVersion = JSON.parse(readFileSync(require.resolve('axe-core/package.json'), 'utf8')).version;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/kalite/', import.meta.url));
const PORT = 8393;
const BASE = `http://localhost:${PORT}`;
const PAGES = [
  { name: 'Atölye (paket açık, çalıştırılmış)', url: '/web/#paket=teknik-borc', run: true },
  { name: 'Atölye (telefon, 390 px)', url: '/web/#paket=gizli-bilgi', run: true, mobile: true },
  { name: 'Site: ana sayfa', url: '/site/index.html' },
  { name: 'Site: bileşenler', url: '/site/bilesenler.html' },
  { name: 'Site: bir bileşen sayfası', url: '/site/bilesen/HorspoolSearch.html' },
  { name: 'Site: sonuçlar', url: '/site/sonuclar.html' },
  { name: 'Site: kalite', url: '/site/kalite.html' },
  { name: 'Site: rapor', url: '/site/rapor.html' },
  { name: 'Site: ekip', url: '/site/ekip.html' },
  { name: 'Sunum', url: '/docs/sunum/index.html' },
];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const server = spawn(process.execPath, ['scripts/sunucu.js', '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.once('data', resolve));
const browser = await chromium.launch();
const report = [];
try {
  for (const p of PAGES) {
    for (const theme of ['light', 'dark']) {
      // CSP sayfaya sonradan betik eklenmesini engeller (bilerek); denetim aracı için yalnızca bu bağlamda atlanır.
      const ctx = await browser.newContext({ bypassCSP: true, colorScheme: theme, viewport: p.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(BASE + p.url, { waitUntil: 'networkidle' });
      if (p.run) {
        await page.click('#calistir');
        await page.waitForFunction(() => /^(bitti|hata)/.test(document.getElementById('durum').textContent), null, { timeout: 120000 });
        await page.evaluate(() => { document.getElementById('toast').hidden = true; });
      }
      await page.addScriptTag({ path: axePath });
      const res = await page.evaluate(async (tags) => {
        // @ts-ignore: axe sayfaya enjekte edildi
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
      }, TAGS);
      report.push({ page: p.name, url: p.url, theme, violations: res });
      const bad = res.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      console.log(`${bad.length ? 'KALDI' : 'GEÇTİ'}  ${p.name} [${theme}] — ${res.length} kural ihlali${res.length ? ': ' + res.map((v) => `${v.id} (${v.impact}, ${v.nodes})`).join(', ') : ''}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
const all = report.flatMap((r) => r.violations);
const byImpact = Object.fromEntries(['critical', 'serious', 'moderate', 'minor'].map((k) => [k, all.filter((v) => v.impact === k).length]));
const blocking = byImpact.critical + byImpact.serious;
mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + 'erisilebilirlik.json', JSON.stringify({ axe: axeVersion, tags: TAGS, pages: report.length, byImpact, blocking, report }, null, 2) + '\n');
writeFileSync(OUT + 'erisilebilirlik.md', [
  '# Erişilebilirlik denetimi',
  '',
  `axe-core ${axeVersion}, ölçütler: ${TAGS.join(', ')}. ${PAGES.length} sayfa × açık/koyu tema = ${report.length} tarama (\`node scripts/erisilebilirlik-denetimi.js\`).`,
  '',
  '| Sayfa | Tema | İhlal edilen kural |',
  '|---|---|---|',
  ...report.map((r) => `| ${r.page} | ${r.theme === 'light' ? 'açık' : 'koyu'} | ${r.violations.length ? r.violations.map((v) => `${v.id} (${v.impact})`).join(', ') : 'yok'} |`),
  '',
  `Etkiye göre: kritik ${byImpact.critical}, ciddi ${byImpact.serious}, orta ${byImpact.moderate}, küçük ${byImpact.minor}.`,
  '',
].join('\n'));
console.log(`\n${report.length} tarama; engelleyici (kritik + ciddi) ihlal: ${blocking}`);
process.exitCode = blocking ? 1 : 0;
