// Atölyenin (web/) gerçek tarayıcıda uçtan uca denetimi. Playwright + Chromium gerekir
// (yalnızca bu betik için; npm test'in bağımlılığı değildir).
//   1. Altı hazır paketin her biri açılır, çalıştırılır; her "Eşleşme → Bulgu" kutusunun
//      bulgu sayısı aynı girdide komut satırının (bin/ios.js) verdiği sayıyla karşılaştırılır.
//   2. Sürükle-bırak, uçtan uca bağlantı, uyumsuz bağlantının reddi, klavyeyle ekleme ve bağlama,
//      dışa/içe aktarma, paylaşılabilir bağlantı, Açıkla, Atomları yarıştır.
//   3. Geri al / yinele, çoğalt, kopyala-yapıştır, tuş tuş yazma, denetim sekmesi, kısayol penceresi,
//      Mermaid ve çalıştırma kaydı indirme, otomatik kayıt, tuvale JSON bırakma, tam sözcük süzgeci
//      (atölye = komut satırı), SARIF (atölye = komut satırı, gizli değer maskeli), XSS ve CSP.
//   4. 1280 px ve 390 px'te yatay taşma yok; açık ve koyu tema.
//   5. Bütün sayfalarda konsol hatası yok.
// Ekran görüntüleri: docs/ekran/*.png
// Kullanım (proje kökünden): node scripts/arayuz-denetimi.js
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PACKAGES } from '../src/workflows/packages.js';
import { agoraKlasoru } from './agora-ac.js';

agoraKlasoru(); // komut satırı Agora örneğini ornek-agora/ klasöründen tarar
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright bulunamadı. Kurulum: npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

