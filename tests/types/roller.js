// Tür düzeyinde kontroller: rol arayüzleri (src/contracts.js) derleme anında zorunlu mu?
// Bu dosya çalıştırılmaz; yalnızca tür denetleyicisi okur (npm run tur-denetimi).
//
// Olumlu kontroller: yerleşik bileşenler rollerini üstlenir, hata beklenmez.
// Olumsuz (negatif) kontroller: her bozuk örneğin üstündeki "@ts-expect-error" yönergesi, tsc'nin
// o satırda hata vermesini İSTER. Tür denetimi gevşerse (ör. AtomClass türünden manifest
// çıkarılırsa) hata kalkar ve tsc bu kez "kullanılmayan @ts-expect-error" (TS2578) diye kalır.
// Yani bu dosya tür denetiminin kendisini sınar; yasaklı işlev taramasının kötü örneklerle
// sınanmasına benzer. Olumsuz kontrollerin sayısını npm run tur-denetimi raporlar.

import { BUILTIN } from '../../src/registry.js';
import { ExactMatch } from '../../src/molecules/ExactMatch.js';
import { ExactSearchAtom, TASK } from '../../src/atomic/ExactSearchAtom.js';
import { createCatalog } from '../../src/workflows/catalog.js';

/** @typedef {import('../../src/contracts.js').AtomClass} AtomClass */
/** @typedef {import('../../src/contracts.js').MoleculeClass} MoleculeClass */
/** @typedef {import('../../src/contracts.js').SearcherInstance} SearcherInstance */
/** @typedef {import('../../src/contracts.js').WorkflowComponent} WorkflowComponent */

// ------------------------------------------------------------------------------ olumlu
/** @type {AtomClass[]} */
export const atomlar = BUILTIN;
/** @type {MoleculeClass} */
export const molekul = ExactMatch;
/** @type {WorkflowComponent[]} */
export const kutular = [...createCatalog().values()];

// ------------------------------------------------------------------------------ olumsuz: atom
const manifest = { name: 'Bozuk', version: '0.0.0', kind: 'atom', task: TASK, title: 'Bozuk atom', references: [] };

/** process() yöntemi var, manifest yok. */
export class ManifestsizAtom { *process() { /* bulgu yok */ } }
/** manifest var, process() yöntemi yok. */
export class AramasizAtom { static manifest = manifest; }

// @ts-expect-error  Describable eksik: manifest alanı yok
/** @type {AtomClass} */ export const a1 = ManifestsizAtom;
// @ts-expect-error  Searcher eksik: process() yöntemi yok
/** @type {AtomClass} */ export const a2 = AramasizAtom;
// @ts-expect-error  kayıt defterinin yerleşik listesine sözleşmeye uymayan sınıf eklenemez
/** @type {AtomClass[]} */ export const a3 = [...BUILTIN, AramasizAtom];
// @ts-expect-error  manifest'te title yerine yazım hatası (titel): alt sınıfın statik tarafı uymuyor
export class YanlisManifest extends ExactSearchAtom { static manifest = { name: 'X', version: '0', kind: 'atom', task: TASK, titel: 'X', references: [] }; }
// @ts-expect-error  SelectionProvider bozuk: features bir işlev değil
export class YanlisSecim extends ExactSearchAtom { static selection = { features: { n: 1 }, defaults: {} }; }
// @ts-expect-error  @implements SearcherInstance diyen ama process() yazmayan sınıf
/** @implements {SearcherInstance} */ export class SozVerenAtom { arama() { return []; } }

// ------------------------------------------------------------------------------ olumsuz: molekül
// @ts-expect-error  molekül de Describable olmalı (manifest yok)
/** @type {MoleculeClass} */ export const m1 = ManifestsizAtom;
// @ts-expect-error  molekülün girdisi kayıt akışıdır: run(entries) yöntemi yok
/** @type {MoleculeClass} */ export const m2 = AramasizAtom;

// ------------------------------------------------------------------------------ olumsuz: iş akışı kutusu
const uc = { name: 'x', type: 'Finding' };
// @ts-expect-error  WorkflowComponent eksik: run() yok
/** @type {WorkflowComponent} */ export const k1 = { type: 'k', category: 'ÇIKTILAR', title: 'K', inputs: [uc], outputs: [] };
// @ts-expect-error  uçlar { name, type } nesneleri olmalı, dizgi değil
/** @type {WorkflowComponent} */ export const k2 = { type: 'k', category: 'ÇIKTILAR', title: 'K', inputs: ['findings'], outputs: [], run: () => ({}) };
// @ts-expect-error  ayarın türü (kind) tanımlı türlerden biri olmalı
/** @type {WorkflowComponent} */ export const k3 = { type: 'k', category: 'ÇIKTILAR', title: 'K', inputs: [], outputs: [], params: [{ key: 'a', label: 'A', kind: 'renk' }], run: () => ({}) };
