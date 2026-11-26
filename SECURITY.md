# Güvenlik politikası

## Açık bildirme

Bir güvenlik açığı bulduysanız açık bir konu (issue) olarak yazmayın. GitHub'ın
**Security → Report a vulnerability** (özel güvenlik bildirimi) yolunu kullanın ya da depo
sahibine özel olarak ulaşın. Bildirimde yeniden üretme adımlarını ve etkisini yazın.
Desteklenen sürüm: en son `main`.

## Tehdit modeli (kısaca)

| Varlık / giriş noktası | Tehdit | Önlem |
|---|---|---|
| Paylaşılabilir bağlantı (`#wf=...`) ve içe aktarılan JSON | Bağlantıdaki kutu adı ya da ayar metniyle sayfaya betik sokmak (XSS) | Bütün metinler `textContent` ile yazılır, HTML olarak yorumlanmaz; `deserializeWorkflow` biçimi ve bileşen türlerini denetler, bilinmeyeni reddeder. Arayüz denetimi kötü niyetli bir bağlantıyla bunu sınar. |
| Sayfanın kendisi | Herhangi bir yoldan sokulan satır içi betik | İçerik Güvenliği Politikası (CSP): yalnızca kendi dosyalarımız (`script-src 'self'`); site sayfalarında hiç betik yok. Arayüz denetimi sonradan eklenen satır içi betiğin çalışmadığını sınar. |
| Kullanıcının yüklediği dosyalar | Verinin bir sunucuya gitmesi | Atölye tamamen tarayıcıda çalışır; dosyalar bilgisayardan çıkmaz. Çalıştırma kaydı dosya içeriğini değil SHA-256 özetini yazar. Paylaşılabilir bağlantı yüklenen içeriği taşır; atölye uzun bağlantıda uyarır. |
| Tarama çıktıları (SARIF, JSON) | Bulunan parolanın çıktıyla sızması | Gizli bilgi kurallarında değer `****` ile maskelenir (`--no-redact` ile açılabilir). |
| Depo | Koda gerçek bir anahtarın girmesi | CI'da kendi tarayıcımız depoyu tarar ve gizli bilgi bulursa kalır (`.github/workflows/tarama.yml`); CodeQL statik güvenlik analizi. Örnek verideki gizli bilgiler açıkça SAHTEDİR (AKIA ile başlayan değer AWS belgelerindeki resmî örnektir). |
| Bağımlılıklar | Tedarik zinciri saldırısı | Projenin hiç npm bağımlılığı yok; denetim araçları yalnızca CI'da, sürümü sabitlenerek kurulur. Dependabot eylem sürümlerini izler. |

## Bilinen sınırlar

- Tarama tam eşleşmedir: `password = "x"` gibi boşluklu atama `password=` desenine uymaz
  (`tests/data/kurallar/secrets.txt` bunu belgeler). Gizli bilgi taraması bir güvenlik ağıdır,
  güvenlik garantisi değildir.
- GitHub Pages yanıt başlığı ayarlanamadığı için CSP `<meta>` ile verilir; `frame-ancestors`
  bu yolla verilemez.
