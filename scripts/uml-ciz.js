// UML diyagramlarını bağımlılıksız SVG olarak çizer: docs/uml/svg/*.svg
// Aynı diyagramların PlantUML kaynakları docs/uml/*.puml dosyalarındadır (PlantUML kuruluysa
// `java -jar plantuml.jar -charset UTF-8 -tsvg docs/uml/*.puml` ile de üretilebilir). Bu ortamda
// PlantUML kurulamadığı için çizim bu betikle yapılır; içerik iki tarafta aynıdır.
// --pdf verilirse bütün diyagramlar docs/uml/UML_Diyagramlari.pdf dosyasında toplanır (Playwright gerekir).
// Kullanım (proje kökünden): node scripts/uml-ciz.js [--pdf]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../docs/uml/svg/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ görünüm
const C = {
  ink: '#241a26', ink2: '#5a5160', line: '#4c2a4a', soft: '#faf7fa', head: '#efe3ee', accent: '#127c86',
  ucFill: '#e6f4f5', ucLine: '#127c86', note: '#fff6dc', noteLine: '#c9b37a', frame: '#9a8f9c', life: '#a49aa6', act: '#e9e0ea',
};
const FONT = 'font-family="Inter, Segoe UI, DejaVu Sans, Helvetica, Arial, sans-serif"';
const MONO = 'font-family="JetBrains Mono, DejaVu Sans Mono, Consolas, monospace"';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function text(x, y, s, { size = 13, weight = 400, anchor = 'start', fill = C.ink, italic = false, mono = false, underline = false } = {}) {
  return `<text x="${x}" y="${y}" ${mono ? MONO : FONT} font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${italic ? ' font-style="italic"' : ''}${underline ? ' text-decoration="underline"' : ''}>${esc(s)}</text>`;
}

function svg(name, w, h, title, body) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  <marker id="tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="13" markerHeight="13" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 Z" fill="#fff" stroke="${C.line}" stroke-width="1.2"/></marker>
  <marker id="open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11" fill="none" stroke="${C.line}" stroke-width="1.4"/></marker>
  <marker id="solid" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 Z" fill="${C.line}"/></marker>
  <marker id="dia" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse"><path d="M1 5 L8 1 L15 5 L8 9 Z" fill="#fff" stroke="${C.line}" stroke-width="1.2"/></marker>
  <marker id="diaf" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse"><path d="M1 5 L8 1 L15 5 L8 9 Z" fill="${C.line}"/></marker>
</defs>
<rect width="${w}" height="${h}" fill="#ffffff"/>
${text(16, 26, title, { size: 15, weight: 700 })}
${body}
</svg>
`;
  writeFileSync(new URL(`${name}.svg`, OUT), doc);
  return name;
}

/** Çizgi; kind: inherit (içi boş üçgen), realize (kesikli + içi boş üçgen: arayüzü gerçekleştirir), dep (kesikli açık ok), assoc (düz açık ok), aggr / comp (baklava başta), plain. */
function edge(points, { kind = 'assoc', label = '', lx = null, ly = null, startLabel = '', endLabel = '' } = {}) {
  const d = 'M ' + points.map((p) => p.join(' ')).join(' L ');
  const dashed = kind === 'dep' || kind === 'include' || kind === 'realize';
  const end = kind === 'inherit' || kind === 'realize' ? 'tri' : kind === 'plain' || kind === 'aggr' || kind === 'comp' ? null : 'open';
  const start = kind === 'aggr' ? 'dia' : kind === 'comp' ? 'diaf' : null;
  let s = `<path d="${d}" fill="none" stroke="${C.line}" stroke-width="1.3"${dashed ? ' stroke-dasharray="6 4"' : ''}${end ? ` marker-end="url(#${end})"` : ''}${start ? ` marker-start="url(#${start})"` : ''}/>`;
  if (label) {
    const a = points[Math.floor((points.length - 1) / 2)], b = points[Math.floor((points.length - 1) / 2) + 1];
    s += text(lx ?? (a[0] + b[0]) / 2 + 4, ly ?? (a[1] + b[1]) / 2 - 5, label, { size: 11.5, fill: C.ink2, anchor: lx === null ? 'middle' : 'start' });
  }
  if (startLabel) s += text(points[0][0] + 6, points[0][1] - 6, startLabel, { size: 11.5, fill: C.ink2 });
  if (endLabel) {
    const p = points[points.length - 1], q = points[points.length - 2];
    const dx = Math.sign(p[0] - q[0]), dy = Math.sign(p[1] - q[1]);
    s += text(p[0] - dx * 16 + (dy ? 8 : 0), p[1] - dy * 12 + (dx ? -6 : 4), endLabel, { size: 11.5, fill: C.ink2, anchor: dx > 0 ? 'end' : 'start' });
  }
  return s;
}

/** Sınıf kutusu: { x, y, w, name, stereo, abstract, attrs, ops }. Geometri döndürür. */
function classBox(o) {
  const lh = 15.5;
  const headH = o.stereo ? 40 : 28;
  const attrs = o.attrs ?? [];
  const ops = o.ops ?? [];
  const h = headH + (attrs.length ? attrs.length * lh + 10 : 8) + (ops.length ? ops.length * lh + 10 : 8);
  let s = `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${h}" rx="6" fill="${C.soft}" stroke="${C.line}" stroke-width="1.3"/>`;
  s += `<path d="M ${o.x} ${o.y + headH} L ${o.x + o.w} ${o.y + headH}" stroke="${C.line}" stroke-width="1"/>`;
  s += `<rect x="${o.x + 0.65}" y="${o.y + 0.65}" width="${o.w - 1.3}" height="${headH - 1.3}" rx="6" fill="${C.head}"/>`;
  const cx = o.x + o.w / 2;
  if (o.stereo) s += text(cx, o.y + 16, `«${o.stereo}»`, { size: 11, anchor: 'middle', fill: C.ink2 });
  s += text(cx, o.y + headH - 10, o.name, { size: 13.5, weight: 700, anchor: 'middle', italic: Boolean(o.abstract) });
  let y = o.y + headH;
  y += attrs.length ? 4 : 0;
  for (const a of attrs) { y += lh; s += text(o.x + 9, y - 3, a, { size: 11.5, mono: true, underline: a.includes('{static}') }); }
  y += attrs.length ? 6 : 8;
  s += `<path d="M ${o.x} ${y} L ${o.x + o.w} ${y}" stroke="${C.line}" stroke-width="1"/>`;
  y += ops.length ? 4 : 0;
  for (const a of ops) { y += lh; s += text(o.x + 9, y - 3, a, { size: 11.5, mono: true, italic: a.includes('{abstract}') }); }
  const g = { x: o.x, y: o.y, w: o.w, h, cx, cy: o.y + h / 2, top: o.y, bottom: o.y + h, left: o.x, right: o.x + o.w, svg: s };
  return g;
}

