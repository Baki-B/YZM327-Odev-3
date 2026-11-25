// Biçimlendirme yardımcıları (DOM'suz; tests/unit/web.test.js Node'da sınar).

/** Türkçe sayı biçimi: 1 234,5 */
export const nf = (x, d = 1) => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** Milisaniye: 1'in altında 3, 100'ün altında 1 ondalık, üstünde tam sayı. */
export const fmtMs = (ms) => (ms == null ? '' : ms < 1 ? `${nf(ms, 3)} ms` : ms < 100 ? `${nf(ms, 1)} ms` : `${nf(Math.round(ms), 0)} ms`);

/** Kategori ve tür adlarından CSS sınıfı. */
export const catClass = (c) => 'cat-' + String(c).replace(/ /g, '-');
export const tyClass = (t) => 'ty-' + t;

/** Dosya adı için Türkçe karakterleri sadeleştirir: "Teknik borç avı" → "teknik-borc-avi". */
export const slug = (s) => String(s).toLocaleLowerCase('tr-TR').replace(/[ıİ]/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'is-akisi';

/** UTF-8 metni URL'de taşınabilen base64url'e çevirir (paylaşılabilir bağlantı). */
export function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s) {
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
