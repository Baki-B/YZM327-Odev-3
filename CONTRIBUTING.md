# Katkı rehberi

Proje bağımlılıksızdır: Node 22 ya da üstü yeter, `npm install` gerekmez.

```bash
npm test
```

## Değişiklik yapmadan önce bilinmesi gerekenler

- **Kesin kurallar (IoS sözleşmesi):** atomlarda (`src/functions/`, `src/atomic/`) hazır arama işlevi
  (`indexOf`, `includes`, düzenli ifade...), `console`, dosya, ağ, saat ve rastgelelik kullanılmaz.
  `tests/unit/forbidden.test.js` bunu her çalıştırmada denetler.
- **Test kuralı:** yeni kod testle gelir; mevcut bir test atlanmaz, silinmez, gevşetilmez.
- **Sayı kuralı:** belgelerdeki her sayı bir ölçüm ya da denetim dosyasından gelir
  (`bench/results/`, `docs/kalite/`); `node scripts/sayi-denetimi.js` bunu denetler. Ölçüm
  sonucuna bakıp modeli yeniden ayarlamak yoktur; model değişirse yeni bir taze kümede ölçülür
  ve eski sonuç dosyaları silinmez.

## Sık yapılan katkılar

### Yeni bir atom eklemek
1. `src/functions/` altında algoritmayı saf işlev olarak yazın (yasak kurallarına uyarak).
2. `src/atomic/` altında `ExactSearchAtom`'dan türeyen bir sınıf yazın: `static manifest`,
   `prepare()` ve `scanText()`. Molekülün "auto" kipinde aday olacaksa `static selection`
   (maliyet özellikleri ve varsayılan katsayılar) ekleyin; eklemezseniz atom yalnızca adıyla
   çalışır (bkz. `src/contracts.js`, Arayüz Ayırma İlkesi).
3. `src/registry.js`'teki `BUILTIN` listesine ekleyin. Molekülde, katalogda ve atölyede başka hiçbir
   şey değişmez (Açık/Kapalı ilkesi; `molecule.test.js` bunu denetler).
4. `npm test`: sözleşme ve oracle testleri yeni atomu kendiliğinden kapsar.
5. `npm run calibrate` ve yeni bir taze küme ile ölçüm (bkz. README "Komutlar").

### Yeni bir hazır desen kümesi ya da kural
1. `src/workflows/presets.js`'e deseni, `src/scan/rules.js`'e kural bilgisini (önem, CWE) ekleyin.
2. `tests/data/kurallar/<küme>.txt` örnek dosyasına işaretli satırlar yazın:
   `#> <kural-kimliği>` bir sonraki satırın o kuralı tetiklemesi, `#> -` hiçbirini tetiklememesi
   gerektiğini söyler.

### Atölyeye yeni bir kutu
`src/workflows/catalog.js`'e bir bileşen ekleyin (`WorkflowComponent` rolü: tür, kategori, uçlar,
ayarlar, `run()`). Palet, tuval, özellikler paneli ve iş akışı denetimi kutuyu kendiliğinden tanır.

## Göndermeden önce

```bash
npm test
```

```bash
npm run kapsama
```

```bash
npm install --no-save --no-package-lock typescript@6.0.3 @types/node@22 && npm run tur-denetimi
```

Arayüz değiştiyse (Playwright ve axe-core gerekir):

```bash
node scripts/arayuz-denetimi.js && node scripts/erisilebilirlik-denetimi.js && node scripts/baglanti-denetimi.js
```

Belgedeki sayılar değiştiyse:

```bash
node scripts/sayi-denetimi.js
```

Aynı denetimler GitHub Actions'ta her gönderimde çalışır (`.github/workflows/`).

## Biçim

- ES modülleri, 2 boşluk girinti, LF satır sonu (`.editorconfig`).
- Kod yorumları, kullanıcıya gösterilen iletiler ve belgeler Türkçe.
- Commit iletisi: kısa, emir kipinde başlık; gövdede ne ve neden.
- Önemli tasarım kararları `KARARLAR.md`'ye gerekçesiyle, kullanıcıya görünen değişiklikler
  `CHANGELOG.md`'ye yazılır.
