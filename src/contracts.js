// Rol arayüzleri (Arayüz Ayırma İlkesi, ISP): bir bileşen yalnızca kullandığı küçük rolleri üstlenir.
//
// JavaScript'te "interface" anahtar sözcüğü yoktur; arayüzler burada iki biçimde tanımlanır:
//   1. JSDoc türleri (@typedef): TypeScript denetleyicisi (tsc --checkJs) derleme anında denetler.
//      Nesne tarafı @implements ile bağlanır (ExactSearchAtom: SearcherInstance, ExactMatch:
//      MoleculeInstance; molekül atomu çağırır ama kendisi atom değildir, girdisi bir kayıt akışıdır).
//      Sınıfın statik tarafı (manifest, selection) türlü listelerle bağlanır: registry.js'teki
//      BUILTIN bir AtomClass[] dizisidir, catalog.js'teki kutu listesi WorkflowComponent[]'tir.
//      tests/types/roller.js'teki negatif kontroller, bozuk bir bileşenin gerçekten derleme
//      hatası verdiğini gösterir.
//   2. Çalışma anı tanımları (ROLES): kayıt defteri ve katalog bir bileşeni kabul ederken hangi
//      rolleri üstlendiğine bakar, eksik üyeyi adıyla söyler (hızlı hata, fail fast). Dışarıdan
//      çalışma anında eklenen bileşen (registry.register) yalnızca bu yolla denetlenebilir.
//
// Roller ve onları KULLANAN taraflar:
//   Describable        manifest (ad, sürüm, tür, görev, başlık, kaynaklar)  → ios list, atölye, kayıt defteri
//   Searcher           process(entry) → eşleşmeler                         → molekül, atölye atom kutusu
//   SelectionProvider  selection.features / defaults / applicable?          → yalnızca molekülün "auto" seçimi
//   WorkflowComponent  tür, kategori, uçlar, ayarlar, run()                 → iş akışı motoru
// Örnek: NaiveSearch (test referansı) Describable + Searcher'dır ama SelectionProvider değildir;
// kayıt defterine girer ve adıyla çalıştırılır, molekül onu "auto" kipinde aday saymaz. Seçim
// bilgisi yazmak zorunda kalmaz (ISP: kullanmadığı bir arayüze bağımlı olmaz).

// ---------------------------------------------------------------------------- atom ve molekül türleri
/**
 * @typedef {object} Manifest
 * @property {string} name          ör. "HorspoolSearch"
 * @property {string} version       ör. "0.1.0"
 * @property {string} kind          "atom" ya da "molecule"
 * @property {string} task          "sequence.pattern-match.exact"
 * @property {string} title
 * @property {string[]} references
 *
 * @typedef {{ header: string, seq: string }} FastaEntry
 * @typedef {{ header: string, pattern: string, position: number, length: number }} SequenceMatch
 * @typedef {{ patterns: string[], ignoreCase?: boolean }} SearchParams
 *
 * @typedef {object} Shape   girdinin şekli (src/shape.js)
 * @property {number} n
 * @property {number} sigma
 * @property {number} sigmaEff
 * @property {number} k
 * @property {number} mMin
 * @property {number} mMax
 * @property {number} mMean
 *
 * @typedef {object} Selection
 * @property {(shape: Shape, params?: SearchParams) => Record<string, number>} features  maliyet modelinin özellikleri
 * @property {Record<string, number>} defaults                                       kalibrasyon yoksa katsayılar
 * @property {(shape: Shape) => boolean | string} [applicable]                       uygun değilse neden
 *
 * @typedef {{ manifest: Manifest }} Describable
 * @typedef {{ process(entry: FastaEntry): Iterable<SequenceMatch> }} SearcherInstance   nesne tarafı (@implements)
 * @typedef {{ prototype: SearcherInstance }} Searcher
 * @typedef {{ selection: Selection }} SelectionProvider
 * @typedef {(new (params: SearchParams) => SearcherInstance) & { manifest: Manifest, selection?: Selection | null }} AtomClass
 *
 * @typedef {object} DecisionRecord   molekülün karar kaydı (em.record)
 * @property {string} requested       istenen strateji ("auto" ya da atom adı)
 * @property {string | null} selected seçilen atom (ilk kayıt okunana dek null)
 * @property {string} why             seçimin gerekçesi
 * @typedef {{ run(entries: Iterable<FastaEntry>): Iterable<SequenceMatch>, record: DecisionRecord }} MoleculeInstance   molekülün nesne tarafı (@implements)
 * @typedef {(new (params: SearchParams & { strategy?: string }, options?: object) => MoleculeInstance) & Describable} MoleculeClass
 */

