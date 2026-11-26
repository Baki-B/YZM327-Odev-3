// CodeScan: ExactMatch molekülünü kaynak kod / log dosyalarında kullanan küçük iş akışı.
//
//   dosyalar ──(sourceToEntry)──▶ FASTA.Entry ──(ExactMatch)──▶ Sequence.Match ──(süzgeçler)──▶ { file, line, column, pattern }
//
// Dosya okuma burada değil, komut satırında (bin/ios.js) yapılır; bu modül saf kalır.
// Süzgeçler (src/scan/filters.js) aramadan sonra uygulanır: satır içi bastırma ("ios:ignore")
// varsayılan olarak açık, tam sözcük kapalıdır. Atölyedeki "Eşleşme → Bulgu" kutusu aynı
// süzgeçleri kullanır; ikisi aynı girdide aynı bulguları verir.

import { ExactMatch } from '../molecules/ExactMatch.js';
import { sourceToEntry, lineStarts, toLineColumn } from '../adapters/sourceToEntry.js';
import { isSuppressed, isWholeWord, leftmostLongest, lineAt } from '../scan/filters.js';
import { ruleForPattern } from '../scan/rules.js';
import { fingerprinter, snippetOf } from '../scan/report.js';

/**
 * @typedef {object} CodeScanOptions
 * @property {boolean} [inlineIgnore]  "ios:ignore" yorumlu satırları atla (varsayılan: evet)
 * @property {boolean} [word]          yalnızca tam sözcük eşleşmeleri (varsayılan: hayır)
 * @property {boolean} [longest]       iç içe desenlerde yalnızca soldaki en uzun eşleşme (varsayılan: hayır)
 * @property {boolean} [details]       bulguya kural, önem, maskeli satır özeti ve parmak izi ekle
 * @property {boolean} [redact]        details açıkken gizli bilgi değerini maskele (varsayılan: evet)
 */

export class CodeScan {
  /**
   * @param {{ patterns: string[], ignoreCase?: boolean, strategy?: string } & CodeScanOptions} params
   * @param {object} [options]  ExactMatch'e geçen seçenekler (registry, coefficients)
   */
  constructor({ patterns, ignoreCase = false, strategy = 'auto', inlineIgnore = true, word = false, longest = false, details = false, redact = true }, options = {}) {
    this.molecule = new ExactMatch({ patterns, ignoreCase, strategy }, options);
    this.filters = { inlineIgnore, word, longest, details, redact };
    this.stats = { suppressed: 0, notWholeWord: 0, notLongest: 0 };
  }

  get record() {
    return this.molecule.record;
  }

  /** sources: { path, text } nesnelerinin akışı. Her (süzgeçten geçen) eşleşme için bir bulgu üretir. */
  *run(sources) {
    const index = new Map(); // header → { path, text, starts }
    const entries = (function* () {
      for (const src of sources) {
        const entry = sourceToEntry(src);
        index.set(entry.header, { path: src.path, text: src.text, starts: lineStarts(src.text) });
        yield entry;
      }
    })();
    const { inlineIgnore, word, longest, details, redact } = this.filters;
    const fingerprint = fingerprinter();
    const stats = this.stats;
    const molecule = this.molecule;
    const accepted = (function* () {
      for (const match of molecule.run(entries)) {
        const file = index.get(match.header);
        const { line, column } = toLineColumn(file.starts, match.position);
        if (word && !isWholeWord(file.text, match.position, match.length)) { stats.notWholeWord++; continue; }
        if (inlineIgnore && isSuppressed(file.text, file.starts, line)) { stats.suppressed++; continue; }
        stats.notLongest++; // en uzun süzgecinden geçen her bulgu aşağıda bir azaltır
        yield { ...match, file, line, column };
      }
    })();
    for (const match of longest ? leftmostLongest(accepted, (m) => m.header) : accepted) {
      stats.notLongest--;
      const { file, line, column } = match;
      const finding = { file: file.path, line, column, pattern: match.pattern, position: match.position };
      if (details) {
        const rule = ruleForPattern(match.pattern);
        const lineText = lineAt(file.text, file.starts, line);
        Object.assign(finding, {
          length: match.length,
          ruleId: rule.id,
          severity: rule.severity,
          snippet: snippetOf(lineText, column, match.length, rule.secret && redact),
        });
        finding.fingerprint = fingerprint(finding, lineText);
      }
      yield finding;
    }
  }
}
