# Mutasyon denetimi

Koda bilerek küçük hatalar yerleştirildi; her biri projenin geçici bir kopyasında tek başına uygulanıp bütün birim testleri çalıştırıldı. Bir mutasyon, en az bir test başarısız olursa ya da testler sonsuz döngü yüzünden bitmezse "yakalandı" sayılır.

Değiştirilmemiş kopyada: 478 test geçti, 0 başarısız. Sonuç: **30 mutasyonun 30 tanesi yakalandı.** Komut: `npm run mutation` (2026-11-26).

| # | Dosya | Yerleştirilen hata | Değişiklik | Yakalandı mı | Nasıl |
|---:|---|---|---|---|---|
| 1 | `src/functions/horspool.js` | Horspool kayması bir fazla (m − i) | `shift[p[i]] = m - 1 - i;` → `shift[p[i]] = m - i;` | evet | 49 test başarısız |
| 2 | `src/functions/kmp.js` | KMP uyuşmazlıkta sınırı unutur (q = 0) | `while (q > 0 && p[q] !== c) q = fail[q - 1];` → `while (q > 0 && p[q] !== c) q = 0;` | evet | 10 test başarısız |
| 3 | `src/functions/bm4dnaDs.js` | bm4DNADS sentinel denetiminde < yerine <= (j > n) | `if (j >= n) return;` → `if (j > n) return;` | evet | testler 90 sn içinde bitmedi (sonsuz döngü), süreç durduruldu |
| 4 | `src/functions/bm4dnaHmbs.js` | bm4DNAHMbs desende olmayan q-gram için m kadar kayar (ödevin ipucu hatası) | `const dflt = m - q + 1;` → `const dflt = m;` | evet | 34 test başarısız |
| 5 | `src/functions/shiftOr.js` | Shift-Or (m > 32) son pencereyi atlar | `const limit = n - m + w;` → `const limit = n - m + w - 1;` | evet | 3 test başarısız |
| 6 | `src/functions/wuManber.js` | Wu-Manber çakışmada en küçük kaymayı değil sonuncuyu tutar | `if (sft < shift[h]) shift[h] = sft;` → `shift[h] = sft;` | evet | 13 test başarısız |
| 7 | `src/functions/ahoCorasick.js` | Aho-Corasick sözlük bağlarını kurmaz (iç içe desenler kaçar) | `dict[s] = word[f] !== -1 ? f : dict[f];` → `dict[s] = -1;` | evet | 19 test başarısız |
| 8 | `src/functions/hits.js` | Sonuçlar sıralanmaz | `const keys = this.keys.subarray(0, this.count).sort();` → `const keys = this.keys.subarray(0, this.count);` | evet | 82 test başarısız |
| 9 | `src/functions/alphabet.js` | ignoreCase ASCII sınırı bir fazla ({ → [) | `return code >= 97 && code <= 122 ? code - 32 : code;` → `return code >= 97 && code <= 123 ? code - 32 : code;` | evet | 1 test başarısız |
| 10 | `src/atomic/ExactSearchAtom.js` | Metinden uzun bir desen varsa hiç aranmaz (minLen yerine maxLen) | `if (n > 0 && this.minLen <= n) {` → `if (n > 0 && this.maxLen <= n) {` | evet | 11 test başarısız |
| 11 | `src/functions/boyerMoore.js` | Boyer-Moore tam eşleşmeden sonra iyi sonek kayması yerine m kayar (örtüşen eşleşme kaçar) | `s += good[0];` → `s += m;` | evet | 18 test başarısız |
| 12 | `src/molecules/ExactMatch.js` | Molekül en pahalı atomu seçer (sıralama ters) | `ranked.sort((a, b) => a.seconds - b.seconds);` → `ranked.sort((a, b) => b.seconds - a.seconds);` | evet | 5 test başarısız |
| 13 | `src/workflows/history.js` | Geri alınan komut yinele yığınına konmaz | `    this.#redo.push(cmd);` → `    // this.#redo.push(cmd);` | evet | 7 test başarısız |
| 14 | `src/workflows/history.js` | Birleştirme seal() sonrasında da sürer (ayrı adımlar tek adıma karışır) | `if (!this.#sealed && top && cmd.key !== undefined` → `if (top && cmd.key !== undefined` | evet | 4 test başarısız |
| 15 | `src/workflows/history.js` | Kutu silmeyi geri almak bağlantıları eski sırasına koymaz | `for (const { i, edge } of saved.edges) doc.wf.edges.splice(i, 0, clone(edge));` → `for (const { edge } of saved.edges) doc.wf.edges.push(clone(edge));` | evet | 5 test başarısız |
| 16 | `src/workflows/lint.js` | Çıkmaz kutu denetimi çıkış yerine giriş bağlantısına bakar | `!wf.edges.some((e) => e.from.node === n.id)` → `!wf.edges.some((e) => e.to.node === n.id)` | evet | 2 test başarısız |
| 17 | `src/scan/filters.js` | "ios:ignore-next-line" alttaki satırı değil kendi satırını bastırır | `return line > 1 && lineAt(text, starts, line - 1).includes(INLINE_IGNORE_NEXT);` → `return line > 1 && lineAt(text, starts, line).includes(INLINE_IGNORE_NEXT);` | evet | 3 test başarısız |
| 18 | `src/scan/filters.js` | Tam sözcük: sağ sınır yanlış karakterde denetlenir | `if (isWordChar(last) && isWordChar(text[position + length])) return false;` → `if (isWordChar(last) && isWordChar(text[position + length - 1])) return false;` | evet | 2 test başarısız |
| 19 | `src/scan/report.js` | Gizli bilgi değeri maskelenmez | `  return after.slice(0, i) + MASK + after.slice(j);` → `  return after;` | evet | 3 test başarısız |
| 20 | `src/scan/report.js` | Aynı metinli iki satır aynı parmak izini alır (sıra numarası artmaz) | `    seen.set(base, k + 1);` → `    seen.set(base, k);` | evet | 1 test başarısız |
| 21 | `src/scan/report.js` | SARIF'te önem düzeyi her zaman "warning" | `      level: LEVEL[f.severity ?? rule?.severity] ?? 'warning',` → `      level: 'warning',` | evet | 1 test başarısız |
| 22 | `src/workflows/engine.js` | Tür denetimi kapalı: uyumsuz uçlar bağlanır | `  if (out.type !== inp.type) {` → `  if (false) {` | evet | 5 test başarısız |
| 23 | `src/contracts.js` | Rol denetimi selection.features işlevini aramaz | `      if (!isFn(s.features)) out.push('selection.features bir işlev olmalı');` → `      // features denetimi unutuldu` | evet | 2 test başarısız |
| 24 | `web/lib/geometry.js` | Sığdırma telefonda da masaüstü alt sınırını kullanır (yazılar okunmaz) | `  return Math.max(mobile ? 0.7 : 0.45, z);` → `  return Math.max(0.45, z);` | evet | 1 test başarısız |
| 25 | `src/workflows/CodeScan.js` | Satır içi bastırma varsayılan olarak kapalı | `strategy = 'auto', inlineIgnore = true,` → `strategy = 'auto', inlineIgnore = false,` | evet | 3 test başarısız |
| 26 | `src/workflows/engine.js` | Önbellek anahtarı ayarları içermez (ayar değişse de eski sonuç kullanılır) | `return sha256Hex(JSON.stringify([node.type, node.params ?? {}, inputs]));` → `return sha256Hex(JSON.stringify([node.type, inputs]));` | evet | 4 test başarısız |
| 27 | `web/lib/view-models.js` | Kapı kaldığında durum rozeti bunu söylemez | `const gate = Object.values(run.nodes).some((r) => r.info?.gate === 'kaldı');` → `const gate = false;` | evet | 2 test başarısız |
| 28 | `web/lib/view-models.js` | Atom yarışı tablosu ölçülen süreye göre sıralanmaz | `const rows = [...rc.rows].sort((a, b) => a.ms - b.ms);` → `const rows = [...rc.rows];` | evet | 1 test başarısız |
| 29 | `web/lib/view-models.js` | Klavyeyle bağlama türü uymayan girişleri de önerir | `if (canConnect(wf, catalog, { node: node.id, port: out.name }, { node: other.id, port: inp.name }).ok) {` → `if (true) {` | evet | 1 test başarısız |
| 30 | `web/lib/dom.js` | Metin textContent yerine innerHTML ile yazılır (XSS açığı) | `else if (k === 'text') el.textContent = v;` → `else if (k === 'text') el.innerHTML = v;` | evet | 3 test başarısız |
