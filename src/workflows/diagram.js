// İş akışını diyagram metnine çevirir: Mermaid (GitHub, GitLab ve birçok belge aracı
// Markdown içinde doğrudan çizer) ve Graphviz DOT. Snakemake'in --dag ve Nextflow'un
// -with-dag seçenekleri aynı işi bilimsel iş akışları için yapar.
// DOM'suzdur; tarayıcıda "Diyagram" düğmesi ve README'deki örnekler bu modülü kullanır.

/**
 * @typedef {import('./engine.js').Workflow} Workflow
 * @typedef {import('./engine.js').Catalog} Catalog
 */

const CLASS = {
  KAYNAKLAR: 'kaynak',
  UYARLAYICILAR: 'uyarlayici',
  'DESEN KÜMELERİ': 'desen',
  ATOMLAR: 'atom',
  'MOLEKÜL': 'molekul',
  'ÇIKTILAR': 'cikti',
};
const COLORS = {
  kaynak: '#e8f1fb,#2f6fb0', uyarlayici: '#eef6ec,#3f8a3a', desen: '#fdf3e1,#b7791f',
  atom: '#f3ecfa,#7b4bb3', molekul: '#fbe9ef,#b23a62', cikti: '#eaf6f6,#23807a', diger: '#f2f2f2,#666666',
};

/** Mermaid kimliği: yalnızca harf, rakam ve alt çizgi; benzersiz. */
function idMaker() {
  const used = new Map();
  return (raw) => {
    if (used.has(raw)) return used.get(raw);
    let id = 'n_' + String(raw).replace(/[^A-Za-z0-9_]/g, '_');
    while ([...used.values()].includes(id)) id += '_';
    used.set(raw, id);
    return id;
  };
}

const mermaidText = (s) => String(s).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');

/**
 * @param {Workflow} wf
 * @param {Catalog} catalog
 * @param {{ direction?: 'LR' | 'TD' }} [options]
 * @returns {string} Mermaid "flowchart" metni
 */
export function toMermaid(wf, catalog, { direction = 'LR' } = {}) {
  const id = idMaker();
  const lines = [`flowchart ${direction}`];
  const usedClasses = new Set();
  for (const n of wf.nodes) {
    const comp = catalog.get(n.type);
    const title = comp ? comp.title : n.type;
    const cat = comp ? comp.category : 'bilinmeyen';
    const cls = CLASS[cat] ?? 'diger';
    usedClasses.add(cls);
    lines.push(`  ${id(n.id)}["${mermaidText(`${comp?.icon ?? '•'} ${title}`)}<br/><small>${mermaidText(`${cat} · ${n.id}`)}</small>"]:::${cls}`);
  }
  for (const e of wf.edges) {
    const from = wf.nodes.find((n) => n.id === e.from.node);
    const type = from && catalog.get(from.type)?.outputs.find((p) => p.name === e.from.port)?.type;
    lines.push(`  ${id(e.from.node)} -->|${mermaidText(type ?? e.from.port)}| ${id(e.to.node)}`);
  }
  for (const cls of usedClasses) {
    const [fill, stroke] = COLORS[cls].split(',');
    lines.push(`  classDef ${cls} fill:${fill},stroke:${stroke},color:#1b1b1b`);
  }
  return lines.join('\n') + '\n';
}

const dotText = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * @param {Workflow} wf
 * @param {Catalog} catalog
 * @returns {string} Graphviz DOT metni
 */
export function toDot(wf, catalog) {
  const lines = [`digraph "${dotText(wf.name || 'is-akisi')}" {`, '  rankdir=LR;', '  node [shape=box, style="rounded,filled", fontname="Helvetica"];'];
  for (const n of wf.nodes) {
    const comp = catalog.get(n.type);
    const cls = CLASS[comp?.category] ?? 'diger';
    const [fill, stroke] = COLORS[cls].split(',');
    lines.push(`  "${dotText(n.id)}" [label="${dotText(comp ? comp.title : n.type)}\\n${dotText(comp ? comp.category : 'bilinmeyen')}", fillcolor="${fill}", color="${stroke}"];`);
  }
  for (const e of wf.edges) {
    const from = wf.nodes.find((n) => n.id === e.from.node);
    const type = from && catalog.get(from.type)?.outputs.find((p) => p.name === e.from.port)?.type;
    lines.push(`  "${dotText(e.from.node)}" -> "${dotText(e.to.node)}" [label="${dotText(type ?? e.from.port)}"];`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}