function note(x, y, w, lines) {
  const h = 12 + lines.length * 15;
  let s = `<path d="M ${x} ${y} L ${x + w - 12} ${y} L ${x + w} ${y + 12} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="${C.note}" stroke="${C.noteLine}"/>`;
  s += `<path d="M ${x + w - 12} ${y} L ${x + w - 12} ${y + 12} L ${x + w} ${y + 12}" fill="none" stroke="${C.noteLine}"/>`;
  lines.forEach((l, i) => (s += text(x + 8, y + 18 + i * 15, l, { size: 11.5, fill: C.ink2 })));
  return s;
}

function actor(x, y, label) {
  return `<g stroke="${C.line}" stroke-width="1.6" fill="none"><circle cx="${x}" cy="${y - 34}" r="9" fill="#fff"/><path d="M ${x} ${y - 25} L ${x} ${y} M ${x - 15} ${y - 16} L ${x + 15} ${y - 16} M ${x} ${y} L ${x - 12} ${y + 18} M ${x} ${y} L ${x + 12} ${y + 18}"/></g>` +
    label.split('\n').map((l, i) => text(x, y + 36 + i * 15, l, { size: 12.5, weight: 600, anchor: 'middle' })).join('');
}

function usecase(cx, cy, rx, ry, label) {
  const lines = label.split('\n');
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.ucFill}" stroke="${C.ucLine}" stroke-width="1.3"/>` +
    lines.map((l, i) => text(cx, cy + 4.5 + (i - (lines.length - 1) / 2) * 15, l, { size: 12.5, anchor: 'middle' })).join('');
}
/** Elips kenarında, (tx, ty) yönüne bakan nokta. */
function ellipsePoint(cx, cy, rx, ry, tx, ty) {
  const a = Math.atan2((ty - cy) / ry, (tx - cx) / rx);
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
}

function folder(x, y, w, h, title, lines = [], { stereo = '' } = {}) {
  let s = `<path d="M ${x} ${y + 14} L ${x} ${y} L ${x + Math.min(120, w * 0.5)} ${y} L ${x + Math.min(120, w * 0.5) + 10} ${y + 14} Z" fill="${C.head}" stroke="${C.line}" stroke-width="1.2"/>`;
  s += `<rect x="${x}" y="${y + 14}" width="${w}" height="${h - 14}" fill="${C.soft}" stroke="${C.line}" stroke-width="1.3"/>`;
  if (stereo) s += text(x + w / 2, y + 32, `«${stereo}»`, { size: 11, anchor: 'middle', fill: C.ink2 });
  s += text(x + w / 2, y + (stereo ? 48 : 36), title, { size: 13.5, weight: 700, anchor: 'middle' });
  lines.forEach((l, i) => (s += text(x + 10, y + (stereo ? 68 : 56) + i * 15, l, { size: 11.2, mono: true, fill: C.ink2 })));
  return { svg: s, x, y, w, h, cx: x + w / 2, top: y, bottom: y + h, left: x, right: x + w };
}

// ------------------------------------------------------------------ sıralı diyagram yardımcıları
function sequence(name, title, width, parts, steps) {
  // parts: [{ id, label, x, kind: 'actor'|'box' }]; steps: [{ from, to, label, ret, self, frame, else, end, gap }]
  const X = Object.fromEntries(parts.map((p) => [p.id, p.x]));
  let y = parts.some((p) => p.kind === 'actor') ? 140 : 118;
  let body = '';
  /** @type {any[]} */
  const frames = [];
  let n = 0;
  const msgs = [];
  for (const st of steps) {
    if (st.frame) { frames.push({ kind: st.frame, guard: st.guard, y0: y - 6, elses: [], x0: st.x0 ?? 30, x1: st.x1 ?? width - 30 }); y += 34; continue; }
    if (st.else) { frames.at(-1).elses.push({ y: y - 4, guard: st.else }); y += 34; continue; }
    if (st.end) { const f = frames.pop(); f.y1 = y - 2; msgs.push({ frame: f }); y += 14; continue; }
    n += 1;
    msgs.push({ ...st, y, n });
    y += st.self ? 44 : 34;
  }
  const yEnd = y + 6;
  // katılımcılar ve yaşam çizgileri
  for (const p of parts) {
    if (p.kind === 'actor') body += actor(p.x, 70, p.label);
    else {
      const lines = p.label.split('\n');
      const w = Math.max(...lines.map((l) => l.length)) * 7.3 + 22;
      body += `<rect x="${p.x - w / 2}" y="${42}" width="${w}" height="${18 + lines.length * 15}" rx="6" fill="${C.head}" stroke="${C.line}" stroke-width="1.3"/>`;
      lines.forEach((l, i) => (body += text(p.x, 58 + i * 15, l, { size: 12.5, weight: i === 0 ? 700 : 400, anchor: 'middle', mono: i > 0 })));
    }
    body += `<path d="M ${p.x} ${p.kind === 'actor' ? 114 : 96} L ${p.x} ${yEnd}" stroke="${C.life}" stroke-width="1.1" stroke-dasharray="5 4"/>`;
  }
  for (const m of msgs) {
    if (m.frame) {
      const f = m.frame;
      body += `<rect x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="none" stroke="${C.frame}" stroke-width="1.2"/>`;
      const tag = f.kind;
      const tw = tag.length * 8 + 16;
      body += `<path d="M ${f.x0} ${f.y0} L ${f.x0 + tw} ${f.y0} L ${f.x0 + tw} ${f.y0 + 12} L ${f.x0 + tw - 8} ${f.y0 + 20} L ${f.x0} ${f.y0 + 20} Z" fill="${C.act}" stroke="${C.frame}"/>`;
      body += text(f.x0 + 6, f.y0 + 14.5, tag, { size: 12, weight: 700 });
      if (f.guard) body += text(f.x0 + tw + 8, f.y0 + 14.5, `[${f.guard}]`, { size: 12, fill: C.ink2 });
      for (const e of f.elses) {
        body += `<path d="M ${f.x0} ${e.y} L ${f.x1} ${e.y}" stroke="${C.frame}" stroke-width="1.1" stroke-dasharray="6 4"/>`;
        body += text(f.x0 + 8, e.y + 15, `[${e.guard}]`, { size: 12, fill: C.ink2 });
      }
      continue;
    }
    const x1 = X[m.from], x2 = X[m.to];
    const label = `${m.n}. ${m.label}`;
    if (m.self) {
      body += `<path d="M ${x1} ${m.y} L ${x1 + 34} ${m.y} L ${x1 + 34} ${m.y + 20} L ${x1 + 2} ${m.y + 20}" fill="none" stroke="${C.line}" stroke-width="1.3" marker-end="url(#solid)"/>`;
      body += text(x1 + 42, m.y + 14, label, { size: 12 });
    } else {
      body += `<path d="M ${x1} ${m.y} L ${x2 + (x2 > x1 ? -2 : 2)} ${m.y}" fill="none" stroke="${C.line}" stroke-width="1.3"${m.ret ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${m.ret ? 'open' : 'solid'})"/>`;
      const left = Math.min(x1, x2);
      body += text(m.align === 'right' ? Math.max(x1, x2) - 8 : left + 8, m.y - 6, label, { size: 12, fill: m.ret ? C.ink2 : C.ink, anchor: m.align === 'right' ? 'end' : 'start' });
    }
  }
  return svg(name, width, yEnd + 20, title, body);
}

