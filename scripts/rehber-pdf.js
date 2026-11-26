// docs/sunum-rehberi/rehber.html → docs/Sunum-Rehberi.pdf (10 dakikalık sunum için rehber)
// Ortamda kurulu Playwright + Chromium kullanılır (yalnızca bu betik için; npm test'in bağımlılığı değildir).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright bulunamadı. Kurulum: npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

const html = fileURLToPath(new URL('../docs/sunum-rehberi/rehber.html', import.meta.url));
const pdf = fileURLToPath(new URL('../docs/Sunum-Rehberi.pdf', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + html, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
const buf = await page.pdf({
  path: pdf, format: 'A4', printBackground: true, margin: { top: '13mm', bottom: '15mm', left: '14mm', right: '14mm' },
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#777">Kod Bilimi Atölyesi · sunum rehberi · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();
const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`Sunum-Rehberi.pdf yazıldı: ${pages} sayfa`);
