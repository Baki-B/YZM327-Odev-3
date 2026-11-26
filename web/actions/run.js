// Denetleyici: çalıştırma ve çıktılar. İş akışını Web Worker'da çalıştırma, atomları yarıştırma,
// açıklama, Mermaid diyagramı, çalıştırma kaydı (provenance) ve çıktı dosyalarını indirme.
import { catalog, doc, state } from '../state.js';
import { bus } from '../lib/bus.js';
import { $, toast, download } from '../lib/dom.js';
import { slug } from '../lib/format.js';
import { explainWorkflow, serializeWorkflow, validateWorkflow } from '../../src/workflows/engine.js';
import { toMermaid } from '../../src/workflows/diagram.js';
import { buildRunRecord } from '../../src/workflows/provenance.js';
import { runWorkflowRemote, raceRemote, runnerMode, clearCacheRemote } from '../runner.js';
import { disarm, setTab } from './core.js';

// ------------------------------------------------------------------ çalıştırma
export async function run() {
  if (state.running) return;
  disarm();
  const problems = validateWorkflow(doc.wf, catalog);
  if (problems.length) {
    state.run = { ok: false, problems, nodes: {}, totalMs: 0 };
    state.dirty = false;
    state.sel = null;
    bus.emit('calisma');
    bus.emit('secim');
    toast(`Çalıştırılamadı: ${problems[0].message}`, 'err');
    return;
  }
  state.running = true;
  state.live = {};
  state.race = null;
  bus.emit('calisma');
  const data = serializeWorkflow(doc.wf);
  const startedAt = new Date().toISOString();
  try {
    const res = await runWorkflowRemote(data, (p) => {
      state.live[p.node] = p;
      bus.emit('canli', p);
    });
    state.run = { ...res, workflow: data, startedAt };
    state.dirty = JSON.stringify(serializeWorkflow(doc.wf)) !== JSON.stringify(data);
  } catch (err) {
    state.run = { ok: false, problems: [{ message: err.message }], nodes: {}, totalMs: 0 };
  } finally {
    state.running = false;
    state.live = {};
  }
  bus.emit('calisma');
  if (!state.run.ok) toast($('durum').textContent, 'err');
}

/** Önbelleği boşaltır; sonraki çalıştırmada bütün kutular yeniden çalışır. */
export async function clearCache() {
  await clearCacheRemote();
  toast('Önbellek boşaltıldı: sonraki çalıştırmada bütün kutular yeniden çalışır.');
}

export async function race(nodeId) {
  state.race = { pending: true, node: nodeId };
  setTab('yaris');
  bus.emit('yaris');
  try {
    state.race = { node: nodeId, ...(await raceRemote(nodeId, 5)) };
  } catch (err) {
    state.race = { error: err.message };
  }
  bus.emit('yaris');
}

export function explain() {
  state.explain = explainWorkflow(doc.wf, catalog, state.run && !state.dirty ? state.run : null);
  setTab('aciklama');
}


// ------------------------------------------------------------------ dışa aktarma
export function exportMermaid() {
  const text = toMermaid(doc.wf, catalog);
  download(`${slug(doc.wf.name)}.mmd`, text, 'text/plain');
  navigator.clipboard?.writeText(text).catch(() => {});
  toast('Mermaid diyagramı indirildi (ve panoya kopyalandı): GitHub ve birçok belge aracı Markdown içinde çizer.');
  return text;
}

/** Son çalıştırmanın kaydı (provenance): iş akışı, sürümler, girdi özetleri, kararlar. */
export function exportRunRecord() {
  if (!state.run?.workflow || state.dirty) return toast('Önce iş akışını çalıştırın (kayıt son çalıştırmayı anlatır).', 'err');
  const rec = buildRunRecord({
    workflow: state.run.workflow,
    catalog,
    run: state.run,
    createdAt: state.run.startedAt,
    inputs: state.run.inputs ?? {},
    environment: { runner: runnerMode(), userAgent: navigator.userAgent },
  });
  download(`${slug(doc.wf.name)}-calistirma-kaydi.json`, JSON.stringify(rec, null, 2) + '\n');
  toast('Çalıştırma kaydı indirildi: iş akışı, bileşen sürümleri, girdi özetleri (SHA-256) ve kararlar.');
  return rec;
}

export function downloadOutput(name, text, type) {
  download(name, text, type);
}