// ================================================================== 1. kullanım durumu
{
  let b = '';
  b += `<rect x="215" y="44" width="590" height="420" rx="10" fill="#fdfbfd" stroke="${C.line}" stroke-width="1.3"/>`;
  b += text(510, 66, 'Kod Bilimi Atölyesi + ios komut satırı', { size: 13, weight: 700, anchor: 'middle' });
  const L = [
    ['paket', 400, 100, 'Hazır paketi çalıştır'],
    ['kur', 400, 165, 'İş akışı kur\n(kutu ekle, uçları bağla)'],
    ['tara', 400, 232, 'Kaynak kodu / logu tara'],
    ['karar', 400, 297, 'Molekülün kararını\nincele (explain)'],
    ['yaris', 400, 362, 'Atomları yarıştır'],
    ['genom', 400, 425, 'Genomda desen ara'],
  ];
  const R = [['durdur', 670, 120, 'Bulgu varsa\nderlemeyi durdur'], ['sarif', 670, 210, 'Bulguları kod\ntaramasına yükle (SARIF)'], ['sec', 670, 330, 'En hızlı atomu seç'], ['ci', 670, 420, 'Atölye iş akışını\nCI\'da çalıştır']];
  const U = {};
  for (const [id, cx, cy, l] of L) { U[id] = [cx, cy, 128, 27]; b += usecase(cx, cy, 128, 27, l); }
  for (const [id, cx, cy, l] of R) { U[id] = [cx, cy, 108, 27]; b += usecase(cx, cy, 108, 27, l); }
  const link = (ax, ay, id) => { const [cx, cy, rx, ry] = U[id]; const p = ellipsePoint(cx, cy, rx, ry, ax, ay); return edge([[ax, ay], p], { kind: 'plain' }); };
  b += actor(110, 200, 'Yazılım\ngeliştirici');
  b += actor(110, 390, 'Biyoinformatikçi');
  b += actor(905, 150, 'Sürekli\nentegrasyon (CI)');
  for (const id of ['paket', 'kur', 'tara', 'karar', 'yaris']) b += link(128, 185, id);
  for (const id of ['karar', 'genom']) b += link(128, 378, id);
  for (const id of ['durdur', 'sarif', 'ci']) b += link(885, 135, id);
  const between = (a, c, kind, label) => {
    const [ax, ay, arx, ary] = U[a], [cx, cy, crx, cry] = U[c];
    const p1 = ellipsePoint(ax, ay, arx, ary, cx, cy), p2 = ellipsePoint(cx, cy, crx, cry, ax, ay);
    return edge([p1, p2], { kind: 'include', label, lx: (p1[0] + p2[0]) / 2 + 10, ly: (p1[1] + p2[1]) / 2 + 16 });
  };
  b += between('tara', 'sec', 'include', '«include»');
  b += between('genom', 'sec', 'include', '«include»');
  b += between('durdur', 'tara', 'include', '«extend»');
  svg('1_kullanim_durumu', 990, 480, 'Kullanım durumu diyagramı', b);
}

