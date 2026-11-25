// Denetleyicinin ortak parçası: değişiklik bildirimi, komut uygulama, seçim, otomatik kayıt.
// Diğer denetleyici modülleri (edit.js, io.js, run.js) bunları kullanır.
import { catalog, doc, history, state } from '../state.js';
import { bus } from '../lib/bus.js';
import { toast } from '../lib/dom.js';
import { createStorage, debounce, KEYS } from '../lib/storage.js';
import { serializeWorkflow } from '../../src/workflows/engine.js';
import { lintWorkflow } from '../../src/workflows/lint.js';

export const storage = createStorage();

// ------------------------------------------------------------------ değişiklik bildirimi
export function refreshLint() {
  state.lint = lintWorkflow(doc.wf, catalog);
}

export const autosave = debounce(() => {
  storage.set(KEYS.autosave, JSON.stringify({ pkg: state.pkg, wf: serializeWorkflow(doc.wf) }));
}, 400);
export const flushAutosave = () => autosave.flush();

/** İş akışı değişti: çalıştırma sonucu bayatladı, denetim yenilenir, otomatik kayıt planlanır. */
export function changed({ structure = true } = {}) {
  const wasDirty = state.dirty;
  if (state.run) state.dirty = true;
  state.explain = null;
  refreshLint();
  bus.emit('degisti', { structure, becameDirty: !wasDirty && state.dirty });
  bus.emit('gecmis');
  autosave();
}

/** Komutu uygular; motor reddederse (ör. tür uyuşmazlığı) nedenini gösterir. */
export function exec(cmd, { structure = true } = {}) {
  try {
    history.execute(cmd);
  } catch (err) {
    toast(err.message, 'err');
    return false;
  }
  changed({ structure });
  return true;
}

export function resetRun() {
  state.run = null;
  state.dirty = false;
  state.race = null;
  state.explain = null;
  state.live = {};
}

// ------------------------------------------------------------------ seçim
export function select(sel) {
  state.sel = sel;
  bus.emit('secim');
}

export function arm(port) {
  state.armed = port;
  bus.emit('uc');
}

export function disarm() {
  if (!state.armed) return;
  state.armed = null;
  bus.emit('uc');
}

export function setTab(name) {
  state.tab = name;
  bus.emit('sekme');
}

/** Birleştirmeyi keser (alan odaktan çıkınca): sonraki yazma ayrı bir geri alma adımı olur. */
export const sealHistory = () => history.seal();

/** İlk denetim (sayfa açılırken). */
export const initLint = refreshLint;
