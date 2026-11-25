// Rol arayüzleri (src/contracts.js): Arayüz Ayırma İlkesi. Bir bileşen yalnızca kullandığı rolleri
// üstlenir; kayıt defteri ve katalog eksik üyeyi adıyla söyler.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, implementsRole, assertRoles } from '../../src/contracts.js';
import { registry, Registry, BUILTIN } from '../../src/registry.js';
import { ExactSearchAtom, TASK } from '../../src/atomic/ExactSearchAtom.js';
import { NaiveSearch } from '../../src/atomic/NaiveSearch.js';
import { ExactMatch } from '../../src/molecules/ExactMatch.js';
import { createCatalog } from '../../src/workflows/catalog.js';

/** Yalnızca Describable + Searcher: seçim bilgisi yazmayan en küçük atom. */
class OnlySearch extends ExactSearchAtom {
  static manifest = { name: 'OnlySearch', version: '0.0.1', kind: 'atom', task: TASK, title: 'Exact match (yalnızca arama)', references: [] };
  scanText(text, n, hits) {
    for (let u = 0; u < this.unique.length; u++) {
      const p = this.unique[u];
      for (let i = 0; i + p.length <= n; i++) {
        let j = 0;
        while (j < p.length && text[i + j] === p[j]) j++;
        if (j === p.length) hits.add(u, i);
      }
    }
  }
}

describe('rol arayüzleri', () => {
  test('dört rol tanımlı ve her birinin açıklaması var', () => {
    assert.deepEqual(Object.keys(ROLES), ['Describable', 'Searcher', 'SelectionProvider', 'WorkflowComponent']);
    for (const r of Object.values(ROLES)) assert.ok(r.description.length > 10);
    assert.throws(() => implementsRole({}, 'Yok'), /Bilinmeyen rol/);
  });
  test('yerleşik atomlar: hepsi Describable + Searcher; NaiveSearch dışındakiler SelectionProvider', () => {
    for (const A of BUILTIN) {
      assert.ok(implementsRole(A, 'Describable'), A.name);
      assert.ok(implementsRole(A, 'Searcher'), A.name);
      assert.equal(implementsRole(A, 'SelectionProvider'), A !== NaiveSearch, A.name);
    }
    assert.deepEqual(registry.candidates().map((A) => A.manifest.name), BUILTIN.filter((A) => A !== NaiveSearch).map((A) => A.manifest.name));
  });
  test('molekül Describable rolünü (kind: molecule) üstlenir; atom rollerine bağımlı değildir', () => {
    assert.ok(implementsRole(ExactMatch, 'Describable'));
    assert.equal(ExactMatch.manifest.kind, 'molecule');
    assert.equal(implementsRole(ExactMatch, 'SelectionProvider'), false);
  });
  test('yalnızca iki rolü üstlenen atom kaydolur ve adıyla çalışır, "auto" adayı olmaz', () => {
    const reg = new Registry().register(HorspoolLike()).register(OnlySearch);
    assert.deepEqual(reg.candidates().map((A) => A.manifest.name), ['HorspoolLike']);
    const em = new ExactMatch({ patterns: ['AC'], strategy: 'OnlySearch' }, { registry: reg });
    const out = [...em.run([{ header: '>x', seq: 'GACAC' }])];
    assert.deepEqual(out.map((m) => m.position), [1, 3]);
    assert.equal(em.record.selected, 'OnlySearch');
    assert.ok(!('OnlySearch' in em.record.estimates), 'seçim bilgisi olmayan atom tahmin edilmez');
  });
  test('eksik üyeler rol adıyla birlikte söylenir', () => {
    assert.throws(() => new Registry().register(class {}), /Atom: Describable: manifest alanı yok; Searcher: process\(\) yöntemi yok/);
    class NoFeatures extends OnlySearch {
      static manifest = { ...OnlySearch.manifest, name: 'NoFeatures' };
      static selection = { defaults: {}, applicable: 3 };
    }
    assert.throws(() => new Registry().register(NoFeatures), /NoFeatures: SelectionProvider: selection\.features bir işlev olmalı; SelectionProvider: selection\.applicable bir işlev olmalı/);
    // @ts-expect-error: bilerek eksik manifest (sınıfın durağan tarafı taban sınıfla uyuşmaz)
    class BadManifest extends OnlySearch { static manifest = { name: 'BadManifest', kind: 'atom' }; }
    assert.throws(() => new Registry().register(BadManifest), /manifest\.version alanı olmalı.*manifest\.task alanı olmalı.*manifest\.title.*manifest\.references/);
  });
  test('her katalog kutusu WorkflowComponent rolünü üstlenir; bozuk kutu reddedilir', () => {
    for (const c of createCatalog().values()) assert.ok(implementsRole(c, 'WorkflowComponent'), c.type);
    assert.throws(() => assertRoles({ type: 'x', category: 'X', title: 'x', inputs: [{ name: 'a' }], outputs: [], params: [{ key: 'k' }], describe: 'metin' }, ['WorkflowComponent'], 'x'),
      /inputs bir uç dizisi olmalı.*params bir ayar dizisi olmalı.*run\(\) işlevi yok.*describe bir işlev olmalı/);
    assert.throws(() => assertRoles(null, ['WorkflowComponent'], 'boş'), /bileşen bir nesne olmalı/);
  });
});

/** Seçim bilgisi olan küçük bir atom (Horspool'un yerine geçebilecek sahte bir aday). */
function HorspoolLike() {
  return class HorspoolLike extends OnlySearch {
    static manifest = { ...OnlySearch.manifest, name: 'HorspoolLike' };
    static selection = { features: () => ({ base: 1 }), defaults: { base: 1e-9 } };
  };
}