// ================================================================== 2a. sınıf: atom, molekül, kayıt defteri
{
  let b = '';
  const reg = classBox({ x: 24, y: 48, w: 236, name: 'Registry', attrs: ['- atoms : Map<ad, Atom>'], ops: ['+ register(Atom)', '+ get(ad) : Atom', '+ names() : ad[]', '+ candidates() : Atom[]', '+ clone() : Registry'] });
  const atom = classBox({ x: 400, y: 48, w: 330, name: 'ExactSearchAtom', abstract: true, stereo: 'abstract', attrs: ['+ manifest {static}', '+ selection {static}', '+ patterns : dizgi[]', '+ ignoreCase : bool', '# unique, groups'], ops: ['+ process(entry) : Match*  «şablon yöntem»', '# prepare()  «kanca»', '# scanText(text, n, hits)  «kanca»', '# padding() : sayı'] });
  const em = classBox({ x: 24, y: 300, w: 236, name: 'ExactMatch', stereo: 'molecule', attrs: ['+ strategy : "auto" | ad', '+ record : Record'], ops: ['+ run(entries) : Match*', '+ decide(entry) : Record'] });
  const cost = classBox({ x: 24, y: 500, w: 236, name: 'costModel', stereo: 'modül', ops: ['estimateCost(Atom, shape, c)', 'fitNonNegative(x, t)  «NNLS»'] });
  const shape = classBox({ x: 24, y: 630, w: 236, name: 'shape', stereo: 'modül', ops: ['computeShape(entry, params)', '→ n, σ, σe, k, mMin, mMax, mMean'] });
  const subs = [
    classBox({ x: 300, y: 380, w: 158, name: 'HorspoolSearch', ops: ['# prepare()', '# scanText(…)'] }),
    classBox({ x: 472, y: 380, w: 158, name: 'WuManberSearch', ops: ['# prepare()', '# scanText(…)'] }),
    classBox({ x: 644, y: 380, w: 170, name: 'AhoCorasickSearch', ops: ['# prepare()', '# scanText(…)'] }),
    classBox({ x: 828, y: 380, w: 158, name: 'NaiveSearch', stereo: 'test oracle', ops: ['+ process(entry)'] }),
  ];
  const fn = classBox({ x: 400, y: 600, w: 330, name: 'src/functions', stereo: 'saf çekirdekler', ops: ['prepareHorspool(), searchHorspool()', 'prepareWuManber(), searchWuManber()', 'buildAlphabet(), HitCollector …'] });
  for (const g of [reg, atom, em, cost, shape, ...subs, fn]) b += g.svg;
  // kalıtım: alt sınıflardan üst sınıfa ortak çatal
  const busY = 345;
  b += `<path d="M ${subs[0].cx} ${busY} L ${subs[3].cx} ${busY}" stroke="${C.line}" stroke-width="1.3"/>`;
  for (const s of subs) b += `<path d="M ${s.cx} ${s.top} L ${s.cx} ${busY}" stroke="${C.line}" stroke-width="1.3"/>`;
  b += edge([[atom.cx, busY], [atom.cx, atom.bottom]], { kind: 'inherit' });
  // kayıt defteri ◇— atomlar
  b += edge([[reg.right, 110], [atom.left, 110]], { kind: 'aggr', label: 'kayıtlı atomlar', endLabel: '*' });
  // molekül → kayıt defteri, seçilen atom, modüller
  b += edge([[em.cx, em.top], [reg.cx, reg.bottom]], { kind: 'dep', label: 'candidates()', lx: em.cx + 8, ly: (em.top + reg.bottom) / 2 + 4 });
  b += edge([[em.right, em.top + 30], [360, em.top + 30], [360, 210], [atom.left, 210]], { kind: 'assoc', label: 'seçilen atom', lx: 274, ly: em.top + 22, endLabel: '1' });
  b += edge([[em.cx, em.bottom], [cost.cx, cost.top]], { kind: 'dep', label: 'tahmin', lx: em.cx + 8, ly: (em.bottom + cost.top) / 2 + 4 });
  b += edge([[em.left, em.bottom - 24], [10, em.bottom - 24], [10, shape.cy], [shape.left, shape.cy]], { kind: 'dep' });
  b += text(14, shape.cy - 6, 'şekil', { size: 11.5, fill: C.ink2 });
  for (const s of subs.slice(0, 3)) b += edge([[s.cx, s.bottom], [s.cx, 560], [fn.cx + (s.cx - fn.cx) * 0.6, 560], [fn.cx + (s.cx - fn.cx) * 0.6, fn.top]], { kind: 'dep' });
  b += text(fn.right + 6, 556, 'çekirdeği çağırır', { size: 11.5, fill: C.ink2 });
  b += note(762, 600, 224, ['+5 atom daha: Boyer-Moore,', 'Shift-Or, KMP, bm4DNADS,', 'bm4DNAHMbs (aynı kancalar).', 'Yeni atom = yeni sınıf +', 'registry.register(); molekül', 'kodu değişmez (Açık/Kapalı).']);
  b += note(760, 48, 226, ['Template Method: process()', 'iskeleti üst sınıfta; parametre', 'denetimi, ignoreCase, alfabe', 'küçültme, sıralama ortak.', 'Alt sınıf yalnızca prepare()', 've scanText() yazar.']);
  svg('2a_sinif_atom_molekul', 1000, 720, 'Sınıf diyagramı (1/4): atomlar, molekül ve kayıt defteri (Template Method + Strategy + Registry)', b);
}

// ================================================================== 2b. sınıf: iş akışı motoru ve atölye
{
  let b = '';
  const wf = classBox({ x: 24, y: 48, w: 220, name: 'Workflow', stereo: 'veri', attrs: ['+ name : dizgi', '+ target : dizgi'] });
  const node = classBox({ x: 24, y: 230, w: 220, name: 'Node', stereo: 'veri (kutu)', attrs: ['+ id : dizgi', '+ type : dizgi', '+ x, y : sayı', '+ params : nesne'] });
  const edg = classBox({ x: 290, y: 230, w: 200, name: 'Edge', stereo: 'veri (bağlantı)', attrs: ['+ from : { node, port }', '+ to : { node, port }'] });
  const comp = classBox({ x: 24, y: 470, w: 260, name: 'Component', stereo: 'katalog girdisi', attrs: ['+ type, category, title', '+ params : Ayar[*]'], ops: ['+ run(inputs, params, ctx)', '+ describe(params) : dizgi'] });
  const port = classBox({ x: 372, y: 470, w: 190, name: 'Port', stereo: 'uç', attrs: ['+ name : dizgi', '+ type : UcTuru', '+ multi, optional : bool'] });
  const tur = classBox({ x: 600, y: 470, w: 170, name: 'UcTuru', stereo: 'enumeration', attrs: ['Source.File', 'FASTA.Entry', 'Pattern.Set', 'Sequence.Match', 'Finding'] });
  const eng = classBox({ x: 560, y: 48, w: 290, name: 'engine', stereo: 'modül, DOM\'suz', ops: ['addNode(), removeNode()', 'canConnect() : { ok, reason }', 'connect(), removeEdge()', 'topologicalOrder()  «Kahn»', 'validateWorkflow() : sorun[]', 'runWorkflow(wf, katalog, ctx)', 'serialize / deserializeWorkflow()', 'explainWorkflow() : Türkçe metin'] });
  const cat = classBox({ x: 600, y: 300, w: 250, name: 'catalog', stereo: 'modül', ops: ['createCatalog(registry)', '  : Map<type, Component>'] });
  const ext = classBox({ x: 912, y: 300, w: 150, name: 'Registry, ExactMatch', stereo: 'Şekil 2a', attrs: [] });
  const ui = classBox({ x: 880, y: 48, w: 170, name: 'web/ (atölye)', stereo: 'arayüz', ops: ['state, actions, views', '(Şekil 2d)'] });
  const wk = classBox({ x: 880, y: 175, w: 170, name: 'web/worker.js', stereo: 'Web Worker', ops: ['runSerialized()', 'raceNode()'] });
  for (const g of [wf, node, edg, comp, port, tur, eng, cat, ext, ui, wk]) b += g.svg;
  b += edge([[wf.cx - 40, wf.bottom], [wf.cx - 40, node.top]], { kind: 'comp', label: 'kutular', lx: wf.cx - 34, ly: (wf.bottom + node.top) / 2, endLabel: '*' });
  b += edge([[wf.right, wf.cy + 10], [edg.cx, wf.cy + 10], [edg.cx, edg.top]], { kind: 'comp', label: 'bağlantılar', lx: wf.right + 10, ly: wf.cy + 4, endLabel: '*' });
  b += edge([[edg.left, node.top + 50], [node.right, node.top + 50]], { kind: 'assoc', label: 'from, to', lx: node.right + 6, ly: node.top + 68, endLabel: '2' });
  b += edge([[node.cx, node.bottom], [node.cx, comp.top]], { kind: 'dep', label: 'type ile', lx: node.cx + 8, ly: (node.bottom + comp.top) / 2 + 4 });
  b += edge([[comp.right, comp.top + 60], [port.left, comp.top + 60]], { kind: 'comp', label: 'giriş/çıkış', lx: comp.right + 4, ly: comp.top + 78, endLabel: '*' });
  b += edge([[port.right, port.top + 60], [tur.left, port.top + 60]], { kind: 'assoc' });
  b += edge([[eng.left, eng.top + 40], [wf.right, eng.top + 40]], { kind: 'dep', label: 'okur, değiştirir, çalıştırır' });
  b += edge([[cat.cx, cat.bottom], [cat.cx, 440], [comp.cx + 60, 440], [comp.cx + 60, comp.top]], { kind: 'assoc', label: 'üretir', lx: cat.cx - 70, ly: 434 });
  b += edge([[cat.right, cat.top + 30], [ext.left, cat.top + 30]], { kind: 'dep', label: 'kullanır', lx: cat.right + 2, ly: cat.top + 50 });
  b += edge([[eng.cx, eng.bottom], [eng.cx, eng.bottom + 14], [cat.cx, eng.bottom + 14], [cat.cx, cat.top]], { kind: 'dep', label: 'bileşen sorar', lx: cat.cx + 8, ly: eng.bottom + 34 });
  b += edge([[ui.left, ui.top + 40], [eng.right, ui.top + 40]], { kind: 'dep' });
  b += edge([[wk.left, wk.top + 30], [eng.right, wk.top + 30]], { kind: 'dep' });
  b += edge([[ui.cx, ui.bottom], [wk.cx, wk.top]], { kind: 'dep', label: 'postMessage', lx: ui.cx + 8, ly: (ui.bottom + wk.top) / 2 + 4 });
  b += note(800, 470, 250, ['Tür denetimi: bağlantı yalnızca', 'aynı UcTuru arasında; tek girişli', 'uca ikinci bağlantı ve döngü', 'reddedilir, nedeni Türkçe cümle.', 'Motor DOM\'a, dosyaya, ağa', 'dokunmaz: Node testleri ve', 'Web Worker aynı kodu çalıştırır.']);
  svg('2b_sinif_is_akisi', 1080, 640, 'Sınıf diyagramı (2/4): iş akışı motoru, katalog ve atölye', b);
}


