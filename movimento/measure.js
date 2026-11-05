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
  { id: 'frontsquat', group: 'squat', name: 'Front squat', hint: 'Controlla il tronco e l’avanzamento del ginocchio.', path: 'shoulders', sim: 'squat', load: true, views: { side: squatSide(), front: squatFront() } },
  { id: 'goblet', group: 'squat', name: 'Goblet squat', hint: 'Il peso può coprire polsi e gomiti, non le gambe.', path: 'hip', sim: 'squat', load: true, views: { side: squatSide(), front: squatFront() } },
  { id: 'sumo', group: 'squat', name: 'Sumo squat', hint: 'Meglio la vista frontale, con i piedi larghi e extraruotati.', path: 'hip', sim: 'squat', load: true, views: { front: squatFront(), rear: squatFront(), side: squatSide() } },
  { id: 'box', group: 'squat', name: 'Box squat', hint: 'Il box può coprire le anche di lato: lascialo basso nell’inquadratura.', path: 'hip', sim: 'squat', load: true, views: { side: squatSide(), front: squatFront() } },
  { id: 'overhead', group: 'squat', name: 'Overhead squat', hint: 'Valuta mobilità di spalle, anche e caviglie insieme.', path: 'wrists', sim: 'overhead', views: { side: squatSide({ extra: [M.armVertical('near')] }), front: squatFront({ extra: [M.shoulderAbd('L', { quiet: true }), M.shoulderAbd('R', { quiet: true }), M.wristDiff()] }) } },
  { id: 'single', group: 'squat', name: 'Squat monopodalico', hint: 'La gamba di lavoro è quella con il piede più basso.', path: 'hip', sim: 'single', views: { front: unilateralFront(), rear: unilateralFront(), side: squatSide({ legPick: 'lower' }) } },
  { id: 'split', group: 'squat', name: 'Split squat', hint: 'Di lato misura la gamba avanti.', path: 'hip', sim: 'lunge', load: true, views: { side: squatSide({ legPick: 'front', extra: [M.knee('rest', { id: 'kneeRest', label: 'Ginocchio gamba dietro', quiet: true })] }), front: { ...unilateralFront(), legPick: 'select' } } },
  { id: 'bulgarian', group: 'squat', name: 'Bulgarian split squat', hint: 'Di lato misura la gamba avanti, con il piede dietro in appoggio.', path: 'hip', sim: 'lunge', load: true, views: { side: squatSide({ legPick: 'front', extra: [M.knee('rest', { id: 'kneeRest', label: 'Ginocchio gamba dietro', quiet: true })] }), front: unilateralFront() } },
  { id: 'lunge', group: 'squat', name: 'Affondo', hint: 'Riprendi di lato. Scegli la gamba davanti per la vista frontale.', path: 'hip', sim: 'lunge', load: true, views: { side: squatSide({ legPick: 'front', extra: [M.knee('rest', { id: 'kneeRest', label: 'Ginocchio gamba dietro', quiet: true })] }), front: { ...unilateralFront(), legPick: 'select' } } },

  { id: 'flex', group: 'arm', name: 'Flessione di spalla', hint: 'Camera di lato. Misura il braccio più vicino alla camera.', path: 'wrists', sim: 'flex', views: { side: { metrics: [M.shoulderSag('near'), M.elbow('near', { quiet: true }), ...shoulderExtra], primary: 'shoulder', driver: 'shoulder', minRange: 25, peakName: 'Massima flessione', startName: 'Braccio lungo il corpo' } } },
  { id: 'ext', group: 'arm', name: 'Estensione di spalla', hint: 'Camera di lato. Il valore è negativo quando il braccio va indietro.', path: 'wrists', sim: 'ext', views: { side: { metrics: [M.shoulderSag('near'), M.elbow('near', { quiet: true }), ...shoulderExtra], primary: 'shoulder', driver: 'shoulder', driverSign: -1, minRange: 12, peakName: 'Massima estensione', startName: 'Braccio lungo il corpo' } } },
  { id: 'abd', group: 'arm', name: 'Abduzione di spalla', hint: 'Camera davanti o dietro. Misura destra e sinistra insieme.', path: 'wrists', sim: 'abd', views: { front: abdView(), rear: abdView() } },
  { id: 'rot', group: 'arm', name: 'Rotazione di spalla a 90°', hint: 'Spalla e gomito a 90°, camera di lato. Stima: il gomito è vicino alla spalla nell’immagine.', estimate: true, path: 'wrists', sim: 'rot', views: { side: { metrics: [M.forearm('near'), M.elbow('near', { quiet: true })], primary: 'forearm', driver: 'forearm', minRange: 20, peakName: 'Massima rotazione esterna', startName: 'Avambraccio orizzontale' } } },
  { id: 'elbow', group: 'arm', name: 'Flessione di gomito', hint: 'Di lato misura il braccio vicino, di fronte entrambi.', path: 'wrists', sim: 'elbow', load: true, views: { side: { metrics: [M.elbow('near'), M.shoulderSag('near', { label: 'Braccio rispetto al tronco', quiet: true }), M.trunk({ label: 'Compenso del tronco', quiet: true })], primary: 'elbow', driver: 'elbow', minRange: 30, peakName: 'Massima flessione', startName: 'Gomito esteso' }, front: elbowFront(), rear: elbowFront() } },
  { id: 'press', group: 'arm', name: 'Press sopra la testa', hint: 'Camera davanti o dietro: gomiti, altezza delle braccia e simmetria.', path: 'wrists', sim: 'press', load: true, views: { front: pressView(), rear: pressView() } },
  { id: 'wrist', group: 'arm', name: 'Polso', hint: 'Stima: i punti della mano sono poco precisi. Avvicina la camera.', estimate: true, path: null, sim: 'wrist', views: { side: { metrics: [M.wrist('near'), M.elbow('near', { quiet: true })], primary: 'wrist', driver: 'wrist', minRange: 15, peakName: 'Massima deviazione', startName: 'Polso allineato' } } },
];
function abdView() {
  return { metrics: [M.shoulderAbd('L'), M.shoulderAbd('R'), M.elbow('L', { quiet: true }), M.elbow('R', { quiet: true }), M.trunkLateral(), M.shoulderTilt()], primary: 'abd_L', second: 'abd_R', perSide: { L: 'abd_L', R: 'abd_R' }, minRange: 25, peakName: 'Massima abduzione', startName: 'Braccia lungo il corpo' };
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
export const protocolById = (id, spec) => (id === 'custom' ? customProtocol(spec?.a ?? 23, spec?.b ?? 25, spec?.c ?? 27, spec?.ref ?? null) : PROTOCOLS.find((p) => p.id === id));
export const VIEW_NAMES = { side: 'Laterale', front: 'Frontale', rear: 'Posteriore' };
export const metricLabel = (m, side) => (side ? `${m.label} ${sideName(side)}` : m.label);
