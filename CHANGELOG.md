# Değişiklik günlüğü

Biçim [Keep a Changelog](https://keepachangelog.com/tr-TR/1.1.0/) önerisine, sürüm numaraları
[Anlamsal Sürümleme](https://semver.org/lang/tr/) kuralına uyar. Maliyet modelinin kendi sürümleri
(v1–v4) ayrıdır; ayrıntısı rapordaki sürüm tablosundadır. Tarihler ve ayrıntılı değişiklikler git
geçmişindedir.

## [1.0.0] — vize teslimi

### Eklendi
- **Sunum modu** (`web/views/tour.js`, DOM'suz kısmı `web/lib/tour.js`): atölyeyi adım adım
  tanıtan rehber; paket açma, dosya ekleme, bağlama, çalıştırma, molekülün kararı. Üst çubuktaki
  düğmeyle ya da `web/?sunum=1` adresiyle açılır; sitenin ana sayfasında bağlantısı var.
- **Geri al / yinele** (Command deseni, `src/workflows/history.js`): kutu ekleme, silme, taşıma,
  bağlama, ayar değiştirme, paket açma, içe aktarma, temizleme; Ctrl+Z, Ctrl+Shift+Z, düğmeler.
  Aynı ayara ardışık yazmalar ve ok tuşuyla adım adım taşıma tek adımda birleşir.
- Atölyede **kopyala / yapıştır / çoğalt** (Ctrl+C, Ctrl+V, Ctrl+D), **otomatik kayıt** (son iş akışı
  bu tarayıcıda saklanır), **tuvale JSON dosyası bırakma**, **kısayol penceresi** (?).
- **İş akışı denetimi** (`src/workflows/lint.js`): bağlanmamış, çıkışı kullanılmayan kutu, sonuç
  kutusu olmayan iş akışı, test referansı atomu... Canlı "Denetim" sekmesi ve kutu işaretleri.
- **Diyagram dışa aktarımı** (Mermaid, Graphviz DOT) ve **çalıştırma kaydı** (provenance: iş akışı,
  bileşen sürümleri, girdi dosyalarının SHA-256 özetleri, süreler, molekül kararları).
- **`ios scan`**: birden çok hazır küme, `--format text|json|sarif`, `--word` (tam sözcük),
  satır içi bastırma (`ios:ignore`, `ios:ignore-next-line`), `.iosignore`, `--baseline`
  (yalnızca yeni bulgular), gizli bilgi değerlerinin maskelenmesi; kural kimliği, önem ve CWE.
- **`ios workflow run|lint|explain|diagram`**: atölyede kurulan iş akışı tarayıcısız (CI'da).
- Atölyede **SARIF indir** kutusu; "Eşleşme → Bulgu" kutusunda bastırma ve tam sözcük ayarları.
- **Önbellek** (atölye): ayarı ve girdisi değişmeyen kutu yeniden çalışmaz; anahtar kutunun türü,
  ayarları ve girişlerine bağlı kutuların anahtarlarının SHA-256 özeti. "Önbelleği boşalt" düğmesi;
  çalıştırma kaydı önbellekten gelen kutuyu işaretler. Komut satırı önbelleksiz çalışır.
- **En uzun eşleşme süzgeci** (`ios scan --longest`, atölyede "Eşleşme → Bulgu" ayarı): iç içe
  desenlerde soldaki en uzun eşleşme kalır (aho-corasick'in leftmost-longest anlamı).
- **`.gitignore` desteği** (`ios scan`, ripgrep gibi): kökteki ve alt klasörlerdeki `.gitignore` dosyaları
  kendi klasörlerine göre okunur, `!kalıp` olumsuzlaması ve `\#`, `\!` kaçışları; açıkça verilen hedef
  `.gitignore`'da olsa da taranır; `--no-gitignore` kapatır.
- **Entropi süzgeci** (`ios scan --min-entropy <bit>`, atölyede "Eşleşme → Bulgu" ayarı): gizli bilgi
  bulgusunun değerinin Shannon entropisi eşiğin altındaysa bulgu atılır (`changeme`, `os.environ`,
  `XXXX-XXXX`); detect-secrets ve gitleaks'teki entropi denetimi.
- **Akış kipi** (`src/stream.js`): büyük metin parça parça aranır; (m − 1) karakterlik örtüşmeyle
  sınırdaki eşleşme kaçmaz, sıra bütün metni aramakla aynı (özellik tabanlı test).
- **Mini harita** (atölye, ▦ düğmesi): bütün tuvalin küçültülmüş görünümü ve görünen alan; tıklanan yer
  ortaya gelir. Varsayılan kapalı, telefonda gösterilmez.
- **Otomatik yerleşim** (atölye, "Düzenle"): katmanlı çizim (en uzun yol, barycenter sıralaması,
  kesişen kablo sayısıyla seçim); bütün taşımalar tek adımda geri alınır.
- **Görünüm modelleri** (`web/lib/view-models.js`): arayüzün ekrana yazdığı metin, sıra ve oranlar
  DOM'suz işlevlerde, birim testli; öğe kurma yardımcıları elle yazılmış sahte bir DOM'la sınanır.
- **Rol arayüzleri** (`src/contracts.js`): Describable, Searcher, SelectionProvider, WorkflowComponent.
  Derleme anında da zorunlu: atomun nesne tarafı `@implements`, statik tarafı türlü yerleşik liste;
  `tests/types/roller.js`'teki olumsuz kontroller bozuk bileşenin derleme hatası verdiğini gösterir.
- Kalite kapıları: statik tür denetimi (`tsc --checkJs`), test kapsaması eşikleri, erişilebilirlik
  denetimi (axe-core, WCAG 2.1 AA), CodeQL, kendi taramamız (SARIF), Node 22 ve 24 matrisi.
- Depo düzeni: LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CITATION.cff, konu ve pull request
  şablonları, Dependabot, `.editorconfig`, `.gitattributes`.

### Değişti
- `web/app.js` (1 060 satır) sorumluluklarına göre modüllere bölündü: durum, denetleyici (cephe +
  dört alt modül), beş görünüm, olay yolu, klavye; DOM'suz yardımcılar `web/lib/` altında.
- Kayıt defteri ve katalog sözleşmeyi rol denetimiyle uygular; eksik üye adıyla söylenir.
- Site ve sunum sayfalarında İçerik Güvenliği Politikası (CSP); sunumun betiği ayrı dosyada.
- Mutasyon denetimi 12 hatadan 25 hataya genişledi (geçmiş, tarama, denetim modülleri); ilk turda
  kaçan parmak izi mutasyonu için test güçlendirildi. Sonra arayüz katmanından 4; önbellekten, otomatik
  yerleşimden, akış kipinden, en uzun eşleşme süzgecinden, `.gitignore` olumsuzlamasından, entropi süzgecinden ve mini haritadan
  birer hata eklendi (toplam 36; biri metni `innerHTML` ile yazarak XSS açığı açar).
- Mutasyon denetimi CI'da her gönderimde çalışır; yakalanmayan hata varsa iş kalır. Testler ayrı
  bir süreç grubunda başlar ve tur bitince grubun tamamı durdurulur.

### Düzeltildi
- Özellikler panelinde boş değerler "null" yazısı olarak görünüyordu (yardım metni olmayan kutu,
  paketsiz iş akışı, boş denetim listesi): DOM'un `append`'i `null`'ı metne çevirir. Yeni `append`
  yardımcısı (`web/lib/dom.js`) bunları atlar; arayüz denetimi her paketin her kutusunda paneli denetler.
- Özellikler panelinde yazarken her tuşta panel yeniden çiziliyor, yalnızca ilk harf kaydediliyor
  ve odak kayboluyordu.
- Eklenen kutuya gecikmeli verilen odak, kullanıcının o arada seçtiği uçtan odağı çalabiliyordu.
- Erişilebilirlik: soluk yazıların karşıtlık oranı (açık temada 3,74 → 5,56), sekme listesinin
  yapısı, bileşen düğmelerinin ekran okuyucu adı, kayan panellere klavyeyle erişim.
- `engine.js` ve `race.js`'teki sözdizimi bozuk JSDoc tür yorumları (tür denetimi buldu).
- Mutasyon denetiminde süre aşımı yalnızca ana test sürecini durduruyordu; sonsuz döngüdeki test
  dosyası sahipsiz kalıp sonraki turlarda işlemciyi kullanmayı sürdürüyordu.

### Güvenlik
- Paylaşılan bağlantıdaki iş akışı metinleri HTML olarak yorumlanmaz (testle gösterildi); CSP
  sayfaya sonradan sokulan satır içi betiği engeller.

## [0.4.0] — model v4, Kod Bilimi Atölyesi
- Molekülün karar adımı hafifledi: şekil hesabı en fazla 64 × 256 karakter sayar (v3: 262 144).
- Taze doğrulama kümeleri D (çok desen) ve E (tek desen), birer kez ölçüldü; uçtan uca ölçüt.
- Tarayıcıda çalışan iş akışı düzenleyicisi (atölye), altı hazır paket, iş akışı motoru, site,
  sunum, UML diyagramları; proje `YZM327-Odevler/vize`'den bu depoya geçmişiyle taşındı.

## [0.3.0] — model v3
- Eşleşme başına maliyet bütün atomlarda ortak (v2'de ikili alfabede yapay ucuzluk vardı).

## [0.2.0] — model v2
- Tek desenli atomların maliyeti en kısa / ortalama / en uzun desenin ortalamasıyla.

## [0.1.0] — model v1
- Sekiz atom, ExactMatch molekülü, kalibre edilmiş maliyet modeli, komut satırı.
