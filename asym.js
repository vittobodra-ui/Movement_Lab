// Segnalazione delle asimmetrie tra lato sinistro e destro, uguale in tutti i programmi.
// Modulo senza pagina né video: legge solo le soglie salvate. I report, le letture dal vivo e la
// scheda cliente usano queste funzioni, quindi segnalano sempre gli stessi numeri.
// Il segno e il testo restano leggibili anche in una stampa in scala di grigi.

export const DEFAULTS = { bigAngle: 10, smallAngle: 3, load: 10, percent: 10, sway: 25 };
export const LIMIT_INFO = {
  bigAngle: { label: 'Angoli ampi', detail: 'Spalla, gomito, ginocchio, anca, tibia di lato', unit: '°', text: (v) => `angoli ampi ${fmt(v)}°` },
  smallAngle: { label: 'Angoli piccoli', detail: 'Bacino, spalle, tronco di lato, valgo, tibia vista di fronte', unit: '°', text: (v) => `angoli piccoli ${fmt(v)}°` },
  load: { label: 'Carico tra i piedi', detail: 'Differenza tra le due percentuali: 10 punti significa 55% e 45%', unit: 'punti %', text: (v) => `carico tra i piedi ${fmt(v)} punti` },
  percent: { label: 'Tempi e percentuali', detail: 'Tempo del passo, bacino spostato di lato, altezza dei polsi', unit: '%', text: (v) => `tempi e percentuali ${fmt(v)}%` },
  sway: { label: 'Oscillazione su un piede', detail: 'Percorso del piede sinistro rispetto al destro', unit: '%', text: (v) => `oscillazione su un piede ${fmt(v)}%` },
};
const STORE_KEY = 'lab_asym';
const MIN_STEPS = 5; // con meno passi per lato la differenza dipende dal caso

export const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
const rnd = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
const ok = (v) => typeof v === 'number' && Number.isFinite(v);

export function thresholds() {
  const out = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    for (const k of Object.keys(DEFAULTS)) if (k in saved) out[k] = saved[k] === null ? null : Number(saved[k]);
  } catch { /* restano i valori iniziali */ }
  return out;
}
export function saveThresholds(t) {
  const clean = {};
  for (const k of Object.keys(DEFAULTS)) { const v = t[k]; clean[k] = v === null || v === '' || !(Number(v) > 0) ? null : Number(v); }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(clean)); } catch { /* non salvate */ }
  return clean;
}

// 0 nessuna segnalazione, 1 pari o oltre la soglia, 2 pari o oltre il doppio.
export function level(diff, limit) {
  if (!ok(diff) || !(limit > 0)) return 0;
  const v = Math.abs(diff);
  return v >= 2 * limit ? 2 : v >= limit ? 1 : 0;
}
export const mark = (lv) => (lv === 2 ? '▲▲' : lv === 1 ? '▲' : '');
export const flagHtml = (lv, html) => (lv ? `<span class="asym lv${lv}">${mark(lv)} ${html}</span>` : html);
export const sideWord = (s) => (s === 'L' ? 'sinistra' : s === 'R' ? 'destra' : '');
const biggerText = (s) => (s ? `, maggiore a ${sideWord(s)}` : '');

// Differenza tra due valori come stampati: chi legge il referto può rifare il conto a mente.
export function pair(a, b, d, limit) {
  if (!ok(a) || !ok(b)) return null;
  const A = rnd(a, d), B = rnd(b, d), diff = rnd(Math.abs(A - B), d);
  const bigger = A * B >= 0 ? Math.abs(A) - Math.abs(B) : A - B;
  return { diff, side: bigger > 0 ? 'L' : bigger < 0 ? 'R' : null, level: level(diff, limit) };
}
// Differenza in percentuale sulla media dei due valori.
export function pairPercent(a, b, d, limit) {
  if (!ok(a) || !ok(b) || a + b === 0) return null;
  const diff = rnd(Math.abs(a - b) / ((Math.abs(a) + Math.abs(b)) / 2) * 100, d);
  return { diff, side: a > b ? 'L' : a < b ? 'R' : null, level: level(diff, limit) };
}

