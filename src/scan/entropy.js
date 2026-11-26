// Entropi süzgeci: gizli bilgi bulgusunun "değeri" rastgele görünmüyorsa bulgu atılır.
//
// detect-secrets ve gitleaks, anahtar sözcükle bulunan bir atamanın gerçekten sızmış bir anahtar
// mı yoksa değişken adı / yer tutucu mu olduğunu değerin Shannon entropisine bakarak ayırır:
// rastgele üretilmiş bir anahtarın karakterleri dağınıktır (yüksek entropi), "changeme",
// "os.environ", "XXXX-XXXX" gibi değerlerinki toplu (düşük entropi).
//
// Süzgeç isteğe bağlıdır (ios scan --min-entropy <bit>, atölyede "Eşleşme → Bulgu" ayarı) ve yalnızca
// gizli bilgi kurallarına uygulanır. Değer bulunamayan bulgu (ör. düz yazıda "password" sözcüğü,
// "BEGIN RSA PRIVATE KEY" başlığı) kalır: karar verilemeyen bulgu gizlenmez. Bedeli: düşük
// entropili gerçek parolalar ("hunter2") da atılır; eşik bu yüzden kullanıcıya bırakılır.

import { isWordChar } from './filters.js';

/** Değerin bittiği karakterler: boşluk, tırnak, ayraç ve parantezler. */
const STOP = new Set([' ', '\t', '\r', '\n', '"', "'", '`', ',', ';', '(', ')', '[', ']', '{', '}']);
const QUOTES = new Set(['"', "'", '`']);

/**
 * Shannon entropisi, karakter başına bit: H = −Σ p·log₂ p (p: her karakterin dizgideki payı).
 * "aaaa" → 0, "ab" → 1, "0123456789abcdef" → 4.
 * @param {string} s
 */
export function shannonEntropy(s) {
  const chars = [...s];
  const counts = new Map();
  for (const c of chars) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const k of counts.values()) {
    const p = k / chars.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** i'den başlayıp satır sonuna, boşluğa, tırnağa ya da ayraca kadar olan dizgi. */
function readValue(text, i) {
  let j = i;
  while (j < text.length && !STOP.has(text[j])) j++;
  return text.slice(i, j);
}

/**
 * Gizli bilgi bulgusunun değeri:
 *   - desen "=" ya da ":" ile bitiyorsa (password=, token=) hemen ardından gelen dizgi;
 *   - desen bir sözcüğün başıysa (AKIA…) o sözcüğün tamamı;
 *   - değilse aynı satırda desenden sonraki ilk "=" ya da ":" işaretinin ardındaki dizgi
 *     (=, ==, =>, :=, boşluk ve açılış tırnağı atlanır; JSON ve YAML da olur).
 * Satırda atama yoksa null döner (değer yok, karar verilemez). Atama var ama değer boşsa "".
 * @param {string} text      dosyanın tamamı
 * @param {number} position  eşleşmenin başı
 * @param {number} length    eşleşmenin uzunluğu
 * @returns {string | null}
 */
export function secretValue(text, position, length) {
  const end = position + length;
  const last = text[end - 1];
  let i;
  if (last === '=' || last === ':') i = end;
  else if (isWordChar(last) && isWordChar(text[end])) return readValue(text, position);
  else {
    i = end;
    while (i < text.length && text[i] !== '\n' && text[i] !== '=' && text[i] !== ':') i++;
    if (i >= text.length || text[i] === '\n') return null;
    i++;
  }
  while (i < text.length && (text[i] === '=' || text[i] === '>' || text[i] === ' ' || text[i] === '\t')) i++;
  if (QUOTES.has(text[i])) i++;
  return readValue(text, i);
}

/**
 * Bulgu entropi süzgecine takılıyor mu? (değer var ve entropisi eşiğin altında)
 * @param {string} text
 * @param {number} position
 * @param {number} length
 * @param {number} minEntropy  bit / karakter; 0 ya da daha azı süzgeci kapatır
 */
export function isLowEntropy(text, position, length, minEntropy) {
  if (!(minEntropy > 0)) return false;
  const value = secretValue(text, position, length);
  return value !== null && shannonEntropy(value) < minEntropy;
}