const VIZE = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = fileURLToPath(new URL('../docs/ekran/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const PORT = 8391;
const BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ['scripts/sunucu.js', '--port', String(PORT)], { cwd: VIZE, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.once('data', resolve));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'GEÇTİ' : 'KALDI'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const consoleErrors = [];
const browser = await chromium.launch();

async function newPage(viewport, extra = {}) {
  const page = await browser.newPage({ viewport, acceptDownloads: true, ...extra });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${page.url()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${page.url()}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return page;
}
const hideToast = (page) => page.evaluate(() => { document.getElementById('toast').hidden = true; });
const runAndWait = async (page) => {
  await page.click('#calistir');
  await page.waitForFunction(() => /^(bitti|hata)/.test(document.getElementById('durum').textContent), null, { timeout: 120000 });
  return page.textContent('#durum');
};
const nodeCount = (page) => page.evaluate(() => window.__atolye.state.wf.nodes.length);
const edgeCount = (page) => page.evaluate(() => window.__atolye.state.wf.edges.length);
const portSel = (node, port, side) => `.port[data-node="${node}"][data-port="${port}"][data-side="${side}"]`;
async function dragBetween(page, a, b) {
  const ra = await page.locator(a).boundingBox();
  const rb = await page.locator(b).boundingBox();
  await page.mouse.move(ra.x + ra.width / 2, ra.y + ra.height / 2);
  await page.mouse.down();
  await page.mouse.move((ra.x + rb.x) / 2, (ra.y + rb.y) / 2, { steps: 5 });
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 5 });
  await page.mouse.up();
}

try {
  // ------------------------------------------------------------ 1. hazır paketler = komut satırı
  const page = await newPage({ width: 1280, height: 800 });
  for (const p of PACKAGES) {
    await page.goto(`${BASE}/web/#paket=${p.id}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    const badge = await runAndWait(page);
    const counts = await page.evaluate(() => {
      const { state } = window.__atolye;
      return Object.fromEntries(state.wf.nodes.filter((n) => n.type === 'uyarlayici.bulgu').map((n) => [n.id, state.run.nodes[n.id].info.count]));
    });
    const cli = p.cli.map((cmd) => Number(execSync(`${cmd} 2>/dev/null | wc -l`, { cwd: VIZE, shell: '/bin/bash' }).toString().trim()));
    const got = Object.values(counts);
    const same = JSON.stringify(got) === JSON.stringify(cli) && JSON.stringify(counts) === JSON.stringify(p.expected);
    check(`paket ${p.id}: atölye = komut satırı`, same, `atölye ${JSON.stringify(counts)}, komut satırı ${JSON.stringify(cli)}; rozet "${badge}"`);
    if (p.id === 'teknik-borc') {
      await page.click('#acikla');
      const text = await page.textContent('#panel-aciklama');
      check('Açıkla: kurala dayalı Türkçe anlatım', /iş akışında 8 kutu/.test(text) && /Sonuç: 18 eşleşme/.test(text), text.split('\n')[0]);
      await page.click('#sekme-bulgular');
      await hideToast(page);
      await page.screenshot({ path: SHOTS + 'atolye-tablo.png' });
    }
    if (p.id === 'biyoloji') {
      await page.click('.node[data-id="molekul"] .node-head');
      await page.click('#yaristir');
      await page.waitForSelector('#panel-yaris table.race', { timeout: 120000 });
      const rows = await page.locator('#panel-yaris table.race tbody tr').count();
      const note = await page.textContent('#panel-yaris .note');
      check('Atomları yarıştır: 8 atom ölçüldü, uyarı metni var', rows === 8 && /gösterim amaçlıdır/.test(note), `${rows} satır`);
    }
  }

  // Karar kaydı ekran görüntüsü (rapor ve README için): tek desen paketi, 16 desenli dalın molekülü seçili
  const desk = await newPage({ width: 1280, height: 800 }, { deviceScaleFactor: 2 });
  await desk.goto(`${BASE}/web/#paket=tek-desen`, { waitUntil: 'networkidle' });
  await runAndWait(desk);
  await desk.click('.node[data-id="cok_molekul"] .node-head');
  await desk.click('#sekme-ozet');
  await desk.locator('#props h3', { hasText: 'Atomların tahmini süresi' }).scrollIntoViewIfNeeded();
  await hideToast(desk);
  await desk.screenshot({ path: SHOTS + 'atolye-masaustu.png' });
  check('ekran görüntüsü: masaüstü 1280 px', true, 'docs/ekran/atolye-masaustu.png');
  const overflowDesk = await desk.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('1280 px: yatay taşma yok', overflowDesk <= 0, `${overflowDesk} px`);
  await desk.click('#tema');
  const dark = await desk.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  await hideToast(desk);
  await desk.screenshot({ path: SHOTS + 'atolye-koyu.png' });
  check('koyu tema', dark.includes('dark'), dark);
  await desk.click('#tema');

  // ------------------------------------------------------------ 2. düzenleme etkileşimleri
  const ed = await newPage({ width: 1280, height: 800 });
  await ed.goto(`${BASE}/web/`, { waitUntil: 'networkidle' });
  await ed.click('#temizle');
  check('Temizle: boş tuval', (await nodeCount(ed)) === 0);
  await ed.dragAndDrop('.pal-item[data-type="kaynak.kod"]', '#tuval', { targetPosition: { x: 120, y: 80 } });
  await ed.dragAndDrop('.pal-item[data-type="uyarlayici.kaynak"]', '#tuval', { targetPosition: { x: 380, y: 80 } });
  await ed.dragAndDrop('.pal-item[data-type="molekul.ExactMatch"]', '#tuval', { targetPosition: { x: 380, y: 280 } });
  const ids = await ed.evaluate(() => window.__atolye.state.wf.nodes.map((n) => n.id));
  check('sürükle-bırak: paletten tuvale 3 kutu', ids.length === 3, ids.join(', '));
  const [src, ad, em] = ids;
  // uyumsuz bağlantı: Source.File → FASTA.Entry girişi
  await dragBetween(ed, portSel(src, 'files', 'out'), portSel(em, 'entries', 'in'));
  await ed.waitForSelector('#toast:not([hidden])');
  const rejectMsg = await ed.textContent('#toast');
  check('uyumsuz bağlantı reddedildi ve nedeni gösterildi', (await edgeCount(ed)) === 0 && /Tür uyuşmuyor/.test(rejectMsg), rejectMsg);
  await ed.screenshot({ path: SHOTS + 'atolye-red.png' });
  // uyumlu bağlantı: sürükleyerek
  await dragBetween(ed, portSel(src, 'files', 'out'), portSel(ad, 'files', 'in'));
  check('sürükleyerek bağlantı', (await edgeCount(ed)) === 1);
  // klavye: paletten Enter ile ekle, uçlarda Enter ile bağla
  await ed.focus('.pal-item[data-type="desen.todo"]');
  await ed.keyboard.press('Enter');
  const todo = await ed.evaluate(() => window.__atolye.state.wf.nodes.at(-1).id);
  check('klavye: Enter ile kutu ekleme', (await nodeCount(ed)) === 4, todo);
  await ed.focus(portSel(ad, 'entries', 'out'));
  await ed.keyboard.press('Enter');
  await ed.focus(portSel(em, 'entries', 'in'));
  await ed.keyboard.press('Enter');
  await ed.focus(portSel(todo, 'patterns', 'out'));
  await ed.keyboard.press('Enter');
  await ed.focus(portSel(em, 'patterns', 'in'));
  await ed.keyboard.press('Enter');
  check('klavye: uçlarda Enter ile bağlama', (await edgeCount(ed)) === 3);
  // kutuyu klavyeyle taşı
  const before = await ed.evaluate((id) => window.__atolye.state.wf.nodes.find((n) => n.id === id).x, todo);
  await ed.focus(`.node[data-id="${todo}"]`);
  await ed.keyboard.press('ArrowRight');
  const after = await ed.evaluate((id) => window.__atolye.state.wf.nodes.find((n) => n.id === id).x, todo);
  check('klavye: ok tuşuyla taşıma', after === before + 10, `${before} → ${after}`);
  // kutuyu fareyle sürükle
  const head = ed.locator(`.node[data-id="${em}"] .node-head`);
  const hb = await head.boundingBox();
  const x0 = await ed.evaluate((id) => window.__atolye.state.wf.nodes.find((n) => n.id === id).x, em);
  await ed.mouse.move(hb.x + 40, hb.y + 10);
  await ed.mouse.down();
  await ed.mouse.move(hb.x + 140, hb.y + 30, { steps: 6 });
  await ed.mouse.up();
  const x1 = await ed.evaluate((id) => window.__atolye.state.wf.nodes.find((n) => n.id === id).x, em);
  check('fareyle kutu taşıma', x1 > x0, `${x0} → ${x1}`);
  // kod yapıştır kutusuna metin, çıktı kutuları ekle, çalıştır
  await ed.click(`.node[data-id="${src}"] .node-head`);
  await ed.fill('#props textarea', 'x = 1  # TODO bir\n# FIXME iki\n');
  await ed.click('.pal-item[data-type="uyarlayici.bulgu"]');
  const bul = await ed.evaluate(() => window.__atolye.state.wf.nodes.at(-1).id);
  await ed.click('.pal-item[data-type="cikti.tablo"]');
  const tab = await ed.evaluate(() => window.__atolye.state.wf.nodes.at(-1).id);
  await dragBetween(ed, portSel(em, 'matches', 'out'), portSel(bul, 'matches', 'in'));
  await dragBetween(ed, portSel(bul, 'findings', 'out'), portSel(tab, 'findings', 'in'));
  const badge = await runAndWait(ed);
  check('elle kurulan iş akışı çalışır', /^bitti: 2 bulgu/.test(badge), badge);
  // dışa aktar → içe aktar
  const [dl] = await Promise.all([ed.waitForEvent('download'), ed.click('#disa')]);
  const exported = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  const current = await ed.evaluate(() => window.__atolye.serialize());
  check('dışa aktarma: JSON iş akışıyla aynı', JSON.stringify(exported) === JSON.stringify(current), dl.suggestedFilename());
  exported.name = 'İçe aktarılan deneme';
  await ed.click('#temizle');
  await ed.setInputFiles('#ice-dosya', { name: 'deneme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await ed.waitForFunction(() => document.getElementById('wf-ad').value === 'İçe aktarılan deneme');
  check('içe aktarma', (await nodeCount(ed)) === 6 && (await edgeCount(ed)) === 5);
  const bozuk = { ...exported, format: 'baska-bir-sey' };
  await ed.setInputFiles('#ice-dosya', { name: 'bozuk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bozuk)) });
  await ed.waitForFunction(() => /İçe aktarılamadı/.test(document.getElementById('toast').textContent));
  check('bozuk içe aktarma reddedilir', (await nodeCount(ed)) === 6);
  // paylaşılabilir bağlantı
  await ed.click('#paylas');
  await ed.waitForFunction(() => location.hash.startsWith('#wf='));
  const link = ed.url();
  const other = await newPage({ width: 1280, height: 800 });
  await other.goto(link, { waitUntil: 'networkidle' });
  const a = await ed.evaluate(() => window.__atolye.serialize());
  const b = await other.evaluate(() => window.__atolye.serialize());
  check('paylaşılabilir bağlantı aynı iş akışını açar', JSON.stringify(a) === JSON.stringify(b), `${link.length} karakter`);
  // Delete ile silme
  await ed.focus(`.node[data-id="${tab}"]`);
  await ed.keyboard.press('Delete');
  check('Delete ile kutu silme (bağlantılarıyla)', (await nodeCount(ed)) === 5 && (await edgeCount(ed)) === 4);

  // ------------------------------------------------------------ 2b. geri al / yinele, çoğalt, kopyala-yapıştır
  await ed.evaluate(() => document.getElementById('tuval').focus());
  await ed.keyboard.press('Control+z');
  check('Ctrl+Z: silinen kutu bağlantılarıyla geri gelir', (await nodeCount(ed)) === 6 && (await edgeCount(ed)) === 5);
  await ed.keyboard.press('Control+Shift+z');
  check('Ctrl+Shift+Z: yineler', (await nodeCount(ed)) === 5 && (await edgeCount(ed)) === 4);
  await ed.click('#geri-al');
  const undoTitle = await ed.getAttribute('#yinele', 'title');
  check('geri al / yinele düğmeleri ve ipucu', (await nodeCount(ed)) === 6 && /Yinele: Kutu silme/.test(undoTitle ?? ''), undoTitle);
  await ed.click(`.node[data-id="${src}"] .node-head`);
  await ed.keyboard.press('Control+d');
  const dup = await ed.evaluate(() => window.__atolye.state.wf.nodes.at(-1).id);
  check('Ctrl+D: seçili kutuyu çoğaltır', dup === `${src}_kopya` && (await nodeCount(ed)) === 7, dup);
  const copied = await ed.evaluate(() => {
    const dt = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    const text = dt.getData('text/plain');
    const dt2 = new DataTransfer();
    dt2.setData('text/plain', text);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true }));
    return { text, last: window.__atolye.state.wf.nodes.at(-1).id };
  });
  check('kopyala / yapıştır: panoya JSON parçası, yapıştırınca yeni kimlik', /kod-bilimi-atolyesi\/fragment/.test(copied.text) && copied.last === `${dup}2`, copied.last);
  await ed.evaluate(() => document.getElementById('tuval').focus());
  for (let i = 0; i < 2; i++) await ed.keyboard.press('Control+z');
  check('iki adım geri alınır (yapıştır, çoğalt)', (await nodeCount(ed)) === 6, String(await nodeCount(ed)));

  // ------------------------------------------------------------ 2c. özellikler panelinde tuş tuş yazma (odak kaybolmamalı)
  await ed.click(`.node[data-id="${src}"] .node-head`);
  await ed.click('#props textarea');
  await ed.keyboard.press('Control+a');
  await ed.keyboard.type('a = 1  # TODO tuş tuş');
  const typed = await ed.evaluate((id) => ({ v: window.__atolye.state.wf.nodes.find((n) => n.id === id).params.text, f: document.activeElement?.tagName }), src);
  check('özellikler panelinde tuş tuş yazma: metin tam, odak alanda', typed.v === 'a = 1  # TODO tuş tuş' && typed.f === 'TEXTAREA', JSON.stringify(typed));
  await ed.evaluate(() => document.getElementById('tuval').focus());
  await ed.keyboard.press('Control+z');
  const afterUndo = await ed.evaluate((id) => window.__atolye.state.wf.nodes.find((n) => n.id === id).params.text, src);
  check('yazma tek adımda geri alınır', afterUndo === 'x = 1  # TODO bir\n# FIXME iki\n', JSON.stringify(afterUndo));

  // ------------------------------------------------------------ 2d. denetim (lint), kısayol penceresi, diyagram, kayıt
  await ed.click('.pal-item[data-type="cikti.ozet"]');
  const loner = await ed.evaluate(() => window.__atolye.state.wf.nodes.at(-1).id);
  const lintMark = await ed.getAttribute(`.node[data-id="${loner}"]`, 'data-lint');
  await ed.click('#sekme-denetim');
  const lintText = await ed.textContent('#panel-denetim');
  check('denetim: bağlanmamış kutu işaretlenir ve sekmede listelenir', lintMark === 'hata' && /bağlı değil/.test(lintText) && /\(\d+\)/.test(await ed.textContent('#sekme-denetim')), `${lintMark}; ${await ed.textContent('#sekme-denetim')}`);
  await hideToast(ed);
  await ed.screenshot({ path: SHOTS + 'atolye-denetim.png' });
  await ed.keyboard.press('Control+z');
  await ed.evaluate(() => document.getElementById('tuval').focus());
  await ed.keyboard.press('?');
  const dlgOpen = await ed.evaluate(() => document.getElementById('kisayollar').open);
  const rows = await ed.locator('#kisayol-listesi tr').count();
  await ed.screenshot({ path: SHOTS + 'atolye-kisayollar.png' });
  await ed.keyboard.press('Escape');
  const dlgClosed = await ed.evaluate(() => !document.getElementById('kisayollar').open);
  check('"?" kısayol penceresini açar, Esc kapatır', dlgOpen && dlgClosed && rows >= 10, `${rows} kısayol`);
  await ed.click('#sekme-aciklama');
  const [mm] = await Promise.all([ed.waitForEvent('download'), ed.click('#mermaid-indir')]);
  const mermaid = readFileSync(await mm.path(), 'utf8');
  check('diyagram: Mermaid olarak indirilir', /^flowchart LR/.test(mermaid) && (mermaid.match(/-->\|/g) ?? []).length === (await edgeCount(ed)), mm.suggestedFilename());
  await runAndWait(ed);
  await ed.click('#sekme-ozet');
  const [rk] = await Promise.all([ed.waitForEvent('download'), ed.click('#kayit-indir')]);
  const rec = JSON.parse(readFileSync(await rk.path(), 'utf8'));
  const sha = rec.inputs?.[0]?.files?.[0]?.sha256 ?? '';
  check('çalıştırma kaydı: biçim, sürüm, girdi SHA-256, düğümler', rec.format === 'kod-bilimi-atolyesi/run-record' && /^[0-9a-f]{64}$/.test(sha) && rec.nodes.length === (await nodeCount(ed)) && rec.result.findings === 2, `${rk.suggestedFilename()}; ${sha.slice(0, 12)}…`);

  // ------------------------------------------------------------ 2e. otomatik kayıt, tuvale JSON bırakma, paket yüklemeyi geri alma
  const nameBefore = await ed.evaluate(() => window.__atolye.state.wf.name);
  await ed.waitForTimeout(500);
  await ed.goto(`${BASE}/web/?yeniden=1`, { waitUntil: 'networkidle' });
  const restored = await ed.evaluate(() => ({ name: window.__atolye.state.wf.name, n: window.__atolye.state.wf.nodes.length }));
  check('otomatik kayıt: sayfa yeniden açılınca son iş akışı gelir', restored.name === nameBefore && restored.n === 6, JSON.stringify(restored));
  const dropped = JSON.parse(JSON.stringify(PACKAGES.find((p) => p.id === 'log').build()));
  dropped.name = 'Bırakılan iş akışı';
  await ed.evaluate((json) => {
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'birakilan.json', { type: 'application/json' }));
    document.getElementById('tuval').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, JSON.stringify(dropped));
  await ed.waitForFunction(() => window.__atolye.state.wf.name === 'Bırakılan iş akışı');
  check('tuvale JSON dosyası bırakınca içe aktarılır', (await nodeCount(ed)) === dropped.nodes.length);
  await ed.click('#paketler button >> nth=0');
  await ed.keyboard.press('Control+z');
  check('paket açmak da geri alınır', (await ed.evaluate(() => window.__atolye.state.wf.name)) === 'Bırakılan iş akışı');

  // ------------------------------------------------------------ 2f. tam sözcük süzgeci: atölye = komut satırı
  await ed.goto(`${BASE}/web/#paket=tek-desen`, { waitUntil: 'networkidle' });
  await ed.click('.node[data-id="tek_bulgu"] .node-head');
  await ed.check('#p-tek_bulgu-word');
  await runAndWait(ed);
  const wordCount = await ed.evaluate(() => window.__atolye.state.run.nodes.tek_bulgu.info.count);
  const wordCli = Number(execSync('node bin/ios.js scan --patterns return --word bench/corpus/kod.txt 2>/dev/null | wc -l', { cwd: VIZE, shell: '/bin/bash' }).toString().trim());
  check('tam sözcük süzgeci: atölye = komut satırı (--word)', wordCount === wordCli && wordCount < 882, `atölye ${wordCount}, komut satırı ${wordCli}`);

  // ------------------------------------------------------------ 2g. SARIF: atölye kutusu, gizli değer maskeli
  await ed.goto(`${BASE}/web/#paket=gizli-bilgi`, { waitUntil: 'networkidle' });
  await ed.click('.pal-item[data-type="cikti.sarif"]');
  const sarifNode = await ed.evaluate(() => window.__atolye.state.wf.nodes.at(-1).id);
  await dragBetween(ed, portSel('bulgu', 'findings', 'out'), portSel(sarifNode, 'findings', 'in'));
  await runAndWait(ed);
  await ed.click('#sekme-ozet');
  const [sf] = await Promise.all([ed.waitForEvent('download'), ed.click('.sarif-indir')]);
  const sarifText = readFileSync(await sf.path(), 'utf8');
  const sarif = JSON.parse(sarifText);
  const cliSarif = JSON.parse(execSync('node bin/ios.js scan --preset secrets --format sarif web/data/gizli 2>/dev/null', { cwd: VIZE }).toString());
  const ruleIds = (d) => d.runs[0].results.map((r) => r.ruleId).join(',');
  check('SARIF: atölye ve komut satırı aynı kurallar; gizli değer maskeli', sarif.version === '2.1.0' && ruleIds(sarif) === ruleIds(cliSarif) && !sarifText.includes('IOSFODNN7EXAMPLE') && sarifText.includes('****'), `${sarif.runs[0].results.length} sonuç`);

  // ------------------------------------------------------------ 2h. güvenlik: paylaşılan bağlantıda HTML/betik çalışmaz; CSP satır içi betiği engeller
  const evil = { ...dropped, name: '<img src=x onerror="window.__xss=1">Kötü ad' };
  evil.nodes = evil.nodes.map((n) => (n.type === 'desen.ozel' ? { ...n, params: { ...n.params, patterns: '<script>window.__xss=2</script>' } } : n));
  const evilLink = `${BASE}/web/#wf=${Buffer.from(JSON.stringify(evil)).toString('base64url')}`;
  const xss = await newPage({ width: 1280, height: 800 });
  await xss.goto(evilLink, { waitUntil: 'networkidle' });
  await runAndWait(xss);
  await xss.click('#acikla');
  const xssState = await xss.evaluate(() => ({ flag: window.__xss ?? null, imgs: document.querySelectorAll('.titles img, #panel-aciklama img, #props img').length, name: document.getElementById('wf-ad').value }));
  check('XSS: bağlantıdaki HTML metin olarak kalır, betik çalışmaz', xssState.flag === null && xssState.imgs === 0 && xssState.name.startsWith('<img'), JSON.stringify(xssState));
  const cspPage = await browser.newPage();
  await cspPage.goto(`${BASE}/web/`, { waitUntil: 'networkidle' });
  const csp = await cspPage.evaluate(async () => {
    const sc = document.createElement('script');
    sc.textContent = 'window.__inline = 1';
    document.head.append(sc);
    await new Promise((r) => setTimeout(r, 50));
    return { meta: Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]')), ran: window.__inline ?? null };
  });
  await cspPage.close();
  check('CSP: sayfaya sonradan sokulan satır içi betik çalışmaz', csp.meta && csp.ran === null, JSON.stringify(csp));

  // ------------------------------------------------------------ 3. telefon (390 px)
  const mob = await newPage({ width: 390, height: 844 }, { deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await mob.goto(`${BASE}/web/#paket=gizli-bilgi`, { waitUntil: 'networkidle' });
  const mbadge = await runAndWait(mob);
  const overflowMob = await mob.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('390 px: yatay taşma yok', overflowMob <= 0, `${overflowMob} px; rozet "${mbadge}"`);
  await hideToast(mob);
  await mob.screenshot({ path: SHOTS + 'atolye-mobil.png' });
  await mob.click('#side-ac');
  await mob.waitForTimeout(300);
  await hideToast(mob);
  await mob.screenshot({ path: SHOTS + 'atolye-mobil-menu.png' });
  await mob.click('.pal-item[data-type="desen.errors"]');
  check('390 px: menüden dokunarak kutu ekleme', (await nodeCount(mob)) === 9);
  const overflowMob2 = await mob.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('390 px: yeni araç düğmeleriyle de yatay taşma yok', overflowMob2 <= 0, `${overflowMob2} px`);
  check('ekran görüntüsü: telefon 390 px', true, 'docs/ekran/atolye-mobil.png');
} finally {
  await browser.close();
  server.kill();
}
check('konsolda hata / uyarı yok', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} denetim geçti.`);
process.exitCode = failed.length ? 1 : 0;
