// Kayıt defteri (registry): molekülün tanıdığı atomların listesi.
//
// Açık/Kapalı ilkesi: Yeni bir atom eklemek için ExactMatch'e dokunulmaz.
// Atom dosyası yazılır ve ya aşağıdaki BUILTIN listesine eklenir ya da çalışma
// anında registry.register(YeniAtom) çağrılır. Molekül atomları adlarıyla
// yalnızca buradan tanır.

import { TASK } from './atomic/ExactSearchAtom.js';
import { assertRoles, implementsRole } from './contracts.js';
import { NaiveSearch } from './atomic/NaiveSearch.js';
import { BoyerMooreSearch } from './atomic/BoyerMooreSearch.js';
import { HorspoolSearch } from './atomic/HorspoolSearch.js';
import { ShiftOrSearch } from './atomic/ShiftOrSearch.js';
import { KmpSearch } from './atomic/KmpSearch.js';
import { AhoCorasickSearch } from './atomic/AhoCorasickSearch.js';
import { WuManberSearch } from './atomic/WuManberSearch.js';
import { Bm4DnaDsSearch } from './atomic/Bm4DnaDsSearch.js';
import { Bm4DnaHmbsSearch } from './atomic/Bm4DnaHmbsSearch.js';

export const BUILTIN = [
  NaiveSearch, BoyerMooreSearch, HorspoolSearch, ShiftOrSearch, KmpSearch,
  AhoCorasickSearch, WuManberSearch, Bm4DnaDsSearch, Bm4DnaHmbsSearch,
];

export class Registry {
  #atoms = new Map();

  /**
   * Bir atom sınıfını ekler. Atom en az iki rolü üstlenmeli: Describable (manifest) ve Searcher
   * (process). Seçim bilgisi (SelectionProvider) isteğe bağlıdır; verildiyse eksiksiz olmalı.
   * Sözleşmeye uymayan sınıf, eksik üyeleri adıyla sayılarak reddedilir (src/contracts.js).
   * @param {any} Atom  bir atom sınıfı (rolleri çalışma anında denetlenir)
   */
  register(Atom) {
    const label = typeof Atom?.manifest?.name === 'string' && Atom.manifest.name ? Atom.manifest.name : 'Atom';
    assertRoles(Atom, ['Describable', 'Searcher'], label);
    const m = Atom.manifest;
    if (m.kind !== 'atom') throw new TypeError(`${m.name}: manifest.kind "atom" olmalı`);
    if (m.task !== TASK) throw new TypeError(`${m.name}: manifest.task "${TASK}" olmalı`);
    if (Atom.selection !== null && Atom.selection !== undefined) assertRoles(Atom, ['SelectionProvider'], m.name);
    if (this.#atoms.has(m.name)) throw new Error(`${m.name} zaten kayıtlı`);
    this.#atoms.set(m.name, Atom);
    return this;
  }

  unregister(name) {
    return this.#atoms.delete(name);
  }

  has(name) {
    return this.#atoms.has(name);
  }

  get(name) {
    return this.#atoms.get(name);
  }

  /** Kayıtlı bütün atom adları, kayıt sırasıyla. */
  names() {
    return [...this.#atoms.keys()];
  }

  /** "auto" kipinde aday olan atomlar: SelectionProvider rolünü üstlenenler. */
  candidates() {
    return [...this.#atoms.values()].filter((A) => implementsRole(A, 'SelectionProvider'));
  }

  /** Aynı atomlarla yeni bir kayıt defteri (testlerde güvenle değiştirmek için). */
  clone() {
    const r = new Registry();
    for (const A of this.#atoms.values()) r.register(A);
    return r;
  }
}

export function createDefaultRegistry() {
  const r = new Registry();
  for (const A of BUILTIN) r.register(A);
  return r;
}

/** Varsayılan, paylaşılan kayıt defteri. */
export const registry = createDefaultRegistry();
