// Gradi e misure dai punti di repere. Modulo puro: nessun accesso a video o pagina.
// I punti sono in unità immagine: x = x normalizzata × rapporto d'aspetto, y = y normalizzata (y verso il basso).
export const DEG = 180 / Math.PI;
export const NAMES = ['Naso', 'Occhio int. sin', 'Occhio sin', 'Occhio est. sin', 'Occhio int. des', 'Occhio des', 'Occhio est. des', 'Orecchio sin', 'Orecchio des', 'Bocca sin', 'Bocca des', 'Spalla sin', 'Spalla des', 'Gomito sin', 'Gomito des', 'Polso sin', 'Polso des', 'Mignolo sin', 'Mignolo des', 'Indice sin', 'Indice des', 'Pollice sin', 'Pollice des', 'Anca sin', 'Anca des', 'Ginocchio sin', 'Ginocchio des', 'Caviglia sin', 'Caviglia des', 'Tallone sin', 'Tallone des', 'Punta sin', 'Punta des'];
export const PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
export const BONES = {
  c: [[11, 12], [23, 24]],
  L: [[11, 23], [11, 13], [13, 15], [15, 19], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31]],
  R: [[12, 24], [12, 14], [14, 16], [16, 20], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]],
};
const CH = {
  L: { sh: 11, el: 13, wr: 15, ix: 19, hip: 23, kn: 25, an: 27, he: 29, to: 31 },
  R: { sh: 12, el: 14, wr: 16, ix: 20, hip: 24, kn: 26, an: 28, he: 30, to: 32 },
};
export const other = (s) => (s === 'L' ? 'R' : 'L');
const sideName = (s) => (s === 'L' ? 'sin' : 'des');
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const hyp = (u) => Math.hypot(u.x, u.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 };

// Flessione al vertice b: 0 quando a-b-c sono allineati.
export function flexion(a, b, c) {
  const u = sub(a, b), w = sub(c, b);
  const cos = (u.x * w.x + u.y * w.y) / ((hyp(u) * hyp(w)) || 1);
  return 180 - Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
}
// Angolo con segno da r0 a r1; il verso positivo porta r0 verso il lato indicato da sign (+1 = x crescente se r0 punta in basso).
function signed(r0, r1, sign) {
  const cross = r0.x * r1.y - r0.y * r1.x, dot = r0.x * r1.x + r0.y * r1.y;
  return Math.atan2(-cross * sign, dot) * DEG;
}
const fromVertical = (from, to, sign) => Math.atan2((to.x - from.x) * sign, from.y - to.y) * DEG;

function resolve(ctx, who) {
  if (who === 'L' || who === 'R') return who;
  if (who === 'near') return ctx.near;
  if (who === 'work') return ctx.work;
  if (who === 'rest') return other(ctx.work);
  return ctx.near;
}
const seen = (ctx, ...idx) => idx.every((i) => ctx.P[i].v >= ctx.minVis);
const flexDraw = (P, a, b, c) => ({ at: P[b], r1: sub(P[b], P[a]), r2: sub(P[c], P[b]), guide: true });

