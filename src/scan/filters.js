// Bulgu süzgeçleri: satır içi bastırma, tam sözcük ve yok sayma dosyaları (.iosignore, .gitignore).
//
//   Satır içi bastırma  Bilerek bırakılmış bir satır "ios:ignore" yorumuyla işaretlenir; bir
//                       önceki satıra "ios:ignore-next-line" yazmak da olur. (gitleaks'te
//                       "gitleaks:allow", semgrep'te "nosemgrep", ESLint'te
//                       "eslint-disable-next-line" aynı işi yapar.)
//   Tam sözcük          "return" deseni "returned" içinde bulunmasın (flashtext ve ripgrep -w).
//   .iosignore          Taranmayacak yollar, .gitignore'a benzer kalıplarla.
//   .gitignore          Git'in yok saydığı yollar da taranmaz (ripgrep gibi; --no-gitignore kapatır);
//                       iç içe .gitignore dosyaları kendi klasörlerine göre yorumlanır.
//
// Atomlar tam eşleşmenin hepsini bulur (sözleşme); süzgeçler bulgu katmanında, aramadan
// sonra uygulanır. Komut satırı (CodeScan) ve atölye (Eşleşme → Bulgu) aynı işlevleri kullanır.

export const INLINE_IGNORE = 'ios:ignore';
export const INLINE_IGNORE_NEXT = 'ios:ignore-next-line';

/** 1'den başlayan satır numarasındaki satırın metni (satır sonu karakterleri olmadan). */
export function lineAt(text, starts, line) {
  if (line < 1 || line > starts.length) return '';
  const from = starts[line - 1];
  let to = line < starts.length ? starts[line] - 1 : text.length;
  if (to > from && text.charCodeAt(to - 1) === 13) to--;
  return text.slice(from, to);
}

/** Satırda "ios:ignore" var mı ("ios:ignore-next-line" sayılmaz)? */
function hasSameLineMarker(s) {
  let i = s.indexOf(INLINE_IGNORE);
  while (i >= 0) {
    if (!s.startsWith(INLINE_IGNORE_NEXT, i)) return true;
    i = s.indexOf(INLINE_IGNORE, i + 1);
  }
  return false;
}

/** Bu satırdaki bulgu satır içi yorumla bastırılmış mı? */
export function isSuppressed(text, starts, line) {
  if (hasSameLineMarker(lineAt(text, starts, line))) return true;
  return line > 1 && lineAt(text, starts, line - 1).includes(INLINE_IGNORE_NEXT);
}

const WORD = /[\p{L}\p{N}_]/u;
/** Harf, rakam ya da alt çizgi mi? (tam sözcük ve entropi süzgeçleri) @param {string | undefined} c */
export const isWordChar = (c) => c !== undefined && c !== '' && WORD.test(c);

/**
 * Eşleşme tam sözcük mü? Desenin harf ya da rakamla başlayan (biten) ucunda, metinde önce
 * (sonra) bir harf, rakam ya da alt çizgi olmamalı. Desen "eval(" gibi noktalama ile  ios:ignore
 * bitiyorsa o uçta sınır aranmaz (düzenli ifadelerdeki \b gibi).
 */
export function isWholeWord(text, position, length) {
  const first = text[position];
  const last = text[position + length - 1];
  if (isWordChar(first) && isWordChar(text[position - 1])) return false;
  if (isWordChar(last) && isWordChar(text[position + length])) return false;
  return true;
}

/** Bir glob kalıbını düzenli ifadeye çevirir: ** her derinlik, * ve ? yalnızca bir yol parçası içinde. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slashAfter = glob[i + 2] === '/';
        re += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

/**
 * .iosignore ve .gitignore içeriğini derler. Kurallar (.gitignore'un sık kullanılan alt kümesi):
 *   # yorum, boş satır atlanır
 *   kalıp      "/" içermiyorsa her derinlikte dosya ya da klasör adıyla eşleşir
 *   /kalıp     yalnızca kökten
 *   kalıp/     yalnızca klasör (altındaki her şey)
 *   * ? **     joker karakterler
 *   !kalıp     olumsuzlama: önceki bir kuralla dışlanan yolu geri alır (son eşleşen kural kazanır)
 *   \# \!      satır başındaki # ya da ! harfiyen
 * Git'teki gibi, dışlanmış bir klasörün içindeki dosya olumsuzlamayla geri alınamaz: tarayıcı o
 * klasöre hiç girmez.
 * @param {string} text
 * @returns {{ patterns: string[], ignores: (path: string) => boolean, match: (path: string) => boolean | undefined, matchSelf: (path: string) => boolean | undefined }}
 */
