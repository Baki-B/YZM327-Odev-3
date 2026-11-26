# Benzer projeler: GitHub'da en çok yıldız alanlar ve bizim aldıklarımız

**Yöntem.** GitHub arama API'siyle (`gh api -X GET search/repositories`, yıldıza göre sıralı) dört
kategoride arama yapıldı: düğüm tabanlı iş akışı düzenleyicileri, bilimsel iş akışı yöneticileri,
kod ve gizli bilgi tarayıcıları, desen eşleştirme kütüphaneleri. Ham sonuçlar (71 tekil depo, yıldız
sayıları 25 Kasım 2026 tarihli): [kalite/github-arastirma.json](kalite/github-arastirma.json).
Özellik karşılaştırmaları projelerin kendi belgelerine dayanır; aşağıda "doğrulandı" yazanlar bu
çalışmada kaynağından yeniden okundu (bağlantılar en altta).

Durum: **alındı** (bu sürümde var) · **zaten vardı** · **gelecek iş** (rapor, Bölüm 7) ·
**alınmadı** (neden yazılı).

## 1. Düğüm tabanlı iş akışı düzenleyicileri

| Depo | Yıldız | Öne çıkan özellik | Bizdeki karşılığı | Durum |
|---|---:|---|---|---|
| n8n-io/n8n | 212 114 | geri al / yinele, iş akışını JSON olarak kopyala-yapıştır, hazır şablonlar, iş akışını komut satırından çalıştırma | Command desenli geçmiş; Ctrl+C/Ctrl+V parça ve bütün iş akışı; altı hazır paket; `ios workflow run` | alındı |
| langflow-ai/langflow | 156 938 | akışı JSON olarak dışa / içe aktarma | `Dışa aktar` / `İçe aktar`, paylaşılabilir bağlantı | zaten vardı |
| Comfy-Org/ComfyUI | 148 591 | iş akışı dosyasını tuvale bırakarak açma, tarayıcıda otomatik kayıt, yalnızca değişen kutuları yeniden çalıştırma | tuvale JSON bırakma, otomatik kayıt, yalnızca değişen kutuları yeniden çalıştıran önbellek | alındı |
| FlowiseAI/Flowise | 55 595 | görsel akış + aynı akışı bir API'den çalıştırma | aynı iş akışı tarayıcıda ve `ios workflow run` ile CI'da | alındı |
| xyflow/xyflow | 39 154 | bağlantı doğrulama kancası, klavye erişilebilirliği, mini harita | türlü uçlar ve nedenli red, klavyeyle ekleme / bağlama / taşıma, WCAG 2.1 AA denetimi | alındı (mini harita: gelecek iş) |
| node-red/node-red | 23 878 | kutunun altında çalışma durumu, panodan içe / dışa aktarma, bilgi kenar çubuğu | kutu alt bilgisinde durum ve süre, pano, özellikler panelinde yardım ve manifest | zaten vardı + pano alındı |
| RaspberryPiFoundation/blockly | 13 621 | tür denetimli bağlantılar, kategorili araç kutusu | uç türleri (Source.File, FASTA.Entry...), kategorili palet | zaten vardı |
| retejs/rete | 12 323 | eklentiyle geçmiş (geri al / yinele), otomatik yerleşim | geçmiş çekirdeğe alındı (DOM'suz, test edilir) | alındı (otomatik yerleşim: gelecek iş) |
| jagenjo/litegraph.js | 8 191 | düğüm arama, grafiği JSON'a çevirme | palette arama, serializeWorkflow | zaten vardı |
| jerosoler/Drawflow | 6 174 | JSON içe / dışa aktarma, yalnızca görüntüleme kipi | içe / dışa aktarma | zaten vardı (görüntüleme kipi: alınmadı, gerek yok) |
| biolab/orange3 | 5 768 | türlü sinyallerle bağlanan araçlar, çalışmanın raporu | türlü uçlar; çalıştırma kaydı ve "Açıkla" | alındı |

## 2. Bilimsel iş akışı yöneticileri

| Depo | Yıldız | Öne çıkan özellik | Bizdeki karşılığı | Durum |
|---|---:|---|---|---|
| nextflow-io/nextflow | 3 535 | iş akışı grafiği (DAG) çıktısı, çalıştırma izi ve raporu, kaldığı yerden sürdürme | Mermaid / DOT diyagramı; çalıştırma kaydı (sürümler, girdi SHA-256, süreler); kaldığı yerden sürdürme (atölyede önbellek) | alındı |
| snakemake/snakemake | 2 908 | `--dag`, `--report`, `--lint` | `ios workflow diagram`, çalıştırma kaydı, `ios workflow lint` ve canlı "Denetim" sekmesi | alındı |
| galaxyproject/galaxy | 1 902 | türlü veri tipleri, aracın içinde testleri, iş geçmişinde köken bilgisi (provenance), iş akışı denetimi | uç türleri; paketlerin beklenen sonucu komut satırıyla eşitleniyor; çalıştırma kaydı; lint | alındı |

## 3. Kod ve gizli bilgi tarayıcıları

| Depo | Yıldız | Öne çıkan özellik | Bizdeki karşılığı | Durum |
|---|---:|---|---|---|
| BurntSushi/ripgrep | 70 332 | `-w` tam sözcük, `--json`, `.gitignore` | `--word`, `--format json`, `.iosignore` | alındı (`.gitignore`'un tam anlamı: gelecek iş) |
| gitleaks/gitleaks | 31 339 | kural anahtar sözcüklerinden **Aho-Corasick ön süzgeci** (doğrulandı), satır içi `gitleaks:allow`, yok sayma dosyası, taban çizgisi, `--redact`, SARIF | aynı fikirler: tam eşleşme (bizde Aho-Corasick dahil 8 atom) + `ios:ignore`, `.iosignore`, `--baseline`, maskeleme, SARIF | alındı (düzenli ifade kuralları: alınmadı, ödev tam eşleşme) |
| trufflesecurity/trufflehog | 29 655 | bulunan anahtarı servise sorarak doğrulama | — | alınmadı: atomlarda ağ yasak; başkasının anahtarını denemek etik ve hukuki risk |
| eslint/eslint | 27 652 | kural meta verisi, `eslint-disable-next-line` | kural kimliği ve önemi; `ios:ignore-next-line` | alındı |
| semgrep/semgrep | 17 940 | kural kimliği / önem / CWE, `nosemgrep`, **işaretli örnek dosyalarla kural testi** (`ruleid:` / `ok:`, doğrulandı), SARIF, taban çizgisi | `src/scan/rules.js` (CWE dahil); `tests/data/kurallar/*.txt` (`#> kural` / `#> -`); SARIF; `--baseline` | alındı |
| github/codeql | 10 412 | statik güvenlik analizi, GitHub kod tarama | `.github/workflows/codeql.yml`; kendi SARIF'imiz aynı ekrana yükleniyor | alındı |
| kucherenko/jscpd | 6 618 | SARIF ve rozet raporlayıcıları | SARIF | alındı |
| Yelp/detect-secrets | 4 682 | taban çizgisi dosyası, satır içi izin, eklentili dedektörler | `--baseline`, `ios:ignore`; eklenti mimarisinin karşılığı kayıt defteri | alındı (entropi dedektörü: gelecek iş) |
| folke/todo-comments.nvim | 4 227 | TODO / FIX / HACK / WARN gibi iş notu etiketleri | `todo` hazır kümesi | zaten vardı |
| pgilad/leasot, alstr/todo-to-issue-action | 815, 800 | iş notlarını rapor ya da iş kaydına (issue) çevirme | SARIF (iş notları "note" düzeyinde) | kısmen (iş kaydına çevirme: gelecek iş) |

## 4. Desen eşleştirme kütüphaneleri

| Depo | Yıldız | Öne çıkan özellik | Bizdeki karşılığı | Durum |
|---|---:|---|---|---|
| vi3k6i5/flashtext | 5 713 | anahtar sözcükleri sözcük sınırıyla bulma | `--word` ve atölyedeki "tam sözcük" ayarı | alındı |
| intel/hyperscan | 5 521 | çok desenli yüksek hızlı eşleştirme motoru, akış (streaming) kipi | 8 atom + molekül | akış kipi: gelecek iş |
| BurntSushi/aho-corasick | 1 311 | Aho-Corasick; seçilebilir eşleşme anlamları (en solda ilk / en uzun) | Aho-Corasick atomu (sözleşme bütün örtüşen eşleşmeleri ister) | en uzun eşleşme süzgeci: gelecek iş |

**Molekül fikrinin pratikte karşılığı.** Rust'ın düzenli ifade motoru (regex-automata), ön süzgeç
için desen sayısına göre otomaton türünü seçer: 500 desene kadar DFA, üstünde bitişik NFA
(doğrulandı). gitleaks, pahalı düzenli ifadeyi yalnızca ucuz bir tam eşleşme ön süzgeci bir anahtar
sözcük bulduğunda çalıştırır (doğrulandı). İkisi de bizim molekülümüzün yaptığını sabit bir kuralla
yapıyor: "girdinin şekline göre algoritma seçmek". Bizdeki fark, kuralın elle değil, ölçümle
kalibre edilmiş bir maliyet modeliyle kurulması ve kararın gerekçesiyle kaydedilmesi.

## 5. Depo düzeni (yüksek yıldızlı depolarda ortak olanlar)

README'de durum rozetleri ve canlı adres · `LICENSE` · `CONTRIBUTING.md` · `SECURITY.md` ·
`CODE_OF_CONDUCT.md` · `CHANGELOG.md` · `CITATION.cff` (bilimsel yazılımlarda: Snakemake, Galaxy) ·
konu ve pull request şablonları · `CODEOWNERS` · Dependabot · `.editorconfig` / `.gitattributes` ·
CodeQL · birden çok Node sürümünde test (matris). Hepsi bu sürümde eklendi.

## Doğrulama kaynakları

- gitleaks: [detect.go (v8.16.0, Debian kaynak paketi)](https://sources.debian.org/src/gitleaks/8.16.0-1/detect/detect.go), [GitLab: anahtar sözcüklerin ön süzgeç olarak kullanımı](https://gitlab.com/gitlab-org/gitlab/-/issues/362816)
- semgrep: [Testing rules](https://semgrep.dev/docs/writing-rules/testing-rules)
- regex-automata: [aho_corasick ön süzgeci kaynak kodu](https://codebrowser.dev/tokio/crates/regex-automata-0.4.3/src/util/prefilter/aho_corasick.rs.html), aho-corasick: [AhoCorasick belgesi](https://docs.rs/aho-corasick/1.1.3/aho_corasick/struct.AhoCorasick.html)
