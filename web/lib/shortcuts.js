// Klavye kısayolları: hem kısayol penceresi hem özellikler panelindeki "Klavye" bölümü bu
// tablodan üretilir (tek kaynak). DOM'suzdur.

export const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], what: 'İş akışını tarayıcıda çalıştır' },
  { keys: ['Ctrl', 'Z'], what: 'Geri al (kutu, bağlantı, ayar, taşıma, paket yükleme)' },
  { keys: ['Ctrl', 'Shift', 'Z'], alt: ['Ctrl', 'Y'], what: 'Yinele' },
  { keys: ['Ctrl', 'D'], what: 'Seçili kutuyu çoğalt' },
  { keys: ['Ctrl', 'C'], what: 'Seçili kutuyu panoya kopyala (JSON)' },
  { keys: ['Ctrl', 'V'], what: 'Panodaki kutuyu ya da iş akışını yapıştır' },
  { keys: ['Delete'], what: 'Seçili kutuyu ya da bağlantıyı sil' },
  { keys: ['←', '↑', '→', '↓'], what: 'Seçili kutuyu taşı (Shift ile 50 px)' },
  { keys: ['Enter'], what: 'Bileşen listesinde: tuvale ekle · uçta: bağlantıya başla / bitir' },
  { keys: ['Esc'], what: 'Bağlantıdan vazgeç, seçimi kaldır, pencereyi kapat' },
  { keys: ['?'], what: 'Bu kısayol listesini aç' },
];

/** Mac'te Ctrl yerine ⌘ gösterilir. */
export function keyLabel(key, isMac) {
  return isMac && key === 'Ctrl' ? '⌘' : key;
}
