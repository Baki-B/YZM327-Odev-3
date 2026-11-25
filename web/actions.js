// Denetleyicinin tek giriş kapısı (Facade): görünümler bütün eylemleri buradan alır.
// Eylemler sorumluluklarına göre ayrı modüllerdedir:
//   actions/core.js  değişiklik bildirimi, komut uygulama, seçim, otomatik kayıt
//   actions/edit.js  düzenleme: kutu, bağlantı, ayar, geri al / yinele, kopyala / yapıştır
//   actions/io.js    iş akışının tamamı: paket, içe / dışa aktarma, bağlantı, otomatik kayıt, tema
//   actions/run.js   çalıştırma, yarış, açıklama, diyagram, çalıştırma kaydı, çıktı indirme
export * from './actions/core.js';
export * from './actions/edit.js';
export * from './actions/io.js';
export * from './actions/run.js';