// ---------------------------------------------------------------------------- iş akışı türleri
/**
 * @typedef {object} Port
 * @property {string} name
 * @property {string} type            Source.File | FASTA.Entry | Pattern.Set | Sequence.Match | Finding
 * @property {string} [label]
 * @property {boolean} [multi]        birden çok bağlantı alır
 * @property {boolean} [optional]     bağlanmasa da çalışır
 *
 * @typedef {object} Param
 * @property {string} key
 * @property {string} label
 * @property {'text' | 'textarea' | 'bool' | 'select' | 'files'} kind
 * @property {any} [default]
 * @property {Array<{ value: string, label: string }>} [options]
 * @property {boolean} [upload]
 *
 * @typedef {object} RunContext
 * @property {() => number} [now]
 * @property {(name: string) => Promise<Array<{ path: string, text: string }>>} [loadSample]
 * @property {(id: string, state: object) => void} [onNode]
 * @property {number} [yieldEvery]
 * @property {Record<string, any>} [info]    bileşenin çalıştırma bilgisi (özet, sayaçlar, karar kaydı)
 * @property {WorkflowNode} [node]
 *
 * @typedef {object} WorkflowComponent
 * @property {string} type
 * @property {string} category
 * @property {string} title
 * @property {Port[]} inputs
 * @property {Port[]} outputs
 * @property {Param[]} [params]
 * @property {(inputs: Record<string, any>, params: Record<string, any>, ctx: RunContext) => Record<string, any> | Promise<Record<string, any>>} run
 * @property {(params: Record<string, any>) => string} [describe]
 * @property {string} [subtitle]
 * @property {string} [icon]
 * @property {string} [badge]
 * @property {string} [help]
 * @property {string} [idPrefix]
 * @property {Manifest} [manifest]
 * @property {boolean} [auto]
 * @property {string} [presetName]
 *
 * @typedef {Map<string, WorkflowComponent> & { categories: string[] }} Catalog
 * @typedef {{ id: string, type: string, x: number, y: number, params: Record<string, any> }} WorkflowNode
 * @typedef {{ from: { node: string, port: string }, to: { node: string, port: string } }} Edge
 * @typedef {{ name: string, target: string, nodes: WorkflowNode[], edges: Edge[] }} Workflow
 */

// ---------------------------------------------------------------------------- çalışma anı denetimi
const isStr = (v) => typeof v === 'string' && v !== '';
const isFn = (v) => typeof v === 'function';
const isObj = (v) => v !== null && typeof v === 'object';
const portsOk = (list) => Array.isArray(list) && list.every((p) => isObj(p) && isStr(p.name) && isStr(p.type));

/**
 * Her rol, hedefteki eksik ya da hatalı üyeleri Türkçe cümlelerle döndüren bir denetimdir.
 * @type {Record<string, { description: string, problems: (target: any) => string[] }>}
 */
export const ROLES = {
  Describable: {
    description: 'static manifest: { name, version, kind, task, title, references[] }',
    problems(A) {
      const m = A?.manifest;
      if (!isObj(m)) return ['manifest alanı yok'];
      const out = [];
      if (!isStr(m.name)) out.push('manifest.name alanı olmalı');
      if (!isStr(m.version)) out.push('manifest.version alanı olmalı');
      if (m.kind !== 'atom' && m.kind !== 'molecule') out.push('manifest.kind "atom" ya da "molecule" olmalı');
      if (!isStr(m.task)) out.push('manifest.task alanı olmalı');
      if (!isStr(m.title)) out.push('manifest.title alanı olmalı');
      if (!Array.isArray(m.references)) out.push('manifest.references bir dizi olmalı');
      return out;
    },
  },
  Searcher: {
    description: 'process(entry) yöntemi: FASTA.Entry → Sequence.Match akışı',
    problems: (A) => (isFn(A?.prototype?.process) ? [] : ['process() yöntemi yok']),
  },
  SelectionProvider: {
    description: 'static selection: { features(shape), defaults, applicable?(shape) } (molekülün "auto" seçimi için)',
    problems(A) {
      const s = A?.selection;
      if (!isObj(s)) return ['selection alanı yok'];
      const out = [];
      if (!isFn(s.features)) out.push('selection.features bir işlev olmalı');
      if (!isObj(s.defaults)) out.push('selection.defaults bir nesne olmalı');
      if (s.applicable !== undefined && !isFn(s.applicable)) out.push('selection.applicable bir işlev olmalı');
      return out;
    },
  },
  WorkflowComponent: {
    description: 'iş akışı kutusu: { type, category, title, inputs[], outputs[], params[]?, run(), describe()? }',
    problems(c) {
      if (!isObj(c)) return ['bileşen bir nesne olmalı'];
      const out = [];
      if (!isStr(c.type)) out.push('type alanı olmalı');
      if (!isStr(c.category)) out.push('category alanı olmalı');
      if (!isStr(c.title)) out.push('title alanı olmalı');
      if (!portsOk(c.inputs)) out.push('inputs bir uç dizisi olmalı ({ name, type })');
      if (!portsOk(c.outputs)) out.push('outputs bir uç dizisi olmalı ({ name, type })');
      if (c.params !== undefined && !(Array.isArray(c.params) && c.params.every((p) => isObj(p) && isStr(p.key) && isStr(p.kind)))) out.push('params bir ayar dizisi olmalı ({ key, kind })');
      if (!isFn(c.run)) out.push('run() işlevi yok');
      if (c.describe !== undefined && !isFn(c.describe)) out.push('describe bir işlev olmalı');
      return out;
    },
  },
};

/** Hedef bu rolü (eksiksiz) üstleniyor mu? */
export function implementsRole(target, role) {
  const r = ROLES[role];
  if (!r) throw new Error(`Bilinmeyen rol: ${role}`);
  return r.problems(target).length === 0;
}

/**
 * Hedef verilen rollerin hepsini üstlenmiyorsa eksikleri sayan bir TypeError fırlatır.
 * @param {any} target
 * @param {string[]} roles
 * @param {string} label   hata iletisinde hedefin adı
 */
export function assertRoles(target, roles, label) {
  const problems = roles.flatMap((role) => ROLES[role].problems(target).map((p) => `${role}: ${p}`));
  if (problems.length) throw new TypeError(`${label}: ${problems.join('; ')}`);
}