// ================================================================== 2c. sınıf: komut geçmişi (Command + Composite)
{
  let b = '';
  const act = classBox({ x: 24, y: 48, w: 232, name: 'actions/edit.js', stereo: 'denetleyici (istemci)', ops: ['addComponent(), connectPorts()', 'deleteSelection(), setParam()', 'undo(), redo()', 'pasteFragment()'] });
  const hist = classBox({ x: 370, y: 48, w: 270, name: 'History', stereo: 'çağıran (invoker)', attrs: ['- undo : Command[*]', '- redo : Command[*]', '- sealed : bool', '+ limit : sayı'], ops: ['+ execute(cmd)', '+ record(cmd)', '+ undo() : Command', '+ redo() : Command', '+ seal()', '+ canUndo, canRedo : bool'] });
  const doc = classBox({ x: 700, y: 48, w: 170, name: 'Doc', stereo: 'belge', attrs: ['+ wf : Workflow'] });
  const eng = classBox({ x: 920, y: 48, w: 190, name: 'engine', stereo: 'alıcı (receiver)', ops: ['addNode(), connect()', 'removeEdge()'] });
  const cmd = classBox({ x: 330, y: 330, w: 270, name: 'Command', stereo: 'interface', attrs: ['+ label : dizgi', '+ key? : dizgi'], ops: ['+ do(doc)', '+ undo(doc)', '+ merge?(next) : Command'] });
  const macro = classBox({ x: 690, y: 330, w: 250, name: 'MacroCommand', stereo: 'Composite', attrs: ['- commands : Command[*]'], ops: ['+ do(doc): sırayla', '+ undo(doc): ters sırayla', '  (biri hata verirse geri alır)'] });
  const W = 176;
  const xs = [16, 200, 384, 568, 752, 936];
  const subs = [
    classBox({ x: xs[0], y: 540, w: W, name: 'AddNodeCommand', ops: ['do: addNode()', 'undo: kutuyu çıkar'] }),
    classBox({ x: xs[1], y: 540, w: W, name: 'RemoveNodeCommand', attrs: ['- saved: kutu, sıra,', '  bağlantılar'] }),
    classBox({ x: xs[2], y: 540, w: W, name: 'ConnectCommand', ops: ['do: connect()', 'undo: removeEdge()'] }),
    classBox({ x: xs[3], y: 540, w: W, name: 'MoveNodeCommand', attrs: ['key = "tasi:<id>"'], ops: ['+ merge(next)'] }),
    classBox({ x: xs[4], y: 540, w: W, name: 'SetParamCommand', attrs: ['key = "ayar:<id>:<k>"'], ops: ['+ merge(next)'] }),
    classBox({ x: xs[5], y: 540, w: W, name: 'ReplaceWorkflowCmd', attrs: ['- before, after', '+ meta : açık paket'] }),
  ];
  for (const g of [act, hist, doc, eng, cmd, macro, ...subs]) b += g.svg;
  b += edge([[act.right, 100], [hist.left, 100]], { kind: 'assoc', label: 'execute(cmd)', lx: act.right + 10, ly: 94 });
  b += edge([[hist.cx, hist.bottom + 15], [hist.cx, cmd.top]], { kind: 'aggr', label: 'yığınlar', lx: hist.cx + 10, ly: (hist.bottom + cmd.top) / 2 + 4, endLabel: '*' });
  b += edge([[hist.right, 90], [doc.left, 90]], { kind: 'assoc', label: 'doc' });
  const busY = 510;
  b += `<path d="M ${subs[0].cx} ${busY} L ${subs.at(-1).cx} ${busY}" stroke="${C.line}" stroke-width="1.3" stroke-dasharray="6 4" fill="none"/>`;
  for (const s of subs) b += `<path d="M ${s.cx} ${s.top} L ${s.cx} ${busY}" stroke="${C.line}" stroke-width="1.3" stroke-dasharray="6 4" fill="none"/>`;
  b += edge([[cmd.cx, busY], [cmd.cx, cmd.bottom]], { kind: 'realize' });
  b += edge([[macro.left, macro.top + 26], [cmd.right, macro.top + 26]], { kind: 'realize' });
  b += edge([[macro.left - 15, macro.bottom - 26], [cmd.right, macro.bottom - 26]], { kind: 'aggr', label: 'commands', lx: cmd.right + 10, ly: macro.bottom - 32, endLabel: '*' });
  b += edge([[cmd.right, cmd.top + 12], [650, cmd.top + 12], [650, 300], [eng.cx, 300], [eng.cx, eng.bottom]], { kind: 'dep', label: 'do / undo motorun işlevleriyle', lx: 660, ly: 294 });
  b += note(16, 670, 1100, ['Aynı anahtarlı (key) ardışık komutlar tek adımda birleşir (yazma, ok tuşuyla taşıma); seal() birleştirmeyi keser. Paket açma ve temizleme de bir komuttur.', 'Özellik tabanlı test: 4 tohum × 400 rastgele işlem; her adımda iş akışı bir durum yığını modeliyle karşılaştırılır (tests/unit/history.test.js).']);
  svg('2c_sinif_komut_gecmisi', 1130, 730, 'Sınıf diyagramı (3/4): geri al / yinele — Command ve Composite desenleri', b);
}