function makeFlag(key, limit, label, p, a, b, unit, d, extra = {}) {
  return { key, limit, label, a, b, unit, d, diff: p.diff, side: p.side, level: p.level, ...extra };
}
const withUnit = (v, unit, d) => (unit === '°' || unit === '%' ? `${fmt(v, d)}${unit}` : unit ? `${fmt(v, d)} ${unit}` : fmt(v, d));

// Frase per l'elenco in testa ai referti.
export function flagSentence(f) {
  if (f.text) return `${f.label}: ${f.text}.`;
  const diffUnit = f.diffUnit ?? f.unit;
  return `${f.label}: ${withUnit(f.a, f.unit, f.d)} a sinistra, ${withUnit(f.b, f.unit, f.d)} a destra. Differenza ${withUnit(f.diff, diffUnit, f.diffD ?? f.d)}${biggerText(f.side)}.`;
}
export function flagLine(f) {
  return `<li><span class="asym lv${f.level}">${mark(f.level)}</span> ${escHtml(flagSentence(f))}</li>`;
}
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function legendHtml(keys = Object.keys(DEFAULTS), T = thresholds()) {
  const used = keys.filter((k) => T[k] > 0).map((k) => LIMIT_INFO[k].text(T[k]));
  return `<p class="asym-legend"><span class="asym lv1">▲</span> differenza pari o oltre la soglia. <span class="asym lv2">▲▲</span> pari o oltre il doppio.${used.length ? ` Soglie: ${used.join(', ')}.` : ''} Sono punti di partenza che puoi cambiare, non limiti clinici.</p>`;
}
// Riquadro in testa ai referti: dice anche quando il controllo non ha trovato nulla.
export function sectionHtml(flags, keys, { emptyText = 'Nessuna differenza oltre le soglie.', title = 'Asimmetrie segnalate' } = {}) {
  const sorted = [...flags].sort((x, y) => y.level - x.level);
  return `<section class="asym-sec"><h2>${escHtml(title)}</h2>${sorted.length ? `<ul>${sorted.map(flagLine).join('')}</ul>` : `<p>${escHtml(emptyText)}</p>`}${legendHtml(keys)}</section>`;
}

/* ---------- corsa ---------- */
const VIEW_LABEL = { front: 'vista frontale', rear: 'vista posteriore', side: 'vista laterale' };
export const CORSA_KEYS = ['smallAngle', 'percent'];
export function corsaPair(metrics, key, d, T = thresholds()) {
  const a = metrics?.[`${key}_L`], b = metrics?.[`${key}_R`];
  if (!a || !b) return null;
  const enough = a.n >= MIN_STEPS && b.n >= MIN_STEPS;
  if (key === 'lateral' || key === 'armCross') return pair(a.mean, b.mean, d, null); // si mostrano soltanto: non sono una differenza di carico tra i lati
  if (key === 'stepTime') return pairPercent(a.mean, b.mean, 1, enough ? T.percent : null);
  return pair(a.mean, b.mean, d, enough ? T.smallAngle : null);
}
export function corsaFlags(doc, T = thresholds()) {
  const out = [];
  for (const v of ['rear', 'front']) {
    const data = doc?.views?.[v]; if (!data) continue;
    const M = data.metrics ?? {};
    for (const [key, label] of [['drop', 'Caduta del bacino'], ['valgus', 'Valgo dinamico']]) {
      const p = corsaPair(M, key, 1, T);
      if (p?.level) out.push(makeFlag('smallAngle', T.smallAngle, `${label}, ${VIEW_LABEL[v]}`, p, M[`${key}_L`].mean, M[`${key}_R`].mean, '°', 1, { view: v, metric: key }));
    }
    const p = corsaPair(M, 'stepTime', 0, T);
    if (p?.level) out.push(makeFlag('percent', T.percent, `Tempo del passo, ${VIEW_LABEL[v]}`, p, M.stepTime_L.mean, M.stepTime_R.mean, 'ms', 0, { view: v, metric: 'stepTime', diffUnit: '%', diffD: 1 }));
  }
  return out;
}

