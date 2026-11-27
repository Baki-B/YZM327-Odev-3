// Sunum modu (adım adım rehber): DOM'suz kısım. Adımların metni ve hedefi, adımlar arasında
// gezinme ve açılır kutunun hedefin yanına, ekrandan taşmadan yerleştirilmesi. Görünüm ve
// eylemler: web/views/tour.js.
//
// Hedef: "#id" ya da bir CSS seçicisi; "@" ile başlayanlar çalışma anında bulunur (ör. tuvale
// rehberin eklediği kutu). Hedefi olmayan adımda açılır kutu ekranın ortasında durur.

/** @typedef {{ id: string, title: string, text: string, target?: string, action?: string }} TourStep */

/** Eylem düğmelerinin yazısı (eylemlerin kendisi görünümdedir). */
export const TOUR_ACTIONS = {
  paket: 'Paketi aç',
  'dosya-kutusu': 'Kutuyu ekle',
  calistir: 'Çalıştır',
  molekul: 'Kutuyu seç',
};

/** Çalışma anında bulunan hedefler. */
export const TOUR_REFS = ['@dosya-kutusu', '@dosya-cikis', '@molekul'];

/** @type {TourStep[]} */
export const TOUR_STEPS = [
  {
    id: 'giris', title: 'Kod Bilimi Atölyesi',
    text: 'Metinde desen arayan algoritmaları (atomları) kutular hâlinde birbirine bağlayıp tarayıcıda çalıştırırsınız. Kurulum gerekmez; dosyalarınız bilgisayarınızdan çıkmaz. İlerlemek için → tuşunu ya da "İleri" düğmesini kullanın.',
  },
  {
    id: 'paket', target: '#paketler', action: 'paket', title: 'Hazır paket seçin',
    text: 'Her paket hazır bir iş akışıdır. Örneğin "gizli-bilgi-sızıntısı" paketi, kodda unutulmuş parola ve API anahtarlarını arar.',
  },
  {
    id: 'tuval', target: '#tuval', title: 'Tuval: kutular ve kablolar',
    text: 'Her kutu bir bileşendir; kablolar veriyi soldan sağa taşır. Uçların türü uyuşmazsa bağlantı, nedeni gösterilerek reddedilir.',
  },
  {
    id: 'bilesen', target: '.pal-item[data-type="kaynak.dosyalar"]', action: 'dosya-kutusu', title: 'Kendi dosyanızı ekleyin',
    text: 'Soldaki "Dosya yükle" bileşenine tıklayın ya da onu tuvale sürükleyin. Kutu tuvale eklenir ve seçili olur.',
  },
  {
    id: 'dosya-sec', target: '#props input[type="file"]', title: 'Dosyaları seçin',
    text: 'Sağdaki özellikler panelinde "Dosyalar" alanından bir ya da birkaç dosya seçin: kaynak kod, log ya da düz metin. Dosyalar tarayıcıda okunur, hiçbir yere gönderilmez.',
  },
  {
    id: 'bagla', target: '@dosya-cikis', title: 'Kutuyu bağlayın',
    text: 'Kutunun sağındaki çıkış ucuna, ardından "Kaynak → FASTA.Entry" uyarlayıcısının giriş ucuna tıklayın. Klavyeyle: uca gelip Enter tuşuna basın.',
  },
  {
    id: 'calistir', target: '#calistir', action: 'calistir', title: 'Çalıştırın',
    text: '"Tarayıcıda çalıştır" düğmesine basın (Ctrl+Enter). Arama arka planda (Web Worker) yapılır, sayfa donmaz. Dosya eklenmemişse rehberin eklediği boş kutu kaldırılır ve paketin örnek dosyaları taranır.',
  },
  {
    id: 'molekul', target: '@molekul', action: 'molekul', title: 'Molekülün kararı',
    text: 'ExactMatch kutusu verinin şekline bakar, her atomun ne kadar süreceğini tahmin eder ve en hızlısını seçer.',
  },
  {
    id: 'karar', target: '#props', title: 'Karar kaydı',
    text: 'Verinin şekli, her atomun tahmini süresi ve seçilen atom burada yazar. "Atomları yarıştır" düğmesi tahmini gerçek ölçümle karşılaştırır.',
  },
  {
    id: 'sonuclar', target: '#sonuclar', title: 'Sonuçlar',
    text: 'Bulgular dosya:satır:sütun biçiminde listelenir. Özet, Açıklama, Atom yarışı ve Denetim sekmeleri de buradadır.',
  },
  {
    id: 'araclar', target: '.canvas-tools', title: 'Geri al, düzenle, yakınlaştır',
    text: 'Her değişiklik geri alınabilir (Ctrl+Z). "Düzenle" kutuları yerleştirir; "Dışa aktar" iş akışını JSON dosyası olarak indirir, "Bağlantı" paylaşılabilir adresi kopyalar.',
  },
  {
    id: 'son', title: 'Rehber bitti',
    text: 'Rehberi istediğiniz zaman üst çubuktaki "Sunum modu" düğmesiyle yeniden başlatabilirsiniz. Aynı taramayı komut satırında "ios scan" yapar.',
  },
];