// ================================================================== 2d. sınıf: atölye arayüz katmanları (Observer + Facade)
{
  let b = '';
  const app = classBox({ x: 24, y: 48, w: 200, name: 'app.js', stereo: 'giriş', ops: ['init*() çağırır', 'ilk iş akışını yükler'] });
  const kb = classBox({ x: 24, y: 200, w: 200, name: 'keyboard.js', stereo: 'olay bağlama', ops: ['bind(): düğmeler,', 'sekmeler, kısayollar'] });
  const views = classBox({ x: 270, y: 48, w: 250, name: 'views/*', stereo: 'görünüm (abone)', attrs: ['canvas, props, results,', 'palette, dialogs'], ops: ['+ init*(): bus.on(olay, çiz)', '+ render*()'] });
  const facade = classBox({ x: 620, y: 48, w: 240, name: 'actions.js', stereo: 'Facade (cephe)', ops: ['export * from actions/…'] });
  const core = classBox({ x: 600, y: 200, w: 190, name: 'actions/core.js', ops: ['changed(), applyCommand()', 'select(), setTab()'] });
  const edit = classBox({ x: 806, y: 200, w: 190, name: 'actions/edit.js', ops: ['kutu, bağlantı, ayar', 'undo(), redo(), pano'] });
  const io = classBox({ x: 600, y: 320, w: 190, name: 'actions/io.js', ops: ['paket, içe / dışa aktarma', 'bağlantı, otomatik kayıt'] });
  const run = classBox({ x: 806, y: 320, w: 190, name: 'actions/run.js', ops: ['run(), race(), explain()', 'Mermaid, kayıt'] });
  const bus = classBox({ x: 270, y: 240, w: 250, name: 'bus', stereo: 'Observer (olay yolu)', ops: ['+ on(olay, fn) : kapat', '+ emit(olay, veri)'] });
  const st = classBox({ x: 270, y: 420, w: 250, name: 'state.js', stereo: 'store', attrs: ['+ doc { wf }', '+ history : History', '+ state: seçim, sonuç, …'] });
  const src = classBox({ x: 600, y: 450, w: 396, name: 'src/workflows', stereo: "DOM'suz çekirdek", ops: ['engine, history, lint, diagram, provenance', 'catalog, packages, CodeScan'] });
  const rn = classBox({ x: 1030, y: 320, w: 110, name: 'runner.js', stereo: 'Web Worker', ops: ['worker.js', 'core.js'] });
  for (const g of [app, kb, views, facade, core, edit, io, run, bus, st, src, rn]) b += g.svg;
  b += edge([[app.right, 70], [views.left, 70]], { kind: 'dep' });
  b += edge([[app.cx, app.bottom], [app.cx, kb.top]], { kind: 'dep', label: 'başlatır', lx: app.cx + 6, ly: (app.bottom + kb.top) / 2 + 4 });
  b += edge([[kb.right, 215], [560, 215], [560, 90], [facade.left, 90]], { kind: 'dep' });
  b += edge([[views.right, 66], [facade.left, 66]], { kind: 'dep', label: 'eylem çağırır', lx: views.right + 8, ly: 60 });
  b += edge([[views.cx, views.bottom], [views.cx, bus.top]], { kind: 'dep', label: 'abone olur (on)', lx: views.cx + 6, ly: bus.top - 8 });
  b += edge([[views.left, 150], [250, 150], [250, st.cy], [st.left, st.cy]], { kind: 'dep', label: 'okur', lx: 220, ly: 300 });
  b += edge([[680, facade.bottom], [680, core.top]], { kind: 'dep' });
  b += edge([[840, facade.bottom], [840, edit.top]], { kind: 'dep', label: 'export *', lx: 846, ly: (facade.bottom + edit.top) / 2 + 4 });
  b += edge([[core.left, 262], [bus.right, 262]], { kind: 'dep', label: 'yayımlar', lx: 528, ly: 256 });
  b += edge([[io.left, 380], [560, 380], [560, 440], [st.right, 440]], { kind: 'dep', label: 'değiştirir', lx: 566, ly: 415 });
  b += edge([[io.cx, io.bottom], [io.cx, src.top]], { kind: 'dep', label: 'komut, motor', lx: io.cx + 6, ly: (io.bottom + src.top) / 2 + 4 });
  b += edge([[run.right, 360], [rn.left, 360]], { kind: 'dep' });
  b += edge([[rn.cx, rn.bottom], [rn.cx, src.cy], [src.right, src.cy]], { kind: 'dep' });
  b += edge([[st.right, src.cy], [src.left, src.cy]], { kind: 'dep', label: 'History', lx: 528, ly: src.cy - 6 });
  b += note(24, 560, 1116, ['Denetleyici görünümleri içe aktarmaz; görünümler birbirini değil olay yolunu dinler (tests/unit/web.test.js denetler).', 'web/ altındaki her dosya 450 satırın altında; app.js yalnızca modülleri bağlar.']);
  svg('2d_sinif_arayuz_katmanlari', 1160, 625, 'Sınıf diyagramı (4/4): atölye arayüzü — Observer ve Facade desenleri', b);
}

