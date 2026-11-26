# UML diyagramları

Hepsi tek dosyada: **[UML_Diyagramlari.pdf](UML_Diyagramlari.pdf)**. Kaynaklar PlantUML (`*.puml`); SVG'ler `svg/` klasöründe.

| Diyagram | Gösterdiği |
|---|---|
| [Kullanım durumu](svg/1_kullanim_durumu.svg) | 3 aktör (geliştirici, biyoinformatikçi, CI) ve 10 kullanım durumu; «include» ve «extend» |
| [Sınıf 1/4](svg/2a_sinif_atom_molekul.svg) | ExactSearchAtom (Template Method), atomlar, Registry, ExactMatch, maliyet modeli |
| [Sınıf 2/4](svg/2b_sinif_is_akisi.svg) | İş akışı motoru: Workflow, Node, Edge, Component, Port, uç türleri; atölye |
| [Sınıf 3/4](svg/2c_sinif_komut_gecmisi.svg) | Geri al / yinele: History, Command arayüzü, somut komutlar, MacroCommand (Command + Composite) |
| [Sınıf 4/4](svg/2d_sinif_arayuz_katmanlari.svg) | Atölye arayüzü: state, actions (Facade) ve alt modüller, görünümler, olay yolu (Observer) |
| [Sıralı 1](svg/3a_sirali_molekul_karari.svg) | `ios explain / run`: şekil, aday atomlar, tahmin, seçim |
| [Sıralı 2](svg/3b_sirali_atolye_calistirma.svg) | Atölyede çalıştırma: Web Worker, topolojik sıra, ilerleme iletileri |
| [Sıralı 3](svg/3c_sirali_baglanti.svg) | İki ucu bağlama; uyumsuz bağlantının nedeniyle reddi |
| [Sıralı 4](svg/3d_sirali_geri_al.svg) | Geri al (Ctrl+Z): komut geri alınır, olay yolu görünümleri yeniler |
| [Paket (katman)](svg/4_katmanlar.svg) | Modüller ve bağımlılık yönü |

Yeniden üretmek (proje kökünden):

```bash
node scripts/uml-ciz.js --pdf
```

Bu betik SVG'leri bağımlılıksız çizer; `--pdf` için Playwright gerekir. PlantUML kuruluysa aynı diyagramlar kaynaklardan da üretilebilir (bu çalışma ortamında PlantUML indirilemediği için SVG'ler betikle çizildi; içerik aynıdır):

```bash
java -jar plantuml.jar -charset UTF-8 -tsvg *.puml
```
