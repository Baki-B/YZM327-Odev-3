// Akış kipi (streaming): çok büyük bir metin (ör. GB'lık log ya da genom) parça parça aranır;
// metnin bütünü belleğe alınmaz. Hyperscan'in "streaming mode"una benzer.
//
// Parça sınırında eşleşme kaçmasın diye önceki pencerenin son (m_max − 1) karakteri bir sonraki
// parçanın başına eklenir (örtüşme). m_max − 1 yeter: bir eşleşme en çok m_max karakterdir, yeni
// parçaya en az bir karakteriyle giren her eşleşme bu pencerede bütünüyle görünür.
// Bir eşleşme, bütünüyle göründüğü İLK pencerede raporlanır: tamamı taşınan kuyrukta kalan
// eşleşme önceki pencerede zaten raporlanmıştır, atlanır. Böylece her eşleşme tam bir kez gelir.
// Sıra, metni bir kerede aramakla aynıdır (konum, sonra desenin listedeki sırası): sonraki
// pencereden gelebilecek eşleşmeler en erken yeni kuyruğun başında başlar, ondan önce başlayanlar
// güvenle verilir, gerisi bir sonraki pencereyle birleştirilip sıralanır.
// Doğruluk kanıtı: tests/unit/stream.test.js (rastgele parça sınırlarında parçalı = bütün).

/** @typedef {import('./contracts.js').SequenceMatch} SequenceMatch */
/** @typedef {import('./contracts.js').SearcherInstance} SearcherInstance */

/**
 * @param {SearcherInstance} searcher  bir atom (ya da process(entry) yöntemi olan herhangi bir arayıcı)
 * @param {string[]} patterns          arayıcıya verilen desenler (sıralama ve örtüşme için)
 * @param {Iterable<string>} chunks    metnin ardışık parçaları (boş parça atlanır)
 * @param {string} [header]            eşleşmelerin kayıt başlığı
 * @returns {Generator<SequenceMatch>} konumlar metnin başına göre
 */
export function* searchChunks(searcher, patterns, chunks, header = 'akış') {
  const keep = Math.max(0, ...patterns.map((p) => p.length)) - 1;
  // Atomun sırası (konum, desenin listedeki sırası). Aynı desen listede birden çok kez varsa
  // her kopya kendi sırasındadır: aynı konumdaki k. kopya, o desenin listedeki k. yeridir.
  const indicesOf = new Map();
  patterns.forEach((p, i) => indicesOf.set(p, [...(indicesOf.get(p) ?? []), i]));
  const order = (a, b) => a.m.position - b.m.position || a.i - b.i;
  let tail = '';
  let offset = 0;    // kuyruğun metindeki başlangıcı
  let pending = [];  // sırası henüz kesinleşmemiş eşleşmeler: { m, i }
  for (const chunk of chunks) {
    if (!chunk) continue;
    const text = tail + chunk;
    let at = -1;
    let copies = new Map();
    for (const m of searcher.process({ header, seq: text })) {
      if (m.position !== at) { at = m.position; copies = new Map(); }
      const k = copies.get(m.pattern) ?? 0;
      copies.set(m.pattern, k + 1);
      if (m.position + m.length <= tail.length) continue; // önceki pencerede raporlandı
      pending.push({ m: { ...m, position: offset + m.position }, i: indicesOf.get(m.pattern)?.[k] ?? 0 });
    }
    pending.sort(order);
    const cut = text.length - Math.min(keep, text.length);
    const nextOffset = offset + cut;
    let n = 0;
    while (n < pending.length && pending[n].m.position < nextOffset) n++;
    for (const p of pending.slice(0, n)) yield p.m;
    pending = pending.slice(n);
    tail = text.slice(cut);
    offset = nextOffset;
  }
  for (const p of pending) yield p.m;
}

/**
 * Bir metni verilen uzunlukta parçalara böler (testler ve komut satırı için yardımcı).
 * @param {string} text
 * @param {number} size
 */
export function* chunksOf(text, size) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}
