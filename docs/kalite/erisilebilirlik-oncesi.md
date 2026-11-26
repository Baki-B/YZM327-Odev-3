# Erişilebilirlik denetimi: düzeltmeden önceki ilk ölçüm

`node scripts/erisilebilirlik-denetimi.js` ilk kez çalıştırıldığında (axe-core 4.14.1, WCAG 2.1 A + AA,
9 sayfa × açık/koyu tema = 18 tarama) çıktı şuydu:

```
KALDI  Atölye (paket açık, çalıştırılmış) [light] — 4 kural ihlali: aria-required-children (critical, 1), color-contrast (serious, 27), label-content-name-mismatch (serious, 26), scrollable-region-focusable (serious, 1)
KALDI  Atölye (paket açık, çalıştırılmış) [dark] — 4 kural ihlali: aria-required-children (critical, 1), color-contrast (serious, 19), label-content-name-mismatch (serious, 26), scrollable-region-focusable (serious, 1)
KALDI  Atölye (telefon, 390 px) [light] — 3 kural ihlali: aria-required-children (critical, 1), color-contrast (serious, 18), scrollable-region-focusable (serious, 1)
KALDI  Atölye (telefon, 390 px) [dark] — 3 kural ihlali: aria-required-children (critical, 1), color-contrast (serious, 9), scrollable-region-focusable (serious, 1)
KALDI  Site: ana sayfa [light] — 1 kural ihlali: color-contrast (serious, 5)
KALDI  Site: ana sayfa [dark] — 1 kural ihlali: color-contrast (serious, 1)
KALDI  Site: bileşenler [light] — 1 kural ihlali: color-contrast (serious, 5)
KALDI  Site: bileşenler [dark] — 1 kural ihlali: color-contrast (serious, 1)
KALDI  Site: bir bileşen sayfası [light] — 1 kural ihlali: color-contrast (serious, 12)
GEÇTİ  Site: bir bileşen sayfası [dark] — 0 kural ihlali
KALDI  Site: sonuçlar [light] — 1 kural ihlali: color-contrast (serious, 5)
KALDI  Site: sonuçlar [dark] — 1 kural ihlali: color-contrast (serious, 1)
KALDI  Site: rapor [light] — 1 kural ihlali: color-contrast (serious, 5)
KALDI  Site: rapor [dark] — 1 kural ihlali: color-contrast (serious, 1)
KALDI  Site: ekip [light] — 1 kural ihlali: color-contrast (serious, 5)
KALDI  Site: ekip [dark] — 1 kural ihlali: color-contrast (serious, 1)
GEÇTİ  Sunum [light] — 0 kural ihlali
GEÇTİ  Sunum [dark] — 0 kural ihlali

18 tarama; engelleyici (kritik + ciddi) ihlal: 25
```

Yapılan düzeltmeler:

- **aria-required-children:** Sonuç sekmeleri listesinin (`role="tablist"`) içinde sekme olmayan bir düğme
  vardı (paneli daraltma). Düğme listenin dışına alındı.
- **color-contrast:** Soluk yazı rengi `--muted` açık temada beyaz üzerinde 3,74, koyu temada 4,44 karşıtlık
  oranındaydı (WCAG AA en az 4,5 ister). Yeni değerler `#696770` (beyazda 5,56) ve `#9e9ca3` (koyu kutuda 5,66).
  Seçili paket ve seçili menü öğesi için koyu temada vurgu rengi ve yazı rengi de değişti; "başarılı"
  rozetinin yeşili koyulaştırıldı.
- **label-content-name-mismatch:** Bileşen düğmelerinin ekran okuyucu adı görünen yazıyla (ad + rozet)
  başlamıyordu; ad ile rozet arasında boşluk da yoktu. "Özet sayaçlar"ın simgesi Σ bir harf olduğu için
  görünen metin sayılıyordu; ∑ (matematik işareti) yapıldı.
- **scrollable-region-focusable:** Kayan sonuç panelleri klavyeyle odaklanamıyordu (`tabindex="0"` eklendi).

Düzeltmeden sonraki ölçüm: [erisilebilirlik.md](erisilebilirlik.md).