// ================================================================== 3a. sıralı: molekülün kararı
sequence('3a_sirali_molekul_karari', 'Sıralı diyagram 1: molekülün kararı (ios explain / run)', 1080, [
  { id: 'u', label: 'Kullanıcı', x: 60, kind: 'actor' },
  { id: 'cli', label: 'bin/ios.js', x: 200 },
  { id: 'em', label: 'ExactMatch', x: 380 },
  { id: 'sh', label: 'shape', x: 530 },
  { id: 'rg', label: 'Registry', x: 660 },
  { id: 'cm', label: 'costModel', x: 800 },
  { id: 'at', label: 'Seçilen atom', x: 960 },
], [
  { from: 'u', to: 'cli', label: 'explain --patterns GATC,GGATCC < lambda.fa' },
  { from: 'cli', to: 'cli', label: 'parseFasta(stdin)', self: true },
  { from: 'cli', to: 'em', label: 'new ExactMatch({ patterns, strategy: "auto" })' },
  { from: 'cli', to: 'em', label: 'decide(ilk kayıt)' },
  { from: 'em', to: 'sh', label: 'computeShape(kayıt, desenler)' },
  { from: 'sh', to: 'em', label: 'n, σ, σe, k, mMin, mMax, mMean (64 × 256 örneklem)', ret: true },
  { from: 'em', to: 'rg', label: 'candidates()' },
  { from: 'rg', to: 'em', label: 'aday atom sınıfları', ret: true },
  { frame: 'loop', guard: 'her aday atom', x0: 330, x1: 880 },
  { from: 'em', to: 'cm', label: 'applicable(şekil)? ise estimateCost(atom, şekil, katsayılar)' },
  { from: 'cm', to: 'em', label: 'tahmini süre (ms)', ret: true },
  { end: true },
  { from: 'em', to: 'em', label: 'en ucuzu seç; record = { requested, selected, shape, estimates, why }', self: true },
  { from: 'em', to: 'at', label: 'new Atom(params): desenleri bir kez ön işle' },
  { from: 'em', to: 'cli', label: 'record', ret: true },
  { frame: 'alt', guard: 'explain', x0: 30, x1: 1050 },
  { from: 'cli', to: 'u', label: 'record (JSON)', ret: true },
  { else: 'run' },
  { frame: 'loop', guard: 'her kayıt', x0: 160, x1: 1030 },
  { from: 'em', to: 'at', label: 'process(kayıt)' },
  { from: 'at', to: 'em', label: 'Sequence.Match …', ret: true },
  { end: true },
  { from: 'cli', to: 'u', label: 'stdout: JSONL; stderr: karar özeti', ret: true },
  { end: true },
]);

// ================================================================== 3b. sıralı: atölyede çalıştırma
sequence('3b_sirali_atolye_calistirma', 'Sıralı diyagram 2: atölyede "Tarayıcıda çalıştır"', 1080, [
  { id: 'u', label: 'Kullanıcı', x: 60, kind: 'actor' },
  { id: 'ui', label: 'Arayüz\napp.js', x: 200 },
  { id: 'rn', label: 'runner.js', x: 340 },
  { id: 'wk', label: 'Web Worker\ncore.js', x: 490 },
  { id: 'en', label: 'engine', x: 640 },
  { id: 'cp', label: 'Bileşen\n(katalog)', x: 800 },
  { id: 'em', label: 'ExactMatch\n/ atom', x: 970 },
], [
  { from: 'u', to: 'ui', label: '"Tarayıcıda çalıştır"' },
  { from: 'ui', to: 'en', label: 'validateWorkflow(wf)  (ana iş parçacığı)' },
  { from: 'en', to: 'ui', label: 'sorun listesi', ret: true },
  { frame: 'alt', guard: 'sorun var', x0: 30, x1: 1050 },
  { from: 'ui', to: 'u', label: 'rozet "hata: …", sorunlar özellikler panelinde', ret: true },
  { else: 'sorun yok' },
  { from: 'ui', to: 'rn', label: 'runWorkflowRemote(JSON)' },
  { from: 'rn', to: 'wk', label: 'postMessage({ cmd: "run", JSON })' },
  { from: 'wk', to: 'en', label: 'runWorkflow(wf, katalog, ctx)' },
  { from: 'en', to: 'en', label: 'topologicalOrder()', self: true },
  { frame: 'loop', guard: 'her kutu, topolojik sırayla', x0: 300, x1: 1040 },
  { from: 'en', to: 'cp', label: 'run(girdiler, ayarlar, ctx)' },
  { frame: 'opt', guard: 'arama kutusu', x0: 620, x1: 1035 },
  { from: 'cp', to: 'em', label: 'run(entries) / process()' },
  { from: 'em', to: 'cp', label: 'eşleşmeler + record', ret: true },
  { end: true },
  { from: 'cp', to: 'en', label: 'çıkışlar + bilgi (özet, süre)', ret: true },
  { from: 'wk', to: 'rn', label: 'postMessage(progress)', ret: true },
  { from: 'rn', to: 'ui', label: 'kutu durumu (çalışıyor → bitti)', ret: true },
  { end: true },
  { from: 'wk', to: 'rn', label: 'sonuç (bilgiler; büyük metinler gönderilmez)', ret: true },
  { from: 'ui', to: 'u', label: '"bitti: N bulgu, X ms", bulgu tablosu, karar kaydı', ret: true },
  { end: true },
]);

// ================================================================== 3c. sıralı: bağlantı kurma ve reddi
sequence('3c_sirali_baglanti', 'Sıralı diyagram 3: iki ucu bağlama ve uyumsuz bağlantının reddi', 900, [
  { id: 'u', label: 'Kullanıcı', x: 70, kind: 'actor' },
  { id: 'ui', label: 'Arayüz\napp.js', x: 330 },
  { id: 'en', label: 'engine', x: 650 },
], [
  { from: 'u', to: 'ui', label: 'çıkış ucundan sürükle, giriş ucuna bırak (ya da iki uçta Enter)' },
  { from: 'ui', to: 'en', label: 'canConnect(wf, katalog, from, to)' },
  { from: 'en', to: 'en', label: 'aynı tür mü? giriş dolu mu? döngü olur mu?', self: true },
  { frame: 'alt', guard: 'uygun', x0: 30, x1: 870 },
  { from: 'en', to: 'ui', label: '{ ok: true }', ret: true },
  { from: 'ui', to: 'en', label: 'connect(…): bağlantı eklenir' },
  { from: 'ui', to: 'u', label: 'kablo çizilir, son sonuç "değişti" olur', ret: true },
  { else: 'uygun değil' },
  { from: 'en', to: 'ui', label: '{ ok: false, reason }', ret: true },
  { from: 'ui', to: 'u', label: '"Tür uyuşmuyor: Source.File → FASTA.Entry; araya uyarlayıcı koyun"', ret: true },
  { end: true },
]);

