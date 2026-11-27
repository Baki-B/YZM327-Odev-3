// Sunum modu: atölyeyi adım adım tanıtır (paket açma, dosya ekleme, bağlama, çalıştırma,
// molekülün kararı). Sayfa karartılır, anlatılan öğe aydınlık bir çerçeveyle gösterilir. Sayfa
// kullanılmaya devam eder: çerçevenin içine tıklanabilir (ör. dosya seçme alanı). Adımların metni ve
// yerleşim hesabı DOM'suzdur (lib/tour.js); eylemler denetleyici (actions.js) üzerinden yapılır,
// bu yüzden hepsi Ctrl+Z ile geri alınabilir.
import { state, nodeById } from '../state.js';
import { $, h, isMobile, isTyping } from '../lib/dom.js';
import { TOUR_STEPS, TOUR_ACTIONS, createTour, placePopover, holeRect } from '../lib/tour.js';
import { openSide } from './palette.js';
import { fit } from './canvas.js';
import * as act from '../actions.js';

const DEMO_PACKAGE = 'gizli-bilgi';
const FILE_BOX = 'kaynak.dosyalar';

/** @type {ReturnType<typeof createTour> | null} */
let tour = null;
/** @type {HTMLElement} */
let root;
/** @type {HTMLElement} */
let hole;
/** @type {HTMLElement} */
let pop;
let timer = null;
let addedId = null;
/** @type {HTMLElement | null} */
let opener = null;

const molecule = () => state.wf.nodes.find((n) => n.type === 'molekul.ExactMatch') ?? null;
const added = () => (addedId ? nodeById(addedId) ?? null : null);
const nodeEl = (id) => /** @type {HTMLElement | null} */ (document.querySelector(`#dugumler .node[data-id="${CSS.escape(id)}"]`));
const selectNode = (n) => { if (n) act.select({ kind: 'node', id: n.id }); };

/** "@" ile başlayan hedefler: çalışma anında bulunur. */
const REFS = {
  '@molekul': () => { const m = molecule(); return m ? nodeEl(m.id) : null; },
  '@dosya-kutusu': () => { const n = added(); return n ? nodeEl(n.id) : null; },
  '@dosya-cikis': () => { const n = added(); return n ? nodeEl(n.id)?.querySelector('.port[data-side="out"]') ?? null : null; },
};

/** Rehberin eklediği "Dosya yükle" kutusu boşsa kaldırılır (boş kutu çalıştırmayı durdurur). */
function dropEmptyFileBox() {
  const n = added();
  if (n && !(n.params.files ?? []).length) {
    selectNode(n);
    act.deleteSelection();
  }
  if (!added()) addedId = null;
}

/** Eylem düğmeleri (yazıları lib/tour.js TOUR_ACTIONS'ta). */
const ACTIONS = {
  paket: () => {
    act.loadPackage(DEMO_PACKAGE);
    addedId = null;
    fit();
  },
  'dosya-kutusu': () => {
    const n = added() ?? act.addComponent(FILE_BOX);
    if (n) {
      addedId = n.id;
      selectNode(n);
    }
  },
  calistir: () => {
    dropEmptyFileBox();
    act.run();
  },
  molekul: () => selectNode(molecule()),
};

/** Adıma girerken: anlatılan panel doğru şeyi göstersin. */
const ENTER = {
  'dosya-sec': () => selectNode(added()),
  bagla: () => selectNode(added()),
  karar: () => selectNode(molecule()),
  sonuclar: () => act.setTab('bulgular'),
};

function targetOf(step) {
  if (!step.target) return null;
  const el = step.target.startsWith('@') ? REFS[step.target]?.() : document.querySelector(step.target);
  return el && el.getClientRects().length ? /** @type {HTMLElement} */ (el) : null;
}

const px = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