export function compileIgnore(text) {
  const patterns = [];
  /** @type {Array<{ re: RegExp, self: RegExp, negate: boolean }>} */
  const rules = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    let p = line;
    const negate = p.startsWith('!');
    if (negate || p.startsWith('\\!') || p.startsWith('\\#')) p = p.slice(1);
    if (!p) continue;
    patterns.push(line);
    const dirOnly = p.endsWith('/');
    if (dirOnly) p = p.slice(0, -1);
    const anchored = p.startsWith('/') || p.includes('/');
    if (p.startsWith('/')) p = p.slice(1);
    const body = globToRegExp(p);
    const head = `^${anchored ? '' : '(?:.*/)?'}${body}`;
    // re: yolun kendisi ya da altındaki her şey; self: yalnızca yolun kendisi (klasörse "/" ile biter)
    rules.push({ re: new RegExp(`${head}${dirOnly ? '/.*' : '(?:/.*)?'}$`), self: new RegExp(`${head}${dirOnly ? '/' : '/?'}$`), negate });
  }
  /** Son eşleşen kuralın kararı: true dışla, false geri al, undefined hiçbir kural eşleşmedi. */
  const decide = (path, key) => {
    const p = String(path).replace(/\\/g, '/').replace(/^\.\//, '');
    let verdict;
    for (const r of rules) if (r[key].test(p)) verdict = !r.negate;
    return verdict;
  };
  /** @param {string} path */
  const match = (path) => decide(path, 're');
  /**
   * Yalnızca yolun kendisine bakar (git'in ağaç gezerken yaptığı gibi): dışlanan klasörün içine
   * zaten girilmediği için alt yolların ayrıca eşleşmesi gerekmez; açıkça verilen bir hedefin
   * içindekiler de üst klasörün kuralına takılmaz.
   * @param {string} path
   */
  const matchSelf = (path) => decide(path, 'self');
  return { patterns, match, matchSelf, ignores: (path) => match(path) === true };
}

/**
 * Klasörlere bağlı yok sayma katmanları (iç içe .gitignore dosyaları). Her katmanın kalıpları
 * kendi klasörüne göre yorumlanır; yolun bulunduğu klasöre en yakın (en derin) katmanın kararı
 * üsttekileri ezer. Katmanlar kökten derine sıralı verilir. Klasörler çocuklarından önce
 * sorulur (ağaç gezme sırası); her yol yalnızca kendisiyle eşleştirilir (matchSelf).
 * @param {Array<{ base: string, rules: { matchSelf: (path: string) => boolean | undefined } }>} layers
 *   base: kökten klasör yolu, "/" ile biter ("" kök)
 * @param {string} path  kökten yol (klasörse "/" ile biter)
 */
export function layeredIgnores(layers, path) {
  const p = String(path).replace(/\\/g, '/').replace(/^\.\//, '');
  let verdict;
  for (const { base, rules } of layers) {
    if (!p.startsWith(base)) continue;
    const v = rules.matchSelf(p.slice(base.length));
    if (v !== undefined) verdict = v;
  }
  return verdict === true;
}

/**
 * En uzun eşleşme süzgeci (aho-corasick kütüphanesindeki "leftmost-longest" anlamı): her kayıtta
 * soldan başlanır; aynı konumda başlayan eşleşmelerden en uzunu alınır (eşitse listede önce
 * gelen), onunla örtüşen sonraki eşleşmeler atlanır. İç içe desenlerde ("pass", "password")
 * tek bulgu kalır. Girdi kayıt içinde konuma göre sıralı olmalı (atomların çıktısı öyledir).
 * @template {{ position: number, length: number }} T
 * @param {Iterable<T>} items
 * @param {(x: T) => string} keyOf  kayıt (dosya) anahtarı
 * @returns {Generator<T>}
 */
export function* leftmostLongest(items, keyOf) {
  const end = new Map();
  let group = [];
  function* pick() {
    let best = group[0];
    for (const x of group) if (x.length > best.length) best = x;
    const key = keyOf(best);
    if (best.position >= (end.get(key) ?? 0)) {
      end.set(key, best.position + best.length);
      yield best;
    }
  }
  for (const x of items) {
    if (group.length && (keyOf(x) !== keyOf(group[0]) || x.position !== group[0].position)) {
      yield* pick();
      group = [];
    }
    group.push(x);
  }
  if (group.length) yield* pick();
}