/* ---------- misure ---------- */
export const M = {
  knee: (who = 'work', o = {}) => ({
    id: o.id ?? (who === 'L' || who === 'R' ? `knee_${who}` : 'knee'), base: 'knee', label: o.label ?? 'Flessione ginocchio', unit: '°', d: 0, who, ...o,
    f(ctx) { const s = resolve(ctx, who), c = CH[s]; if (!seen(ctx, c.hip, c.kn, c.an)) return null; return { v: flexion(ctx.P[c.hip], ctx.P[c.kn], ctx.P[c.an]), side: s, draw: flexDraw(ctx.P, c.hip, c.kn, c.an) }; },
  }),
  hip: (who = 'work', o = {}) => ({
    id: o.id ?? (who === 'L' || who === 'R' ? `hip_${who}` : 'hip'), base: 'hip', label: 'Flessione anca', unit: '°', d: 0, who, ...o,
    f(ctx) { const s = resolve(ctx, who), c = CH[s]; if (!seen(ctx, c.sh, c.hip, c.kn)) return null; return { v: flexion(ctx.P[c.sh], ctx.P[c.hip], ctx.P[c.kn]), side: s, draw: flexDraw(ctx.P, c.sh, c.hip, c.kn) }; },
  }),
  tibia: (who = 'work', o = {}) => ({
    id: o.id ?? 'tibia', base: 'tibia', label: 'Tibia sulla verticale', unit: '°', d: 0, who, ...o,
    f(ctx) { const s = resolve(ctx, who), c = CH[s]; if (!seen(ctx, c.kn, c.an)) return null; const A = ctx.P[c.an], K = ctx.P[c.kn]; return { v: fromVertical(A, K, ctx.dir), side: s, draw: { at: A, r1: UP, r2: sub(K, A), guide: true } }; },
  }),
  trunk: (o = {}) => ({
    id: 'trunk', base: 'trunk', label: 'Tronco sulla verticale', unit: '°', d: 0, ...o,
    f(ctx) { const P = ctx.P; if (!seen(ctx, 11, 12, 23, 24)) return null; const S = mid(P[11], P[12]), H = mid(P[23], P[24]); return { v: fromVertical(H, S, ctx.dir), draw: { at: H, r1: UP, r2: sub(S, H), guide: true } }; },
  }),
  thigh: (who = 'work', o = {}) => ({
    id: 'thigh', base: 'thigh', label: 'Coscia sull’orizzontale', unit: '°', d: 0, quiet: true, hint: 'Sotto zero: anca più bassa del ginocchio', ...o,
    f(ctx) { const s = resolve(ctx, who), c = CH[s]; if (!seen(ctx, c.hip, c.kn)) return null; const H = ctx.P[c.hip], K = ctx.P[c.kn]; return { v: Math.atan2(K.y - H.y, Math.abs(H.x - K.x) || 1e-6) * DEG, side: s }; },
  }),
  trunkTibia: (who = 'work') => ({
    id: 'trunkTibia', base: 'trunkTibia', label: 'Tronco meno tibia', unit: '°', d: 0, quiet: true, hint: 'Vicino a zero: tronco e tibia paralleli',
    f(ctx) { const s = resolve(ctx, who), c = CH[s], P = ctx.P; if (!seen(ctx, 11, 12, 23, 24, c.kn, c.an)) return null; return { v: fromVertical(mid(P[23], P[24]), mid(P[11], P[12]), ctx.dir) - fromVertical(P[c.an], P[c.kn], ctx.dir) }; },
  }),
  shoulderSag: (who = 'near', o = {}) => ({
    id: o.id ?? 'shoulder', base: 'shoulderSag', label: 'Spalla: flessione (+), estensione (−)', unit: '°', d: 0, who, ...o,
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], P = ctx.P; if (!seen(ctx, c.sh, c.el)) return null;
      const down = P[c.hip].v >= ctx.minVis ? sub(P[c.hip], P[c.sh]) : DOWN, hum = sub(P[c.el], P[c.sh]);
      let v = signed(down, hum, ctx.dir); if (v < -90) v += 360;
      return { v, side: s, draw: { at: P[c.sh], r1: down, r2: hum, guide: true } };
    },
  }),
  shoulderAbd: (who, o = {}) => ({
    id: o.id ?? `abd_${who}`, base: 'shoulderAbd', label: 'Abduzione spalla', unit: '°', d: 0, who, ...o,
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], P = ctx.P, oc = CH[other(s)]; if (!seen(ctx, c.sh, c.el, oc.sh)) return null;
      const lateral = Math.sign(P[c.sh].x - P[oc.sh].x) || 1;
      const down = P[c.hip].v >= ctx.minVis ? sub(P[c.hip], P[c.sh]) : DOWN, hum = sub(P[c.el], P[c.sh]);
      let v = signed(down, hum, lateral); if (v < -90) v += 360;
      return { v, side: s, draw: { at: P[c.sh], r1: down, r2: hum, guide: true } };
    },
  }),
  elbow: (who = 'near', o = {}) => ({
    id: o.id ?? (who === 'L' || who === 'R' ? `elbow_${who}` : 'elbow'), base: 'elbow', label: 'Flessione gomito', unit: '°', d: 0, who, ...o,
    f(ctx) { const s = resolve(ctx, who), c = CH[s]; if (!seen(ctx, c.sh, c.el, c.wr)) return null; return { v: flexion(ctx.P[c.sh], ctx.P[c.el], ctx.P[c.wr]), side: s, draw: flexDraw(ctx.P, c.sh, c.el, c.wr) }; },
  }),
  wrist: (who = 'near', o = {}) => ({
    id: o.id ?? 'wrist', base: 'wrist', label: 'Deviazione polso (stima)', unit: '°', d: 0, who, ...o,
    f(ctx) { const s = resolve(ctx, who), c = CH[s]; if (!seen(ctx, c.el, c.wr, c.ix)) return null; return { v: flexion(ctx.P[c.el], ctx.P[c.wr], ctx.P[c.ix]), side: s, draw: flexDraw(ctx.P, c.el, c.wr, c.ix) }; },
  }),
  forearm: (who = 'near', o = {}) => ({
    id: 'forearm', base: 'forearm', label: 'Rotazione: esterna (+), interna (−)', unit: '°', d: 0, who, ...o,
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], P = ctx.P; if (!seen(ctx, c.el, c.wr)) return null;
      const u = sub(P[c.wr], P[c.el]);
      return { v: Math.atan2(-u.y, u.x * ctx.dir) * DEG, side: s, draw: { at: P[c.el], r1: { x: ctx.dir, y: 0 }, r2: u, guide: true } };
    },
  }),
  // Rotazione di spalla vista da davanti, gomito a 90°. L'avambraccio si accorcia quando punta verso la camera:
  // dalla sua lunghezza apparente si stima l'angolo. mode 'side': braccio lungo il fianco; 'abd': braccio a 90° sul piano frontale.
  shoulderRot: (who, mode, o = {}) => ({
    id: `rot_${who}`, base: 'rot', label: 'Rotazione: esterna (+), interna (−)', unit: '°', d: 0, who, ...o,
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], oc = CH[other(s)], P = ctx.P;
      if (!seen(ctx, c.sh, c.el, c.wr, oc.sh)) return null;
      const hum = sub(P[c.el], P[c.sh]), u = sub(P[c.wr], P[c.el]);
      // Lunghezza vera dell'avambraccio: la più lunga vista finora rispetto al braccio (quando è sul piano della camera),
      // almeno l'80% del braccio, che è la proporzione tipica.
      const hl = Math.hypot(hum.x, hum.y), ul = Math.hypot(u.x, u.y), mem = ctx.mem ?? {}, k = `rotRatio_${s}`;
      mem[k] = Math.min(1.05, Math.max(mem[k] ?? 0.8, ul / Math.max(hl, 1e-6)));
      const L = Math.max(hl * mem[k], ul, 1e-6);
      const lateral = Math.sign(P[c.sh].x - P[oc.sh].x) || 1;
      const comp = mode === 'abd' ? -u.y : u.x * lateral;
      const v = Math.asin(Math.max(-1, Math.min(1, comp / L))) * DEG;
      // Quadrante: 0° = avambraccio in avanti, verso la camera
      const r1 = mode === 'abd' ? { x: lateral, y: 0 } : { x: 0, y: 1 };
      const a = v / DEG, r2 = mode === 'abd' ? { x: lateral * Math.cos(a), y: -Math.sin(a) } : { x: lateral * Math.sin(a), y: Math.cos(a) };
      return { v, side: s, draw: { at: P[c.el], r1, r2, guide: true } };
    },
  }),
  armVertical: (who = 'near') => ({
    id: 'armVert', base: 'armVert', label: 'Braccio sulla verticale', unit: '°', d: 0, who, hint: 'Sopra zero: braccia cadute in avanti',
    f(ctx) { const s = resolve(ctx, who), c = CH[s]; if (!seen(ctx, c.sh, c.wr)) return null; return { v: fromVertical(ctx.P[c.sh], ctx.P[c.wr], ctx.dir), side: s, draw: { at: ctx.P[c.sh], r1: UP, r2: sub(ctx.P[c.wr], ctx.P[c.sh]), guide: true } }; },
  }),
  valgus: (who, o = {}) => ({
    id: o.id ?? `valgus_${who}`, base: 'valgus', label: 'Valgo (+), varo (−)', unit: '°', d: 1, who, ...o,
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], P = ctx.P, oc = CH[other(s)]; if (!seen(ctx, c.hip, c.kn, c.an, oc.hip)) return null;
      // In profondità la coscia punta verso la camera: nell'immagine si accorcia e l'angolo non ha più senso.
      if (ctx.leg > 0 && dist(P[c.hip], P[c.kn]) < 0.3 * ctx.leg) return null;
      const medial = Math.sign(P[oc.hip].x - P[c.hip].x) || 1;
      const span = P[c.an].y - P[c.hip].y, u = span ? (P[c.kn].y - P[c.hip].y) / span : 0.5;
      const lineX = P[c.hip].x + (P[c.an].x - P[c.hip].x) * u;
      const v = flexion(P[c.hip], P[c.kn], P[c.an]) * (((P[c.kn].x - lineX) * medial) >= 0 ? 1 : -1);
      return { v, side: s, draw: flexDraw(P, c.hip, c.kn, c.an) };
    },
  }),
  shinFront: (who, o = {}) => ({
    id: o.id ?? `shin_${who}`, base: 'shinFront', label: 'Ginocchio verso l’interno (+)', unit: '°', d: 1, who, hint: 'Inclinazione della tibia vista di fronte; resta valida anche in profondità', ...o,
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], P = ctx.P, oc = CH[other(s)]; if (!seen(ctx, c.kn, c.an, oc.hip, c.hip)) return null;
      const medial = Math.sign(P[oc.hip].x - P[c.hip].x) || 1;
      return { v: fromVertical(P[c.an], P[c.kn], medial), side: s, draw: { at: P[c.an], r1: UP, r2: sub(P[c.kn], P[c.an]), guide: true } };
    },
  }),
  kneeAnkle: () => ({
    id: 'kneeAnkle', base: 'kneeAnkle', label: 'Ginocchia su caviglie', unit: '%', d: 0, quiet: true, hint: 'Sotto 100: ginocchia più strette delle caviglie',
    f(ctx) { const P = ctx.P; if (!seen(ctx, 25, 26, 27, 28)) return null; const a = Math.abs(P[27].x - P[28].x); if (a < 1e-3) return null; return { v: Math.abs(P[25].x - P[26].x) / a * 100 }; },
  }),
  pelvisTilt: (o = {}) => ({
    id: 'pelvis', base: 'pelvis', label: 'Bacino: destra più bassa (+)', unit: '°', d: 1, quiet: true, ...o,
    f(ctx) { const P = ctx.P; if (!seen(ctx, 23, 24)) return null; return { v: Math.atan2(P[24].y - P[23].y, Math.abs(P[24].x - P[23].x) || 1e-6) * DEG - (ctx.baseTilt ?? 0) }; },
  }),
  shoulderTilt: () => ({
    id: 'shTilt', base: 'shTilt', label: 'Spalle: destra più bassa (+)', unit: '°', d: 1, quiet: true,
    f(ctx) { const P = ctx.P; if (!seen(ctx, 11, 12)) return null; return { v: Math.atan2(P[12].y - P[11].y, Math.abs(P[12].x - P[11].x) || 1e-6) * DEG }; },
  }),
  trunkLateral: () => ({
    id: 'trunkLat', base: 'trunkLat', label: 'Tronco: verso destra (+)', unit: '°', d: 1, quiet: true,
    f(ctx) { const P = ctx.P; if (!seen(ctx, 11, 12, 23, 24)) return null; const sign = Math.sign(P[24].x - P[23].x) || 1; return { v: fromVertical(mid(P[23], P[24]), mid(P[11], P[12]), sign) }; },
  }),
  hipShift: () => ({
    id: 'hipShift', base: 'hipShift', label: 'Bacino spostato a destra (+)', unit: '%', d: 0, quiet: true, hint: 'Rispetto alla distanza tra le caviglie',
    f(ctx) { const P = ctx.P; if (!seen(ctx, 23, 24, 27, 28)) return null; const a = Math.abs(P[27].x - P[28].x); if (a < 1e-3) return null; const sign = Math.sign(P[24].x - P[23].x) || 1; return { v: ((P[23].x + P[24].x) / 2 - (P[27].x + P[28].x) / 2) * sign / a * 100 }; },
  }),
  pelvicDrop: (who = 'work') => ({
    id: 'drop', base: 'drop', label: 'Caduta bacino controlaterale', unit: '°', d: 1, quiet: true, who,
    f(ctx) { const s = resolve(ctx, who), c = CH[s], oc = CH[other(s)], P = ctx.P; if (!seen(ctx, c.hip, oc.hip)) return null; return { v: Math.atan2(P[oc.hip].y - P[c.hip].y, Math.abs(P[oc.hip].x - P[c.hip].x) || 1e-6) * DEG - (s === 'L' ? (ctx.baseTilt ?? 0) : -(ctx.baseTilt ?? 0)), side: s }; },
  }),
  descent: () => ({
    id: 'descent', base: 'descent', label: 'Discesa del bacino', unit: '% gamba', d: 0, quiet: true,
    f(ctx) { const P = ctx.P; if (!seen(ctx, 23, 24) || !(ctx.leg > 0) || ctx.topY == null) return null; return { v: ((P[23].y + P[24].y) / 2 - ctx.topY) / ctx.leg * 100 }; },
  }),
  wristDiff: () => ({
    id: 'wristDiff', base: 'wristDiff', label: 'Differenza altezza polsi', unit: '% braccio', d: 0, quiet: true,
    f(ctx) { const P = ctx.P; if (!seen(ctx, 15, 16, 11, 13)) return null; const arm = dist(P[11], P[13]) + dist(P[13], P[15]); return { v: Math.abs(P[15].y - P[16].y) / (arm || 1) * 100 }; },
  }),
  // Media della flessione dei due gomiti: guida il conteggio quando le braccia lavorano insieme.
  elbowAvg: (o = {}) => ({
    id: 'elbowAvg', base: 'elbowAvg', label: 'Flessione gomiti, media', unit: '°', d: 0, quiet: true, ...o,
    f(ctx) {
      const P = ctx.P, vals = [];
      for (const s of ['L', 'R']) { const c = CH[s]; if (seen(ctx, c.sh, c.el, c.wr)) vals.push(flexion(P[c.sh], P[c.el], P[c.wr])); }
      return vals.length ? { v: vals.reduce((a, b) => a + b, 0) / vals.length } : null;
    },
  }),
  // Mento rispetto alle mani, in percentuale della lunghezza del braccio: positivo con il mento sopra.
  chinBar: (o = {}) => ({
    id: 'chinBar', base: 'chinBar', label: 'Mento sopra le mani', unit: '% braccio', d: 0, quiet: true, hint: 'Sopra zero: il mento supera l’altezza delle mani', ...o,
    f(ctx) {
      const P = ctx.P; if (P[0].v < ctx.minVis) return null;
      const ws = [15, 16].filter((i) => P[i].v >= ctx.minVis); if (!ws.length) return null;
      const c = P[11].v >= P[12].v ? CH.L : CH.R, arm = dist(P[c.sh], P[c.el]) + dist(P[c.el], P[c.wr]);
      const wy = ws.reduce((a, i) => a + P[i].y, 0) / ws.length;
      return { v: (wy - P[0].y) / (arm || 1) * 100 };
    },
  }),
  // Barra (stimata dai polsi) davanti al centro del piede, di lato: positivo se è più avanti.
  barFoot: (who = 'work') => ({
    id: 'barFoot', base: 'barFoot', label: 'Barra davanti al centro del piede', unit: '% gamba', d: 0, who, hint: 'Vicino a zero: barra sopra il centro del piede',
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], P = ctx.P; if (!seen(ctx, c.wr, c.he, c.to) || !(ctx.leg > 0)) return null;
      const foot = (P[c.he].x + P[c.to].x) / 2;
      return { v: (P[c.wr].x - foot) * ctx.dir / ctx.leg * 100, side: s };
    },
  }),
  shoulderBar: (who = 'work') => ({
    id: 'shoulderBar', base: 'shoulderBar', label: 'Spalle davanti alla barra', unit: '% gamba', d: 0, who, quiet: true, hint: 'Sotto zero: spalle dietro la barra',
    f(ctx) { const s = resolve(ctx, who), c = CH[s], P = ctx.P; if (!seen(ctx, c.sh, c.wr) || !(ctx.leg > 0)) return null; return { v: (P[c.sh].x - P[c.wr].x) * ctx.dir / ctx.leg * 100, side: s }; },
  }),
  // Angolo tra tronco e braccio visto di lato, alla spalla: nella panca e nei piegamenti stima quanto sono aperti i gomiti.
  armTrunk: (who = 'near', o = {}) => ({
    id: 'armTrunk', base: 'armTrunk', label: 'Braccio rispetto al tronco', unit: '°', d: 0, who, hint: 'Valori alti: gomiti aperti, lontani dal corpo', ...o,
    f(ctx) { const s = resolve(ctx, who), c = CH[s], P = ctx.P; if (!seen(ctx, c.sh, c.el, c.hip)) return null; return { v: 180 - flexion(P[c.hip], P[c.sh], P[c.el]), side: s, draw: { at: P[c.sh], r1: sub(P[c.hip], P[c.sh]), r2: sub(P[c.el], P[c.sh]) } }; },
  }),
  // Avambraccio rispetto alla verticale, di lato. Positivo con il polso verso la testa.
  forearmVert: (who = 'near') => ({
    id: 'forearmVert', base: 'forearmVert', label: 'Avambraccio sulla verticale', unit: '°', d: 0, who, hint: 'Vicino a zero: polso sopra il gomito; sopra zero: polso verso la testa',
    f(ctx) {
      const s = resolve(ctx, who), c = CH[s], P = ctx.P; if (!seen(ctx, c.el, c.wr, c.sh, c.hip)) return null;
      const hs = Math.sign(P[c.sh].x - P[c.hip].x) || 1, E = P[c.el], W = P[c.wr];
      return { v: Math.atan2((W.x - E.x) * hs, E.y - W.y) * DEG, side: s, draw: { at: E, r1: UP, r2: sub(W, E), guide: true } };
    },
  }),
  forearmFront: (who, o = {}) => ({
    id: `forearmFront_${who}`, base: 'forearmFront', label: 'Polso fuori dal gomito (+)', unit: '°', d: 0, who, quiet: true, hint: 'Avambraccio rispetto alla verticale; sopra zero il polso è più largo del gomito', ...o,
    f(ctx) {
      const s = who, c = CH[s], oc = CH[other(s)], P = ctx.P; if (!seen(ctx, c.el, c.wr, c.sh, oc.sh)) return null;
      const lateral = Math.sign(P[c.sh].x - P[oc.sh].x) || 1;
      return { v: Math.atan2((P[c.wr].x - P[c.el].x) * lateral, P[c.el].y - P[c.wr].y) * DEG, side: s };
    },
  }),
  // Anca rispetto alla linea spalla-ginocchio o spalla-caviglia, in percentuale della gamba: positivo se più in alto.
  bodyLine: (to = 'ankle', o = {}) => ({
    id: 'bodyLine', base: 'bodyLine', label: to === 'ankle' ? 'Bacino rispetto alla linea spalla-caviglia' : 'Bacino rispetto alla linea spalla-ginocchio', unit: '% gamba', d: 0, quiet: true, hint: 'Sopra zero: bacino più alto della linea', ...o,
    f(ctx) {
      const s = ctx.near, c = CH[s], P = ctx.P, end = to === 'ankle' ? c.an : c.kn; if (!seen(ctx, c.sh, c.hip, end)) return null;
      const A = P[c.sh], B = P[end], H = P[c.hip], L = dist(A, B) || 1, leg = ctx.leg > 0 ? ctx.leg : dist(P[c.hip], P[c.an]) || 1;
      let d = ((B.x - A.x) * (H.y - A.y) - (B.y - A.y) * (H.x - A.x)) / L; // con segno: verso dipende dall'ordine dei punti
      if (B.x < A.x) d = -d;
      return { v: -d / leg * 100 };
    },
  }),
  custom: (a, b, c, ref = null, o = {}) => ({
    id: 'custom', base: 'custom', label: o.label ?? 'Angolo scelto', unit: '°', d: 0, ...o,
    f(ctx) {
      const P = ctx.P;
      if (ref) {
        if (P[a].v < ctx.minVis || P[b].v < ctx.minVis) return null;
        const r1 = ref === 'v' ? UP : { x: Math.sign(P[b].x - P[a].x) || 1, y: 0 }, r2 = sub(P[b], P[a]);
        const cos = (r1.x * r2.x + r1.y * r2.y) / (hyp(r1) * hyp(r2) || 1);
        return { v: Math.acos(Math.max(-1, Math.min(1, cos))) * DEG, draw: { at: P[a], r1, r2, guide: true } };
      }
      if (P[a].v < ctx.minVis || P[b].v < ctx.minVis || P[c].v < ctx.minVis) return null;
      return { v: 180 - flexion(P[a], P[b], P[c]), draw: { at: P[b], r1: sub(P[a], P[b]), r2: sub(P[c], P[b]) } };
    },
  }),
};

