// Olay bağlama: üst çubuk ve tuval araçlarının düğmeleri, sekmeler, tuvale bırakma ve klavye
// kısayolları. Her olay denetleyicideki (actions.js) bir eyleme ya da bir görünüm işlevine bağlanır.
import { state, history } from './state.js';
import { bus } from './lib/bus.js';
import { $, isTyping, isMac } from './lib/dom.js';
import { snap, NODE_W } from './lib/geometry.js';
import { TABS } from './views/results.js';
import { setZoom, fit, boardPoint } from './views/canvas.js';
import { openSide } from './views/palette.js';
import { openShortcuts } from './views/dialogs.js';
import { catalog } from './state.js';
import * as act from './actions.js';

function updateHistoryButtons() {
  const u = /** @type {HTMLButtonElement} */ ($('geri-al'));
  const r = /** @type {HTMLButtonElement} */ ($('yinele'));
  const mod = isMac() ? '⌘' : 'Ctrl';
  u.disabled = !history.canUndo;
  r.disabled = !history.canRedo;
  u.title = history.canUndo ? `Geri al: ${history.undoLabel} (${mod}+Z)` : 'Geri alınacak değişiklik yok';
  r.title = history.canRedo ? `Yinele: ${history.redoLabel} (${mod}+Shift+Z)` : 'Yinelenecek değişiklik yok';
  u.setAttribute('aria-label', u.title);
  r.setAttribute('aria-label', r.title);
}

/** Başlıktaki ad ve hedef alanları (geri almada ya da yüklemede güncellenir; yazarken dokunulmaz). */
function syncTitles() {
  const ad = /** @type {HTMLInputElement} */ ($('wf-ad'));
  const hedef = /** @type {HTMLInputElement} */ ($('wf-hedef'));
  if (document.activeElement !== ad) ad.value = state.wf.name;
  if (document.activeElement !== hedef) hedef.value = state.wf.target;
}

export function bind() {
  $('calistir').addEventListener('click', () => act.run());
  $('acikla').addEventListener('click', () => act.explain());
  $('disa').addEventListener('click', () => act.exportJson());
  $('ice').addEventListener('click', () => $('ice-dosya').click());
  $('ice-dosya').addEventListener('change', async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const f = input.files[0];
    input.value = '';
    await act.importFile(f);
  });
  $('paylas').addEventListener('click', () => act.share());
  $('tema').addEventListener('click', () => act.toggleTheme());
  $('wf-ad').addEventListener('input', (e) => act.setField('name', /** @type {HTMLInputElement} */ (e.target).value));
  $('wf-hedef').addEventListener('input', (e) => act.setField('target', /** @type {HTMLInputElement} */ (e.target).value));
  for (const id of ['wf-ad', 'wf-hedef']) $(id).addEventListener('change', act.sealHistory);
  $('yaklas').addEventListener('click', () => setZoom(state.zoom + 0.1));
  $('uzaklas').addEventListener('click', () => setZoom(state.zoom - 0.1));
  $('sigdir').addEventListener('click', fit);
  $('duzenle').addEventListener('click', () => { act.autoLayout(); fit(); });
  $('temizle').addEventListener('click', () => act.clearCanvas());
  $('geri-al').addEventListener('click', () => act.undo());
  $('yinele').addEventListener('click', () => act.redo());
  $('sonuc-katla').addEventListener('click', () => {
    const c = $('sonuclar').classList.toggle('collapsed');
    $('sonuc-katla').setAttribute('aria-expanded', String(!c));
    $('sonuc-katla').textContent = c ? '▴' : '▾';
  });
  for (const t of TABS) {
    $(`sekme-${t}`).addEventListener('click', () => act.setTab(t));
    $(`sekme-${t}`).addEventListener('keydown', (e) => {
      const i = TABS.indexOf(t);
      const j = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
      if (j >= 0) { act.setTab(TABS[j]); $(`sekme-${TABS[j]}`).focus(); }
    });
  }

  // Tuvale bırakma: paletten bileşen ya da bilgisayardan bir iş akışı JSON dosyası
  const board = $('board');
  const sc = $('tuval');
  sc.addEventListener('dragover', (e) => {
    const types = [...e.dataTransfer.types];
    if (!types.includes('application/x-kba-type') && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    board.classList.add('drop');
  });
  sc.addEventListener('dragleave', () => board.classList.remove('drop'));
  sc.addEventListener('drop', async (e) => {
    board.classList.remove('drop');
    const file = e.dataTransfer.files?.[0];
    if (file) {
      e.preventDefault();
      await act.importFile(file);
      return;
    }
    const type = e.dataTransfer.getData('application/x-kba-type');
    if (!type || !catalog.get(type)) return;
    e.preventDefault();
    const p = boardPoint(e);
    act.addComponent(type, { x: Math.max(0, snap(p.x - NODE_W / 2)), y: Math.max(0, snap(p.y - 19)) });
  });
  sc.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t === sc || t === board || t.id === 'dugumler' || t.id === 'kablolar') {
      if (state.armed) act.disarm();
      if (state.sel) act.select(null);
    }
  });

  // Pano: Ctrl+C / Ctrl+V (yazı alanında değilken) seçili kutuyu JSON olarak kopyalar, yapıştırır
  document.addEventListener('copy', (e) => {
    if (isTyping() || state.sel?.kind !== 'node' || window.getSelection()?.toString()) return;
    const text = act.copySelection();
    if (text) {
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    }
  });
  document.addEventListener('paste', (e) => {
    if (isTyping()) return;
    e.preventDefault();
    act.pasteText(e.clipboardData?.getData('text/plain') ?? '');
  });

  document.addEventListener('keydown', (e) => {
    const typing = isTyping();
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.key === 'Escape') {
      if (state.armed) act.disarm();
      else if ($('side').classList.contains('open')) openSide(false);
      else if (state.sel && !typing) act.select(null);
    } else if (mod && e.key === 'Enter') {
      e.preventDefault();
      act.run();
    } else if (!typing && mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) act.redo();
      else act.undo();
    } else if (!typing && mod && key === 'y') {
      e.preventDefault();
      act.redo();
    } else if (!typing && mod && key === 'd') {
      e.preventDefault();
      act.duplicateSelection();
    } else if (!typing && !mod && e.key === '?') {
      e.preventDefault();
      openShortcuts();
    } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && state.sel?.kind === 'edge') {
      e.preventDefault();
      act.deleteSelection();
    }
  });
  window.addEventListener('hashchange', () => act.loadFromHash({ undoable: true }));
  window.addEventListener('pagehide', act.flushAutosave);

  bus.on('gecmis', updateHistoryButtons);
  bus.on('degisti', syncTitles);
  bus.on('yuklendi', syncTitles);
  updateHistoryButtons();
}
