// Denetleyici: iş akışının tamamı. Paket açma, içe / dışa aktarma, tuvale bırakma, paylaşılabilir
// bağlantı, otomatik kayıt ve geri yükleme, tuvali temizleme; tema tercihi.
import { catalog, doc, history, state } from '../state.js';
import { bus } from '../lib/bus.js';
import { toast, download } from '../lib/dom.js';
import { slug, b64urlEncode, b64urlDecode, nf } from '../lib/format.js';
import { KEYS } from '../lib/storage.js';
import { createWorkflow, deserializeWorkflow, serializeWorkflow } from '../../src/workflows/engine.js';
import { replaceWorkflowCommand } from '../../src/workflows/history.js';
import { PACKAGES, packageById } from '../../src/workflows/packages.js';
import { autosave, refreshLint, resetRun, storage } from './core.js';

const replaceUrl = (url) => globalThis.history.replaceState(null, '', url);

// ------------------------------------------------------------------ iş akışının tamamı
/**
 * İş akışını değiştirir (paket, içe aktarma, temizleme, yapıştırma). undoable: geri alınabilir
 * bir komut olarak; değilse (sayfa ilk açılırken) geçmiş temizlenir.
 */
export function setWorkflow(wf, { pkg = null, label = 'İş akışını değiştirme', undoable = true } = {}) {
  if (undoable) history.execute(replaceWorkflowCommand(doc.wf, wf, label, { before: state.pkg, after: pkg }));
  else {
    doc.wf = wf;
    history.clear();
  }
  state.sel = null;
  state.pkg = pkg;
  state.armed = null;
  resetRun();
  refreshLint();
  bus.emit('yuklendi');
  bus.emit('gecmis');
  autosave();
}

export function loadPackage(id, { undoable = true } = {}) {
  const p = packageById(id);
  if (!p) return toast(`Bilinmeyen paket: ${id}`, 'err');
  setWorkflow(deserializeWorkflow(p.build(), catalog), { pkg: id, label: `Paket açma: ${p.channel}`, undoable });
  replaceUrl(`#paket=${encodeURIComponent(id)}`);
  toast(`Paket açıldı: ${p.channel}. "Tarayıcıda çalıştır"a basın.`);
}

export function clearCanvas() {
  if (doc.wf.nodes.length && !confirm('Tuvaldeki bütün kutular silinsin mi? (Ctrl+Z ile geri alınabilir.)')) return;
  setWorkflow(createWorkflow({ name: 'Yeni iş akışı' }), { label: 'Tuvali temizleme' });
  replaceUrl(location.pathname + location.search);
}

/** JSON metnini iş akışı olarak yükler; bozuk ya da yabancı dosyayı nedeniyle reddeder. */
export function importText(text, label = 'İçe aktarma') {
  try {
    const wf = deserializeWorkflow(JSON.parse(text), catalog);
    setWorkflow(wf, { label: `${label}: ${wf.name}` });
    replaceUrl(location.pathname + location.search);
    toast(`"${wf.name}" içe aktarıldı: ${wf.nodes.length} kutu, ${wf.edges.length} bağlantı.`);
    return true;
  } catch (err) {
    toast(`İçe aktarılamadı: ${err.message}`, 'err');
    return false;
  }
}

export async function importFile(file) {
  if (!file) return false;
  return importText(await file.text());
}

export function exportJson() {
  download(`${slug(doc.wf.name)}.json`, JSON.stringify(serializeWorkflow(doc.wf), null, 2) + '\n');
  toast('İş akışı JSON olarak indirildi.');
}

export function loadFromHash({ undoable = false } = {}) {
  const params = new URLSearchParams(location.hash.slice(1));
  try {
    if (params.has('wf')) {
      const wf = deserializeWorkflow(JSON.parse(b64urlDecode(params.get('wf'))), catalog);
      setWorkflow(wf, { label: 'Bağlantıdan açma', undoable });
      toast('Bağlantıdaki iş akışı yüklendi.');
      return true;
    }
    if (params.has('paket') && packageById(params.get('paket'))) {
      loadPackage(params.get('paket'), { undoable });
      return true;
    }
  } catch (err) {
    toast(`Bağlantıdaki iş akışı okunamadı: ${err.message}`, 'err');
  }
  return false;
}

/** Bu tarayıcıda otomatik kaydedilmiş son iş akışını geri yükler. */
export function restoreAutosave() {
  const raw = storage.get(KEYS.autosave);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    const wf = deserializeWorkflow(saved.wf, catalog);
    setWorkflow(wf, { pkg: packageById(saved.pkg) ? saved.pkg : null, undoable: false });
    toast(`Son çalışmanız geri yüklendi: "${wf.name}" (bu tarayıcıda saklanır). Hazır paketler solda.`);
    return true;
  } catch {
    storage.remove(KEYS.autosave);
    return false;
  }
}

export const firstPackage = () => loadPackage(PACKAGES[0].id, { undoable: false });

export async function share() {
  const json = JSON.stringify(serializeWorkflow(doc.wf));
  const url = `${location.href.split('#')[0]}#wf=${b64urlEncode(json)}`;
  replaceUrl(url);
  if (url.length > 60000) toast('Bağlantı çok uzun (yüklenen dosya içerikleri de içinde). Bunun yerine "Dışa aktar" ile JSON paylaşın.', 'err');
  try {
    await navigator.clipboard.writeText(url);
    toast(`Bağlantı panoya kopyalandı (${nf(url.length, 0)} karakter).`);
  } catch {
    toast('Bağlantı adres çubuğuna yazıldı; oradan kopyalayın.');
  }
}

// ------------------------------------------------------------------ tema
export function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  storage.set(KEYS.theme, t);
}

export function toggleTheme() {
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark');
  applyTheme(dark ? 'light' : 'dark');
}