/**
 * Adımlar arasında gezinme; ilk ve son adımda durur.
 * @param {TourStep[]} steps
 */
export function createTour(steps) {
  if (!steps.length) throw new Error('Rehberde adım yok.');
  let i = 0;
  return {
    get index() { return i; },
    get step() { return steps[i]; },
    get count() { return steps.length; },
    get isFirst() { return i === 0; },
    get isLast() { return i === steps.length - 1; },
    get progress() { return `${i + 1} / ${steps.length}`; },
    /** @param {number} n */
    go(n) {
      i = Math.min(steps.length - 1, Math.max(0, Math.trunc(n) || 0));
      return steps[i];
    },
    next() { return this.go(i + 1); },
    prev() { return this.go(i - 1); },
  };
}

/** @typedef {{ left: number, top: number, width: number, height: number }} Rect */

/**
 * Açılır kutunun yeri: hedefin altı; sığmazsa üstü, sağı, solu; hiçbiri sığmazsa ekranın ortası
 * (hedefin üstünde). Kutu her zaman ekranın içinde kalır.
 * @param {Rect | null} target
 * @param {{ width: number, height: number }} box
 * @param {{ width: number, height: number }} view
 */
export function placePopover(target, box, view, { gap = 12, margin = 8 } = {}) {
  const clampX = (x) => Math.max(margin, Math.min(x, view.width - box.width - margin));
  const clampY = (y) => Math.max(margin, Math.min(y, view.height - box.height - margin));
  const center = { left: clampX((view.width - box.width) / 2), top: clampY((view.height - box.height) / 2) };
  if (!target) return { side: 'center', ...center };
  const below = target.top + target.height + gap;
  const above = target.top - gap - box.height;
  const right = target.left + target.width + gap;
  const left = target.left - gap - box.width;
  const cx = clampX(target.left + target.width / 2 - box.width / 2);
  const cy = clampY(target.top + target.height / 2 - box.height / 2);
  // Hedef ekranın kısmen dışında olabilir: her aday yerin bütünüyle ekranda kalması gerekir.
  const fits = (x, y) => x >= margin && y >= margin && x + box.width <= view.width - margin && y + box.height <= view.height - margin;
  if (fits(cx, below)) return { side: 'below', left: cx, top: below };
  if (fits(cx, above)) return { side: 'above', left: cx, top: above };
  if (fits(right, cy)) return { side: 'right', left: right, top: cy };
  if (fits(left, cy)) return { side: 'left', left, top: cy };
  return { side: 'over', ...center };
}

/**
 * Aydınlatılan çerçeve: hedefin çevresinde pad kadar pay, ekranın dışına taşan kısmı kırpılmış.
 * @param {Rect} target
 * @param {{ width: number, height: number }} view
 */
export function holeRect(target, view, pad = 6) {
  const left = Math.min(view.width, Math.max(0, target.left - pad));
  const top = Math.min(view.height, Math.max(0, target.top - pad));
  const right = Math.min(view.width, target.left + target.width + pad);
  const bottom = Math.min(view.height, target.top + target.height + pad);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Sayfa adresi sunum modunu istiyor mu? (?sunum, ?sunum=1; ?sunum=0 istemez) */
export function tourRequested(search) {
  const p = new URLSearchParams(search);
  return p.has('sunum') && p.get('sunum') !== '0';
}