// ================================================================== 3d. sıralı: geri al
sequence('3d_sirali_geri_al', 'Sıralı diyagram 4: geri al (Ctrl+Z)', 1080, [
  { id: 'u', label: 'Kullanıcı', x: 60, kind: 'actor' },
  { id: 'kb', label: 'keyboard.js', x: 200 },
  { id: 'act', label: 'actions/edit.js', x: 360 },
  { id: 'hist', label: 'History', x: 530 },
  { id: 'cmd', label: 'Command', x: 670 },
  { id: 'bus', label: 'bus', x: 810 },
  { id: 'vw', label: 'views/*', x: 970 },
], [
  { from: 'u', to: 'kb', label: 'Ctrl+Z (yazı alanında değilken)' },
  { from: 'kb', to: 'act', label: 'undo()' },
  { from: 'act', to: 'hist', label: 'undo()' },
  { from: 'hist', to: 'cmd', label: 'cmd.undo(doc)' },
  { from: 'cmd', to: 'cmd', label: 'iş akışı önceki durumuna döner', self: true },
  { from: 'hist', to: 'act', label: 'geri alınan komut (label, meta)', ret: true },
  { frame: 'alt', guard: 'iş akışının tamamı değişti (paket, içe aktarma, temizleme)', x0: 300, x1: 1050 },
  { from: 'act', to: 'act', label: 'açık paket meta\'dan geri gelir; çalıştırma sonucu sıfırlanır', self: true },
  { from: 'act', to: 'bus', label: 'emit("yuklendi")' },
  { else: 'tek değişiklik' },
  { from: 'act', to: 'act', label: 'changed(): denetim (lint) yenilenir, otomatik kayıt planlanır', self: true },
  { from: 'act', to: 'bus', label: 'emit("degisti")' },
  { end: true },
  { from: 'bus', to: 'vw', label: 'abonelere iletir' },
  { from: 'vw', to: 'u', label: 'tuval, panel ve rozet yeniden çizilir; "Geri alındı: Kutu silme"', ret: true },
]);

// ================================================================== 4. katmanlar (paket / bileşen diyagramı)
{
  let b = '';
  const row1 = [folder(24, 50, 250, 110, 'bin/ios.js', ['run, explain, scan, list'], { stereo: 'komut satırı' }), folder(300, 50, 300, 110, 'web/', ['state, actions/, views/, lib/', 'keyboard, runner, worker'], { stereo: 'atölye (tarayıcı)' }), folder(626, 50, 340, 110, 'tests/ + scripts/', ['node:test, kalibrasyon, doğrulama', 'arayüz / erişilebilirlik / kapsama'], { stereo: 'doğrulama' })];
  const row2 = [folder(24, 220, 360, 120, 'src/workflows + src/scan', ['engine, catalog, history, lint, diagram', 'provenance, CodeScan · rules, report'], { stereo: 'iş akışı ve tarama' }), folder(410, 220, 250, 120, 'src/adapters + fasta', ['sourceToEntry, lineStarts', 'parseFasta'], { stereo: 'uyarlayıcı' })];
  const row3 = [folder(24, 400, 360, 120, 'src/molecules', ['ExactMatch, costModel', 'coefficients(.js/.json)'], { stereo: 'molekül' }), folder(410, 400, 250, 120, 'registry + contracts', ['Registry, BUILTIN', 'rol arayüzleri (ISP)'], { stereo: 'kayıt defteri' }), folder(686, 400, 280, 120, 'src/shape.js', ['computeShape (64 × 256)'], { stereo: 'veri şekli' })];
  const row4 = [folder(24, 580, 460, 120, 'src/atomic', ['ExactSearchAtom + 8 aday atom', '+ NaiveSearch (oracle)'], { stereo: 'atomlar' }), folder(510, 580, 456, 120, 'src/functions', ['horspool, wuManber, ahoCorasick, …', 'alphabet, hits, expect'], { stereo: 'saf çekirdekler' })];
  for (const f of [...row1, ...row2, ...row3, ...row4]) b += f.svg;
  const dn = (a, bx, label) => edge([[a.cx + (bx ?? 0), a.bottom], [a.cx + (bx ?? 0), a.bottom + 58]], { kind: 'dep', label, lx: a.cx + (bx ?? 0) + 8, ly: a.bottom + 34 });
  b += edge([[row1[0].cx, row1[0].bottom], [row1[0].cx, row2[0].top]], { kind: 'dep' });
  b += edge([[row1[1].cx - 40, row1[1].bottom], [row1[1].cx - 40, 190], [row2[0].cx + 80, 190], [row2[0].cx + 80, row2[0].top]], { kind: 'dep' });
  b += edge([[row2[0].cx, row2[0].bottom], [row2[0].cx, row3[0].top]], { kind: 'dep' });
  b += edge([[row2[0].right, 280], [row2[1].left, 280]], { kind: 'dep' });
  b += edge([[row3[0].right, 460], [row3[1].left, 460]], { kind: 'dep' });
  b += edge([[row3[0].cx + 120, row3[0].top], [row3[0].cx + 120, 375], [row3[2].cx, 375], [row3[2].cx, row3[2].top]], { kind: 'dep' });
  b += edge([[row3[1].cx, row3[1].bottom], [row3[1].cx, 550], [row4[0].right - 40, 550], [row4[0].right - 40, row4[0].top]], { kind: 'dep' });
  b += edge([[row3[0].cx - 60, row3[0].bottom], [row3[0].cx - 60, row4[0].top]], { kind: 'dep' });
  b += edge([[row4[0].right, 640], [row4[1].left, 640]], { kind: 'dep' });
  b += note(686, 220, 280, ['Bağımlılıklar yalnızca aşağı doğru.', 'src/ G/Ç yapmaz: dosya, ağ ve DOM', 'yalnızca bin/ios.js ve web/ içinde.', 'Atomlarda indexOf, RegExp, console', 'yok (forbidden.test.js).']);
  void dn;
  svg('4_katmanlar', 990, 720, 'Paket (katman) diyagramı: modüller ve bağımlılık yönü', b);
}

console.log('docs/uml/svg/: 10 diyagram yazıldı');

// ------------------------------------------------------------------ isteğe bağlı: tek PDF
if (process.argv.includes('--pdf')) {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const files = ['1_kullanim_durumu', '2a_sinif_atom_molekul', '2b_sinif_is_akisi', '2c_sinif_komut_gecmisi', '2d_sinif_arayuz_katmanlari', '3a_sirali_molekul_karari', '3b_sirali_atolye_calistirma', '3c_sirali_baglanti', '3d_sirali_geri_al', '4_katmanlar'];
  const pages = files.map((f) => `<section><div class="c">${readFileSync(new URL(`${f}.svg`, OUT), 'utf8').replace(/width="\d+" height="\d+"/, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')}</div></section>`).join('');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:10mm}body{margin:0}section{height:188mm;page-break-after:always;display:flex}section .c{flex:1}svg{display:block}</style></head><body>${pages}</body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: fileURLToPath(new URL('../UML_Diyagramlari.pdf', OUT)), landscape: true, format: 'A4', printBackground: true });
  await browser.close();
  console.log('docs/uml/UML_Diyagramlari.pdf yazıldı');
}