/* ---------- accosciate e braccia ---------- */
export const MOVIMENTO_KEYS = ['bigAngle', 'smallAngle', 'percent'];
const ARM_PROTOCOLS = new Set(['flex', 'ext', 'abd', 'rot', 'elbow', 'press', 'wrist']);
const PAIR_CLASS = { abd: 'bigAngle', elbow: 'bigAngle', knee: 'bigAngle', hip: 'bigAngle', shin: 'smallAngle', valgus: 'smallAngle' };
const CROSS_CLASS = { knee: 'bigAngle', hip: 'bigAngle', tibia: 'bigAngle', shoulder: 'bigAngle', elbow: 'bigAngle', forearm: 'bigAngle', kneeRest: 'bigAngle', valgus: 'smallAngle', shin: 'smallAngle', drop: 'smallAngle' };
const SIGNED = {
  pelvis: { key: 'smallAngle', plus: 'destra più bassa', minus: 'sinistra più bassa' },
  shTilt: { key: 'smallAngle', plus: 'destra più bassa', minus: 'sinistra più bassa' },
  trunkLat: { key: 'smallAngle', plus: 'verso destra', minus: 'verso sinistra' },
  hipShift: { key: 'percent', plus: 'verso destra', minus: 'verso sinistra' },
  wristDiff: { key: 'percent', plus: null, minus: null },
};
export const movimentoPairClass = (base) => PAIR_CLASS[base] ?? null;
export const movimentoPair = (l, r, base, T = thresholds()) => {
  if (!l || !r) return null;
  const k = PAIR_CLASS[base];
  return pair(l.peakMean, r.peakMean, l.d ?? 0, k ? T[k] : null);
};
export function movimentoSigned(id, m, T = thresholds()) {
  const s = SIGNED[id];
  if (!s || !m || !ok(m.peakMean)) return null;
  const v = rnd(m.peakMean, m.d ?? 0), lv = level(v, T[s.key]);
  return { value: v, level: lv, key: s.key, text: v > 0 ? s.plus : v < 0 ? s.minus : null };
}
// Nei testi basta il nome della misura: "Spalla: flessione (+), estensione (−)" diventa "Spalla".
export const shortLabel = (label) => String(label ?? '').replace(/\s*\([+−-]\).*$/, '').replace(/:.*$/, '').replace(/ a destra$/, '').trim();
const setTitle = (set) => `${set.name}, vista ${{ side: 'laterale', front: 'frontale', rear: 'posteriore' }[set.view] ?? set.view}`;
export function movimentoSetFlags(set, T = thresholds()) {
  const out = [], M = set?.summary?.metrics ?? {}, title = setTitle(set);
  for (const id of Object.keys(M)) {
    if (!id.endsWith('_L')) continue;
    const base = id.slice(0, -2), l = M[id], r = M[`${base}_R`];
    const p = movimentoPair(l, r, base, T);
    if (p?.level) out.push(makeFlag(PAIR_CLASS[base], T[PAIR_CLASS[base]], `${title}. ${shortLabel(l.label)}`, p, l.peakMean, r.peakMean, l.unit, l.d ?? 0, { setId: set.id, metric: base }));
  }
  for (const id of Object.keys(SIGNED)) {
    const s = movimentoSigned(id, M[id], T);
    if (s?.level) out.push({ key: s.key, limit: T[s.key], label: `${title}. ${shortLabel(M[id].label)}`, text: `${withUnit(Math.abs(s.value), M[id].unit, M[id].d ?? 0)}${s.text ? `, ${s.text}` : ''}`, level: s.level, setId: set.id, metric: id });
  }
  return out;
}
// Lo stesso esercizio ripreso una volta per lato: sinistra e destra stanno in due serie diverse.
export function movimentoCross(session, T = thresholds()) {
  const groups = new Map();
  for (const set of session?.sets ?? []) {
    if (set.protocolId === 'custom' || !set.summary) continue;
    const side = ARM_PROTOCOLS.has(set.protocolId) ? set.summary.near : set.summary.work;
    if (side !== 'L' && side !== 'R') continue;
    const k = `${set.protocolId}|${set.view}`;
    if (!groups.has(k)) groups.set(k, {});
    groups.get(k)[side] = set; // l'ultima serie di ogni lato
  }
  const rows = [];
  for (const g of groups.values()) {
    if (!g.L || !g.R) continue;
    if (g.L.load && g.R.load && String(g.L.load) !== String(g.R.load)) continue;
    const ML = g.L.summary.metrics ?? {}, MR = g.R.summary.metrics ?? {};
    for (const id of Object.keys(ML)) {
      const key = CROSS_CLASS[id]; if (!key || !MR[id]) continue;
      const p = pair(ML[id].peakMean, MR[id].peakMean, ML[id].d ?? 0, T[key]);
      if (p) rows.push({ title: setTitle(g.L), label: shortLabel(ML[id].label), unit: ML[id].unit, d: ML[id].d ?? 0, a: ML[id].peakMean, b: MR[id].peakMean, ...p, key, setL: g.L.id, setR: g.R.id, metric: id });
    }
  }
  return rows;
}
export function movimentoFlags(session, T = thresholds()) {
  const out = (session?.sets ?? []).flatMap((s) => movimentoSetFlags(s, T));
  for (const r of movimentoCross(session, T)) if (r.level) out.push(makeFlag(r.key, T[r.key], `${r.title}. ${r.label}, una serie per lato`, r, r.a, r.b, r.unit, r.d, { metric: r.metric }));
  return out;
}
// Dalle ripetizioni fatte finora: mai dai valori istantanei, che oscillano durante il movimento.
export function movimentoLive(reps, spec, T = thresholds()) {
  let L = [], R = [], base = null;
  if (spec.perSide) {
    base = spec.perSide.L.replace(/_L$/, '');
    for (const r of reps) if (ok(r.peakValue)) (r.side === 'L' ? L : R).push(r.peakValue);
  } else if (spec.second && spec.primary?.endsWith('_L')) {
    base = spec.primary.slice(0, -2);
    for (const r of reps) { if (ok(r.at?.[spec.primary])) L.push(r.at[spec.primary]); if (ok(r.at?.[spec.second])) R.push(r.at[spec.second]); }
  }
  if (!base || L.length < 2 || R.length < 2) return null;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const metric = spec.metrics.find((m) => m.id === `${base}_L`), d = metric?.d ?? 0, key = PAIR_CLASS[base];
  const p = pair(mean(L), mean(R), d, key ? T[key] : null);
  return p ? { ...p, unit: metric?.unit ?? '°', d } : null;
}

