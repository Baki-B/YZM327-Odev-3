// Küçük olay yolu (Observer / yayımla-abone ol deseni).
//
// Arayüz modülleri birbirini doğrudan çağırmaz: denetleyici (actions.js) durumu değiştirip bir
// olay yayımlar, görünümler (views/*.js) abone oldukları olaylarda kendilerini yeniden çizer.
// Böylece bir görünüm eklemek ya da çıkarmak denetleyiciyi değiştirmez.
// DOM'suzdur (tests/unit/web.test.js).

/**
 * Olay adları:
 *   degisti   iş akışı değişti ({ structure }: kutu/bağlantı mı, yalnızca ayar mı)
 *   secim     seçili kutu ya da bağlantı değişti
 *   tasindi   bir kutu taşındı ({ id }) — yalnızca kablolar ve konum güncellenir
 *   calisma   çalıştırma başladı, ilerledi ya da bitti
 *   yaris     atom yarışı sonucu geldi
 *   yuklendi  iş akışının tamamı değişti (paket, içe aktarma, geri alma)
 *   gecmis    geri al / yinele yığını değişti
 *   sekme     sonuç sekmesi değişti
 *   odak      bir kutuya klavye odağı verilsin ({ id })
 */
export function createBus() {
  /** @type {Map<string, Set<(payload: any) => void>>} */
  const subs = new Map();
  return {
    /** Abone olur; aboneliği bitiren işlevi döndürür. */
    on(event, fn) {
      if (!subs.has(event)) subs.set(event, new Set());
      subs.get(event).add(fn);
      return () => subs.get(event)?.delete(fn);
    },
    /** Olayı yayımlar; abonelerin kayıt sırasıyla çağrılır. Bir abonenin hatası diğerlerini durdurmaz. */
    emit(event, payload = {}) {
      const errors = [];
      for (const fn of [...(subs.get(event) ?? [])]) {
        try { fn(payload); } catch (err) { errors.push(err); }
      }
      if (errors.length) throw errors[0];
    },
    count(event) {
      return subs.get(event)?.size ?? 0;
    },
  };
}

export const bus = createBus();