/* ---------- esercizi ---------- */
const squatSide = (o = {}) => ({
  metrics: [M.knee('work'), M.hip('work'), M.tibia('work'), M.trunk(), M.thigh('work'), M.trunkTibia('work'), ...(o.extra ?? [])],
  primary: 'knee', driver: 'knee', minRange: 25, legPick: o.legPick ?? 'near', goalLabel: 'Flessione ginocchio', peakName: 'Punto più basso', startName: 'Posizione alta',
});
const squatFront = (o = {}) => ({
  metrics: [M.shinFront('L'), M.shinFront('R'), M.valgus('L', { quiet: true }), M.valgus('R', { quiet: true }), M.kneeAnkle(), M.pelvisTilt(), M.shoulderTilt(), M.trunkLateral(), M.hipShift(), M.descent(), ...(o.extra ?? [])],
  primary: 'shin_L', second: 'shin_R', driver: 'descent', minRange: 12, peakName: 'Punto più basso', startName: 'Posizione alta',
});
const unilateralFront = () => ({
  metrics: [M.valgus('work', { id: 'valgus', label: 'Valgo (+), varo (−), gamba di lavoro' }), M.shinFront('work', { id: 'shin', quiet: true }), M.pelvicDrop('work'), M.trunkLateral(), M.shoulderTilt(), M.descent()],
  primary: 'valgus', driver: 'descent', minRange: 8, legPick: 'lower', peakName: 'Punto più basso', startName: 'Posizione alta',
});
const shoulderExtra = [M.trunk({ label: 'Compenso del tronco' })];
export const PROTOCOLS = [
  { id: 'squat', group: 'squat', name: 'Squat a corpo libero', hint: 'Il riferimento per valutare profondità e allineamento.', path: 'hip', sim: 'squat', views: { side: squatSide(), front: squatFront(), rear: squatFront() } },
  { id: 'highbar', group: 'squat', name: 'Back squat, barra alta', hint: 'La traccia segue le spalle come stima della barra.', path: 'shoulders', sim: 'squat', load: true, views: { side: squatSide(), front: squatFront(), rear: squatFront() } },
  { id: 'lowbar', group: 'squat', name: 'Back squat, barra bassa', hint: 'Di solito tronco più inclinato e tibia più verticale.', path: 'shoulders', sim: 'squat', load: true, views: { side: squatSide(), rear: squatFront() } },
  { id: 'frontsquat', group: 'squat', name: 'Front squat', hint: 'Controlla il tronco e l’avanzamento del ginocchio.', path: 'shoulders', sim: 'squat', load: true, views: { side: squatSide(), front: squatFront(), rear: squatFront() } },
  { id: 'goblet', group: 'squat', name: 'Goblet squat', hint: 'Il peso può coprire polsi e gomiti, non le gambe.', path: 'hip', sim: 'squat', load: true, views: { side: squatSide(), front: squatFront(), rear: squatFront() } },
  { id: 'sumo', group: 'squat', name: 'Sumo squat', hint: 'Meglio la vista frontale, con i piedi larghi e extraruotati.', path: 'hip', sim: 'squat', load: true, views: { front: squatFront(), rear: squatFront(), side: squatSide() } },
  { id: 'box', group: 'squat', name: 'Box squat', hint: 'Il box può coprire le anche di lato: lascialo basso nell’inquadratura.', path: 'hip', sim: 'squat', load: true, views: { side: squatSide(), front: squatFront(), rear: squatFront() } },
  { id: 'overhead', group: 'squat', name: 'Overhead squat', hint: 'Valuta mobilità di spalle, anche e caviglie insieme.', path: 'wrists', sim: 'overhead', views: { side: squatSide({ extra: [M.armVertical('near')] }), front: squatFront({ extra: [M.shoulderAbd('L', { quiet: true }), M.shoulderAbd('R', { quiet: true }), M.wristDiff()] }), rear: squatFront({ extra: [M.shoulderAbd('L', { quiet: true }), M.shoulderAbd('R', { quiet: true }), M.wristDiff()] }) } },
  { id: 'single', group: 'squat', name: 'Squat monopodalico', hint: 'La gamba di lavoro è quella con il piede più basso.', path: 'hip', sim: 'single', views: { front: unilateralFront(), rear: unilateralFront(), side: squatSide({ legPick: 'lower' }) } },
  { id: 'split', group: 'squat', name: 'Split squat', hint: 'Da dietro ginocchio e bacino, di lato la profondità.', path: 'hip', sim: 'lunge', load: true, views: { side: squatSide({ legPick: 'front', extra: [M.knee('rest', { id: 'kneeRest', label: 'Ginocchio gamba dietro', quiet: true })] }), front: { ...unilateralFront(), legPick: 'select' }, rear: { ...unilateralFront(), legPick: 'select' } } },
  { id: 'bulgarian', group: 'squat', name: 'Bulgarian split squat', hint: 'Di lato misura la gamba avanti, con il piede dietro in appoggio.', path: 'hip', sim: 'lunge', load: true, views: { side: squatSide({ legPick: 'front', extra: [M.knee('rest', { id: 'kneeRest', label: 'Ginocchio gamba dietro', quiet: true })] }), front: unilateralFront(), rear: unilateralFront() } },
  { id: 'lunge', group: 'squat', name: 'Affondo', hint: 'Da dietro ginocchio e bacino, di lato la profondità. Indica la gamba davanti.', path: 'hip', sim: 'lunge', load: true, views: { side: squatSide({ legPick: 'front', extra: [M.knee('rest', { id: 'kneeRest', label: 'Ginocchio gamba dietro', quiet: true })] }), front: { ...unilateralFront(), legPick: 'select' }, rear: { ...unilateralFront(), legPick: 'select' } } },

  { id: 'flex', group: 'arm', name: 'Flessione di spalla', hint: 'Camera di lato. Misura il braccio più vicino alla camera.', path: 'wrists', sim: 'flex', views: { side: { metrics: [M.shoulderSag('near'), M.elbow('near', { quiet: true }), ...shoulderExtra], primary: 'shoulder', driver: 'shoulder', minRange: 25, peakName: 'Massima flessione', startName: 'Braccio lungo il corpo' } } },
  { id: 'ext', group: 'arm', name: 'Estensione di spalla', hint: 'Camera di lato. Il valore è negativo quando il braccio va indietro.', path: 'wrists', sim: 'ext', views: { side: { metrics: [M.shoulderSag('near'), M.elbow('near', { quiet: true }), ...shoulderExtra], primary: 'shoulder', driver: 'shoulder', driverSign: -1, minRange: 12, peakName: 'Massima estensione', startName: 'Braccio lungo il corpo' } } },
  { id: 'abd', group: 'arm', name: 'Abduzione di spalla', hint: 'Camera davanti o dietro. Misura destra e sinistra insieme.', path: 'wrists', sim: 'abd', views: { front: abdView(), rear: abdView() } },
  { id: 'rot0', group: 'arm', name: 'Rotazione di spalla, braccio lungo il corpo', hint: 'Camera davanti, all’altezza delle spalle. Inizia con le braccia distese lungo i fianchi per un secondo, poi piega i gomiti a 90° con gli avambracci in avanti e ruota verso l’esterno e verso l’interno. Misura destra e sinistra insieme.', estimate: true, path: 'wrists', sim: 'rot0', views: { front: rotView('side'), rear: rotView('side') } },
  { id: 'rot90', group: 'arm', name: 'Rotazione di spalla a 90° di abduzione', hint: 'Camera davanti, all’altezza delle spalle. Apri le braccia a 90° sul piano frontale e tienile distese per un secondo, poi piega i gomiti a 90° con gli avambracci in avanti: verso l’alto è rotazione esterna, verso il basso interna.', estimate: true, path: 'wrists', sim: 'rot90', views: { front: rotView('abd'), rear: rotView('abd') } },
  { id: 'rot', hidden: true, group: 'arm', name: 'Rotazione di spalla a 90°, di lato', hint: 'Spalla e gomito a 90°, camera di lato. Stima: il gomito è vicino alla spalla nell’immagine.', estimate: true, path: 'wrists', sim: 'rot', views: { side: { metrics: [M.forearm('near'), M.elbow('near', { quiet: true })], primary: 'forearm', driver: 'forearm', minRange: 20, peakName: 'Massima rotazione esterna', startName: 'Avambraccio orizzontale' } } },
  { id: 'elbow', group: 'arm', name: 'Flessione di gomito', hint: 'Di lato misura il braccio vicino, di fronte entrambi.', path: 'wrists', sim: 'elbow', load: true, views: { side: { metrics: [M.elbow('near'), M.shoulderSag('near', { label: 'Braccio rispetto al tronco', quiet: true }), M.trunk({ label: 'Compenso del tronco', quiet: true })], primary: 'elbow', driver: 'elbow', minRange: 30, peakName: 'Massima flessione', startName: 'Gomito esteso' }, front: elbowFront(), rear: elbowFront() } },
  { id: 'press', group: 'arm', name: 'Press sopra la testa', hint: 'Camera davanti o dietro: gomiti, altezza delle braccia e simmetria.', path: 'wrists', sim: 'press', load: true, views: { front: pressView(), rear: pressView() } },
  { id: 'wrist', group: 'arm', name: 'Polso', hint: 'Stima: i punti della mano sono poco precisi. Avvicina la camera.', estimate: true, path: null, sim: 'wrist', views: { side: { metrics: [M.wrist('near'), M.elbow('near', { quiet: true })], primary: 'wrist', driver: 'wrist', minRange: 15, peakName: 'Massima deviazione', startName: 'Polso allineato' } } },
];
/* ---------- stacco, panca, trazioni ---------- */
const hingeSide = (o = {}) => ({
  metrics: [M.hip('work'), M.knee('work'), M.trunk(), M.tibia('work', { quiet: true }), M.thigh('work'), M.barFoot('work'), M.shoulderBar('work'), ...(o.extra ?? [])],
  primary: 'hip', driver: 'hip', minRange: 30, legPick: o.legPick ?? 'near', peakName: o.peakName ?? 'Posizione bassa', startName: 'In piedi, a fine tirata',
});
const hingeFront = () => ({ ...squatFront({ extra: [M.wristDiff()] }), minRange: 6, peakName: 'Posizione bassa', startName: 'In piedi, a fine tirata' });
const pressSide = (o = {}) => ({
  metrics: [M.elbow('near'), M.armTrunk('near'), ...(o.forearm === false ? [] : [M.forearmVert('near')]), M.bodyLine(o.line ?? 'knee'), ...(o.extra ?? [])],
  primary: 'elbow', driver: 'elbow', minRange: 30, peakName: o.peakName ?? 'Barra al petto', startName: 'Braccia distese',
});
const pressFeet = () => ({
  metrics: [M.elbow('L'), M.elbow('R'), M.elbowAvg(), M.forearmFront('L'), M.forearmFront('R'), M.wristDiff()],
  primary: 'elbow_L', second: 'elbow_R', driver: 'elbowAvg', minRange: 30, peakName: 'Barra al petto', startName: 'Braccia distese',
});
const pullFront = () => ({
  metrics: [M.elbow('L'), M.elbow('R'), M.elbowAvg(), M.chinBar(), M.shoulderTilt(), M.trunkLateral(), M.wristDiff()],
  primary: 'elbow_L', second: 'elbow_R', driver: 'elbowAvg', minRange: 40, peakName: 'In alto', startName: 'Appeso a braccia distese',
});
const pullSide = () => ({
  metrics: [M.elbow('near'), M.chinBar(), M.trunk({ label: 'Corpo sulla verticale', quiet: true }), M.hip('near', { quiet: true, label: 'Flessione anca, gambe in avanti' })],
  primary: 'elbow', driver: 'elbow', minRange: 40, peakName: 'In alto', startName: 'Appeso a braccia distese',
});
const BENCH_LABELS = { side: 'Laterale, all’altezza della panca', front: 'Ai piedi della panca' };
const LIFT = [
  { id: 'deadlift', family: 'deadlift', name: 'Stacco da terra', hint: 'Di lato: percorso della barra, anche e schiena. Da dietro: simmetria.', path: 'wrists', sim: 'deadlift', load: true, defaultView: 'side', views: { side: hingeSide(), rear: hingeFront(), front: hingeFront() } },
  { id: 'sumodl', family: 'deadlift', name: 'Stacco sumo', hint: 'Piedi larghi: di lato la barra, da davanti o da dietro le ginocchia.', path: 'wrists', sim: 'sumodl', load: true, defaultView: 'side', views: { side: hingeSide(), front: hingeFront(), rear: hingeFront() } },
  { id: 'trapbar', family: 'deadlift', name: 'Stacco con trap bar', hint: 'Busto più dritto e ginocchia più piegate dello stacco classico.', path: 'wrists', sim: 'trapbar', load: true, defaultView: 'side', views: { side: hingeSide(), rear: hingeFront(), front: hingeFront() } },
  { id: 'rdl', family: 'rdl', name: 'Stacco rumeno', hint: 'Si piega dalle anche con le ginocchia poco flesse: riprendi di lato.', path: 'wrists', sim: 'rdl', load: true, defaultView: 'side', views: { side: hingeSide(), rear: hingeFront() } },
  { id: 'stiff', family: 'rdl', name: 'Stacco a gambe tese', hint: 'Ginocchia quasi tese: conta la mobilità della parte posteriore della coscia.', path: 'wrists', sim: 'stiff', load: true, defaultView: 'side', views: { side: hingeSide(), rear: hingeFront() } },
  { id: 'slrdl', family: 'slrdl', name: 'Stacco rumeno su una gamba', hint: 'Di lato misura la gamba d’appoggio, quella con il piede a terra.', path: 'wrists', sim: 'slrdl', load: true, defaultView: 'side',
    views: { side: { metrics: [M.trunk({ label: 'Busto sulla verticale' }), M.knee('work', { label: 'Ginocchio d’appoggio' }), M.hip('work')], primary: 'trunk', driver: 'trunk', minRange: 30, legPick: 'lower', peakName: 'Posizione bassa', startName: 'In piedi' } } },
  { id: 'bench', family: 'bench', name: 'Panca piana', hint: 'Camera di lato all’altezza della panca, oppure ai piedi della panca per la simmetria.', path: 'wrists', sim: 'bench', load: true, defaultView: 'side', viewLabels: BENCH_LABELS, views: { side: pressSide(), front: pressFeet() } },
  { id: 'incline', family: 'bench', name: 'Panca inclinata', hint: 'Di lato: gomiti, avambracci e percorso della barra.', path: 'wrists', sim: 'bench', load: true, defaultView: 'side', viewLabels: BENCH_LABELS, views: { side: pressSide(), front: pressFeet() } },
  { id: 'closegrip', family: 'bench', name: 'Panca presa stretta', hint: 'Gomiti più vicini al corpo della panca classica.', path: 'wrists', sim: 'bench', load: true, defaultView: 'side', viewLabels: BENCH_LABELS, views: { side: pressSide(), front: pressFeet() } },
  { id: 'dbbench', family: 'bench', name: 'Distensioni con manubri', hint: 'Ai piedi della panca si vede se un braccio scende o sale diversamente.', path: 'wrists', sim: 'bench', load: true, defaultView: 'side', viewLabels: BENCH_LABELS, views: { side: pressSide(), front: pressFeet() } },
  { id: 'pushup', family: 'pushup', name: 'Piegamenti sulle braccia', hint: 'Di lato, a terra: linea del corpo, gomiti e profondità.', path: 'shoulders', sim: 'pushup', defaultView: 'side', views: { side: pressSide({ line: 'ankle', forearm: false, peakName: 'Petto in basso' }) } },
  { id: 'pullup', family: 'pull', name: 'Trazioni, presa prona', hint: 'Da dietro: simmetria e spalle. Di lato: slancio del corpo.', path: 'shoulders', sim: 'pull', load: true, defaultView: 'rear', views: { rear: pullFront(), front: pullFront(), side: pullSide() } },
  { id: 'chinup', family: 'pull', name: 'Trazioni, presa supina', hint: 'Palmi verso di sé: lavora di più il bicipite.', path: 'shoulders', sim: 'pull', load: true, defaultView: 'rear', views: { rear: pullFront(), front: pullFront(), side: pullSide() } },
  { id: 'neutral', family: 'pull', name: 'Trazioni, presa neutra', hint: 'Palmi uno verso l’altro.', path: 'shoulders', sim: 'pull', load: true, defaultView: 'rear', views: { rear: pullFront(), front: pullFront(), side: pullSide() } },
  { id: 'latpull', family: 'latpull', name: 'Lat machine', hint: 'Seduto: da dietro la simmetria, di lato quanto si inclina il busto.', path: 'shoulders', sim: 'pull', load: true, defaultView: 'rear', views: { rear: pullFront(), front: pullFront(), side: pullSide() } },
  { id: 'row', family: 'row', name: 'Rematore con bilanciere', hint: 'Di lato: busto fermo e gomiti che tirano indietro.', path: 'wrists', sim: 'row', load: true, defaultView: 'side',
    views: { side: { metrics: [M.elbow('near'), M.trunk({ label: 'Busto sulla verticale' }), M.shoulderSag('near', { label: 'Braccio rispetto al tronco', quiet: true }), M.knee('near', { quiet: true })], primary: 'elbow', driver: 'elbow', minRange: 35, peakName: 'Gomiti indietro', startName: 'Braccia distese' } } },
].map((p) => ({ ...p, group: 'lift' }));
PROTOCOLS.push(...LIFT);
function abdView() {
  return { metrics: [M.shoulderAbd('L'), M.shoulderAbd('R'), M.elbow('L', { quiet: true }), M.elbow('R', { quiet: true }), M.trunkLateral(), M.shoulderTilt()], primary: 'abd_L', second: 'abd_R', perSide: { L: 'abd_L', R: 'abd_R' }, minRange: 25, peakName: 'Massima abduzione', startName: 'Braccia lungo il corpo' };
}
function rotView(mode) {
  return { metrics: [M.shoulderRot('L', mode), M.shoulderRot('R', mode), M.elbow('L', { quiet: true }), M.elbow('R', { quiet: true }), M.trunkLateral(), M.shoulderTilt()], primary: 'rot_L', second: 'rot_R', perSide: { L: 'rot_L', R: 'rot_R' }, minRange: 20, rotMode: mode, peakName: 'Massima rotazione esterna', startName: 'Avambracci in avanti' };
}
function elbowFront() {
  return { metrics: [M.elbow('L'), M.elbow('R'), M.trunkLateral(), M.wristDiff()], primary: 'elbow_L', second: 'elbow_R', perSide: { L: 'elbow_L', R: 'elbow_R' }, minRange: 30, peakName: 'Massima flessione', startName: 'Gomito esteso' };
}
function pressView() {
  return { metrics: [M.shoulderAbd('L', { label: 'Elevazione braccio' }), M.shoulderAbd('R', { label: 'Elevazione braccio' }), M.elbow('L', { quiet: true }), M.elbow('R', { quiet: true }), M.wristDiff(), M.trunkLateral(), M.shoulderTilt()], primary: 'abd_L', second: 'abd_R', perSide: { L: 'abd_L', R: 'abd_R' }, minRange: 25, peakName: 'Braccia in alto', startName: 'Posizione bassa' };
}
export const customProtocol = (a, b, c, ref) => ({
  id: 'custom', group: 'custom', name: 'Angolo personalizzato', hint: 'Tocca tre punti di repere sull’immagine.', path: null, custom: true, spec: { a, b, c, ref }, sim: 'flex',
  views: { side: customView(a, b, c, ref), front: customView(a, b, c, ref), rear: customView(a, b, c, ref) },
});
function customView(a, b, c, ref) {
  return { metrics: [M.custom(a, b, c, ref)], primary: 'custom', driver: 'custom', minRange: 15, peakName: 'Valore massimo', startName: 'Valore minimo', noFilterSides: true };
}
// Movimenti in cui lavora un arto alla volta: si può scegliere il lato, oppure entrambi alternati.
export function unilateral(p, view) {
  if (!p || p.custom) return false;
  const spec = p.views?.[view];
  if (!spec || spec.perSide) return false;
  if (['select', 'lower', 'front'].includes(spec.legPick) || p.family === 'slrdl') return true;
  return p.group === 'arm' && view === 'side';
}
export const protocolById = (id, spec) => (id === 'custom' ? customProtocol(spec?.a ?? 23, spec?.b ?? 25, spec?.c ?? 27, spec?.ref ?? null) : PROTOCOLS.find((p) => p.id === id));
export const VIEW_NAMES = { side: 'Laterale', front: 'Frontale', rear: 'Posteriore' };
export const VIEW_ORDER = ['rear', 'front', 'side'];
export const defaultView = (p) => (p.defaultView && p.views[p.defaultView] ? p.defaultView : p.group === 'squat' && p.views.rear ? 'rear' : Object.keys(p.views)[0]);
export const viewList = (p) => VIEW_ORDER.filter((v) => p.views[v]);
// Le sei scelte della pagina iniziale.
export const CATEGORIES = [
  { id: 'squat', name: 'Squat', text: 'Squat, affondi e lavoro su una gamba', match: (p) => p.group === 'squat' },
  { id: 'panca', name: 'Panca', text: 'Panca, distensioni e piegamenti', match: (p) => p.family === 'bench' || p.family === 'pushup' },
  { id: 'stacco', name: 'Stacco', text: 'Stacco da terra e varianti', match: (p) => ['deadlift', 'rdl', 'slrdl'].includes(p.family) },
  { id: 'trazioni', name: 'Trazioni', text: 'Trazioni, lat machine e rematore', match: (p) => ['pull', 'latpull', 'row'].includes(p.family) },
  { id: 'arti', name: 'Arti superiori', text: 'Spalla, gomito e polso: mobilità', match: (p) => p.group === 'arm' },
  { id: 'altri', name: 'Altri angoli', text: 'Qualsiasi angolo tra tre punti che tocchi sull’immagine', match: () => false, custom: true },
];
export const categoryOf = (p) => (p?.custom ? CATEGORIES.at(-1) : CATEGORIES.find((c) => c.match(p)));
export const metricLabel = (m, side) => (side ? `${m.label} ${sideName(side)}` : m.label);