/* ---------- stabilometria ---------- */
export const STABILO_KEYS = ['load', 'sway'];
export const loadPair = (loads, T = thresholds()) => (loads ? pair(loads.left, loads.right, 0, T.load) : null);
export function singleLegPair(tests) {
  const L = (tests ?? []).filter((t) => t.kind === 'slL').at(-1), R = (tests ?? []).filter((t) => t.kind === 'slR').at(-1);
  return L && R ? { L, R } : null;
}
export function stabiloFlags(exam, T = thresholds()) {
  const out = [];
  for (const t of exam?.tests ?? []) {
    const p = loadPair(t.m?.loads, T);
    if (p?.level) out.push(makeFlag('load', T.load, `Carico tra i piedi, ${t.label.toLowerCase()}`, p, t.m.loads.left, t.m.loads.right, '%', 0, { diffUnit: 'punti', test: t.kind }));
  }
  const sl = singleLegPair(exam?.tests);
  if (sl) {
    const p = pairPercent(sl.L.m.length, sl.R.m.length, 0, T.sway);
    if (p?.level) out.push(makeFlag('sway', T.sway, 'Percorso su un piede', p, sl.L.m.length, sl.R.m.length, 'mm', 0, { diffUnit: '%' }));
  }
  return out;
}

export const countFlags = (mod, doc, T = thresholds()) => (mod === 'corsa' ? corsaFlags(doc, T) : mod === 'movimento' ? movimentoFlags(doc, T) : mod === 'stabilometria' ? stabiloFlags(doc, T) : []);