/** Çerçeveyi ve açılır kutuyu hedefe göre yerleştirir (sayfa kayınca ya da değişince de çağrılır). */
function position(scroll = false) {
  if (!tour) return;
  const el = targetOf(tour.step);
  if (el && scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const view = { width: innerWidth, height: innerHeight };
  const r = el ? el.getBoundingClientRect() : null;
  hole.hidden = !r;
  root.classList.toggle('dim', !r);
  if (r) Object.assign(hole.style, px(holeRect(r, view)));
  const p = placePopover(r, { width: pop.offsetWidth, height: pop.offsetHeight }, view);
  Object.assign(pop.style, { left: `${p.left}px`, top: `${p.top}px` });
  pop.dataset.side = p.side;
}

function render() {
  const step = tour.step;
  ENTER[step.id]?.();
  $('sunum-adim').textContent = `Sunum modu · adım ${tour.progress}`;
  $('sunum-baslik').textContent = step.title;
  $('sunum-metin').textContent = step.text;
  /** @type {HTMLButtonElement} */ ($('sunum-geri')).disabled = tour.isFirst;
  $('sunum-ileri').textContent = tour.isLast ? 'Bitir' : 'İleri →';
  const eylem = $('sunum-eylem');
  eylem.hidden = !step.action;
  eylem.textContent = step.action ? TOUR_ACTIONS[step.action] : '';
  // Telefonda kenar çubuğu yalnızca hedef oradaysa açık
  const inSide = Boolean(step.target && !step.target.startsWith('@') && $('side').querySelector(step.target));
  const focused = document.activeElement;
  if (isMobile()) openSide(inSide);
  if (focused instanceof HTMLElement && pop.contains(focused)) focused.focus(); // kenar çubuğu odağı arama kutusuna almasın
  position(true);
  if (!pop.contains(document.activeElement)) $('sunum-ileri').focus(); // klavye odağı rehberde kalır
}

function move(d) {
  if (!tour) return;
  if (d > 0 && tour.isLast) return stopTour();
  if (d > 0) tour.next();
  else tour.prev();
  render();
}

function doAction() {
  if (!tour?.step.action) return;
  ACTIONS[tour.step.action]();
  setTimeout(() => {
    position(true);
    if (tour && !pop.contains(document.activeElement)) $('sunum-eylem').focus();
  }, 60);
}

function onKey(e) {
  if (!tour) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    stopTour();
    return;
  }
  if (isTyping()) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') move(1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') move(-1);
  else return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

function build() {
  hole = h('div', { class: 'tour-hole', 'aria-hidden': 'true' });
  pop = h('div', { class: 'tour-pop', role: 'dialog', 'aria-labelledby': 'sunum-baslik', 'aria-describedby': 'sunum-metin' },
    h('div', { class: 'tour-head' },
      h('p', { class: 'tour-step', id: 'sunum-adim' }),
      h('button', { type: 'button', class: 'icon-btn', id: 'sunum-kapat', 'aria-label': 'Sunum modunu kapat', title: 'Kapat (Esc)', text: '✕', onclick: () => stopTour() })),
    h('div', { 'aria-live': 'polite' }, h('h2', { id: 'sunum-baslik' }), h('p', { id: 'sunum-metin' })),
    h('div', { class: 'tour-btns' },
      h('button', { type: 'button', id: 'sunum-geri', text: '← Geri', onclick: () => move(-1) }),
      h('button', { type: 'button', id: 'sunum-eylem', class: 'sec', onclick: doAction }),
      h('button', { type: 'button', id: 'sunum-ileri', class: 'primary', onclick: () => move(1) })));
  root = h('div', { class: 'tour', id: 'sunum', hidden: true }, hole, pop);
  document.body.append(root);
}

/** Sunum modunu açar (at: başlanacak adım). */
export function startTour(at = 0) {
  if (!root) build();
  if (!tour) {
    opener = /** @type {HTMLElement | null} */ (document.activeElement);
    window.addEventListener('keydown', onKey, true);
    timer = setInterval(() => position(), 250);
  }
  tour = createTour(TOUR_STEPS);
  tour.go(at);
  root.hidden = false;
  render();
  $('sunum-ileri').focus();
}

export function stopTour() {
  if (!tour) return;
  tour = null;
  root.hidden = true;
  clearInterval(timer);
  window.removeEventListener('keydown', onKey, true);
  if (isMobile()) openSide(false);
  opener?.focus?.();
}

export function initTour() {
  $('sunum-ac').addEventListener('click', () => startTour());
}
