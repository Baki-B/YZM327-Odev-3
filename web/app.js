// Kod Bilimi Atölyesi: arayüzün giriş noktası. Burada yalnızca modüller birbirine bağlanır.
//
//   state.js          paylaşılan durum (store) ve komut geçmişi
//   actions.js        denetleyici: eylemleri geri alınabilir komutlara çevirir, olay yayımlar
//   views/*.js        görünümler: olaylara abone olur, kendini çizer (tuval, panel, sonuçlar, kenar çubuğu, pencere,
//                     sunum modu)
//   keyboard.js       olay bağlama ve kısayollar
//   lib/*.js          DOM'suz yardımcılar (biçim, geometri, olay yolu, depo, kısayol tablosu)
//
// İş akışı mantığı (düğüm, bağlantı, tür denetimi, sıra, çalıştırma, açıklama, denetim, geçmiş)
// DOM'suz src/workflows/ modüllerindedir; algoritmalar kopyalanmaz, ../src/ altından gelir.
import { state, catalog, history } from './state.js';
import { bus } from './lib/bus.js';
import { initCanvas } from './views/canvas.js';
import { initProps } from './views/props.js';
import { initResults, showTab } from './views/results.js';
import { initPalette } from './views/palette.js';
import { initDialogs } from './views/dialogs.js';
import { initMinimap } from './views/minimap.js';
import { initTour, startTour } from './views/tour.js';
import { tourRequested } from './lib/tour.js';
import { bind } from './keyboard.js';
import * as act from './actions.js';
import { init as initRunner } from './runner.js';
import { serializeWorkflow } from '../src/workflows/engine.js';

initCanvas();
initProps();
initResults();
initPalette();
initDialogs();
initMinimap();
initTour();
bind();
act.initLint();
if (!act.loadFromHash() && !act.restoreAutosave()) act.firstPackage();
showTab();
if (tourRequested(location.search)) startTour(); // ?sunum=1: sayfa sunum moduyla açılır
initRunner().then(() => bus.emit('runner'));

// Testler ve hata ayıklama için (arayüzün kendisi kullanmaz)
window.__atolye = { state, catalog, history, serialize: () => serializeWorkflow(state.wf) };
