// Messa in sella: misure fotogramma per fotogramma, giri di pedale, valori di riferimento, regolazioni e figure.
// Coordinate normalizzate con x moltiplicato per il rapporto dell'immagine, y verso il basso.

export const CATEGORIES = {
  strada: { name: 'Strada', kneeExt: [30, 40], kneeTop: [100, 120], hipMin: [45, 70], trunk: [35, 50], shoulder: [80, 95], elbow: [15, 30] },
  endurance: { name: 'Endurance e gran fondo', kneeExt: [30, 40], kneeTop: [100, 120], hipMin: [50, 75], trunk: [45, 60], shoulder: [75, 90], elbow: [15, 30] },
  mtb: { name: 'Mountain bike e gravel', kneeExt: [30, 40], kneeTop: [100, 120], hipMin: [50, 75], trunk: [40, 55], shoulder: [70, 90], elbow: [15, 35] },
  crono: { name: 'Cronometro e triathlon', kneeExt: [30, 40], kneeTop: [100, 120], hipMin: [40, 65], trunk: [10, 25], shoulder: [80, 100], elbow: [70, 100] },
  citta: { name: 'Città e trekking', kneeExt: [30, 40], kneeTop: [95, 120], hipMin: [60, 95], trunk: [55, 80], shoulder: [50, 80], elbow: [10, 30] },
};
export const LIMITS = { kops: 20, hipRock: 15, ankleRange: [15, 40], kneeTravel: 25, kneeAsym: 10, pelvisRange: 6 };

export const MEASURES = {
  kneeExt: { label: 'Flessione del ginocchio in basso', unit: '°', d: 0, hint: 'Al punto più basso del pedale' },
  kneeTop: { label: 'Flessione del ginocchio in alto', unit: '°', d: 0, hint: 'Al punto più alto del pedale' },
  hipMin: { label: 'Angolo dell’anca in alto', unit: '°', d: 0, hint: 'Tra busto e coscia, quando è più chiuso' },
  trunk: { label: 'Busto sull’orizzontale', unit: '°', d: 0 },
  shoulder: { label: 'Angolo tra busto e braccio', unit: '°', d: 0 },
  elbow: { label: 'Flessione del gomito', unit: '°', d: 0 },
  kops: { label: 'Ginocchio davanti al perno del pedale', unit: 'mm', d: 0, hint: 'Pedivella orizzontale in avanti; stima' },
  hipRock: { label: 'Oscillazione verticale del bacino', unit: 'mm', d: 0, hint: 'Stima' },
  ankleRange: { label: 'Escursione della caviglia', unit: '°', d: 0 },
  cadence: { label: 'Cadenza', unit: 'giri/min', d: 0 },
  kneeTravel_L: { label: 'Spostamento laterale ginocchio sinistro', unit: 'mm', d: 0, hint: 'Stima' },
  kneeTravel_R: { label: 'Spostamento laterale ginocchio destro', unit: 'mm', d: 0, hint: 'Stima' },
  kneeOff_L: { label: 'Ginocchio sinistro rispetto alla caviglia, in alto', unit: 'mm', d: 0, hint: 'Sopra zero: più largo della caviglia' },
  kneeOff_R: { label: 'Ginocchio destro rispetto alla caviglia, in alto', unit: 'mm', d: 0, hint: 'Sopra zero: più largo della caviglia' },
  pelvisRange: { label: 'Oscillazione laterale del bacino', unit: '°', d: 1 },
};
export const SIDE_KEYS = ['kneeExt', 'kneeTop', 'hipMin', 'trunk', 'shoulder', 'elbow', 'kops', 'hipRock', 'ankleRange', 'cadence'];
export const FRONT_KEYS = ['kneeTravel_L', 'kneeTravel_R', 'kneeOff_L', 'kneeOff_R', 'pelvisRange', 'cadence'];

const DEG = 180 / Math.PI;
const CH = { L: { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, he: 29, to: 31 }, R: { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28, he: 30, to: 32 } };
const PAIRS = [[11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32], [1, 4], [2, 5], [3, 6], [7, 8], [9, 10]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleAt = (a, b, c) => { const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y }; const d = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y); return d ? Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / d))) * DEG : null; };
export const median = (a) => { const q = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!q.length) return null; const m = (q.length - 1) / 2; return (q[Math.floor(m)] + q[Math.ceil(m)]) / 2; };
const mean = (a) => { const q = a.filter((x) => x != null && Number.isFinite(x)); return q.length ? q.reduce((s, x) => s + x, 0) / q.length : null; };
const range = (a) => { const q = a.filter((x) => x != null && Number.isFinite(x)); return q.length ? Math.max(...q) - Math.min(...q) : null; };

class OneEuro {
  constructor(minCut = 1.6, beta = 2.2) { this.minCut = minCut; this.beta = beta; this.x = null; this.dx = 0; this.t = null; }
  f(x, t) {
    if (this.x == null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    const a = (cut) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
    const dx = (x - this.x) / dt; this.dx += a(1) * (dx - this.dx);
    this.x += a(this.minCut + this.beta * Math.abs(this.dx)) * (x - this.x); return this.x;
  }
}

// Una camera: laterale ('side') oppure frontale ('front') o posteriore ('rear').
export class BikeAnalyzer {
  constructor({ view = 'side', aspect = 16 / 9, crank = 172.5, recording = false }) {
    Object.assign(this, { view, aspect, crank, recording });
    this.filters = Array.from({ length: 33 }, () => ({ x: new OneEuro(), y: new OneEuro() }));
    this.near = 'L'; this.nearScore = 0; this.dir = 1;
    this.frames = []; this.cycles = []; this.lastBdc = null; this.total = 0; this.quality = []; this.fpsT = [];
  }
  get fps() { const t = this.fpsT; return t.length > 1 ? (t.length - 1) / ((t.at(-1) - t[0]) / 1000) : 0; }
  get qualityNow() { return this.quality.length ? this.quality.reduce((a, b) => a + b, 0) / this.quality.length : 0; }
  prepare(raw, t) {
    const P = raw.map((p, i) => ({ x: this.filters[i].x.f(p.x * this.aspect, t), y: this.filters[i].y.f(p.y, t), z: p.z ?? 0, v: p.visibility ?? 1 }));
    if (this.view !== 'side') { // lati dalla posizione nell'immagine: da dietro la sinistra è a sinistra, da davanti il contrario
      const dx = P[24].x - P[23].x, wrong = this.view === 'rear' ? dx < 0 : dx > 0;
      if (wrong && Math.abs(dx) > 0.004) for (const [a, b] of PAIRS) { const s = P[a]; P[a] = P[b]; P[b] = s; }
    }
    return P;
  }
  push(raw, t) {
    this.total++; this.fpsT.push(t); if (this.fpsT.length > 40) this.fpsT.shift();
    if (!raw) { this.quality.push(0); if (this.quality.length > 60) this.quality.shift(); return null; }
    const P = this.prepare(raw, t);
    const seen = [23, 24, 25, 26, 27, 28, 11, 12].filter((i) => P[i].v > 0.5).length >= 4;
    this.quality.push(seen ? 1 : 0); if (this.quality.length > 60) this.quality.shift();
    const frame = this.view === 'side' ? this.sideFrame(P, t) : this.frontFrame(P, t);
    this.frames.push(frame);
    if (!this.recording) while (this.frames.length && this.frames[0].t < t - 10000) this.frames.shift();
    this.detectCycle(t);
    return frame;
  }
  sideFrame(P, t) {
    const vis = (s) => [CH[s].hip, CH[s].kn, CH[s].an].reduce((a, i) => a + P[i].v, 0) - [CH[s].hip, CH[s].kn, CH[s].an].reduce((a, i) => a + P[i].z, 0) * 2;
    this.nearScore = this.nearScore * 0.9 + (vis('L') - vis('R')) * 0.1;
    if (this.nearScore > 0.05) this.near = 'L'; else if (this.nearScore < -0.05) this.near = 'R';
    const c = CH[this.near], sh = P[c.sh], hip = P[c.hip], kn = P[c.kn], an = P[c.an], to = P[c.to], el = P[c.el], wr = P[c.wr];
    const d = Math.sign(sh.x - hip.x); if (d) this.dir = d;
    const spindle = { x: an.x + 0.7 * (to.x - an.x), y: an.y + 0.7 * (to.y - an.y) };
    const knee = angleAt(hip, kn, an), hipA = angleAt(sh, hip, kn), shA = angleAt(hip, sh, el), elA = angleAt(sh, el, wr), ank = angleAt(kn, an, to);
    const values = {
      knee: knee == null ? null : 180 - knee, hip: hipA, trunk: Math.atan2(hip.y - sh.y, Math.abs(sh.x - hip.x)) * DEG,
      shoulder: shA, elbow: elA == null ? null : 180 - elA, ankle: ank,
    };
    return { t, P, near: this.near, dir: this.dir, values, spindle, sig: spindle.y };
  }
  frontFrame(P, t) {
    const lat = (s) => Math.sign(P[CH[s].hip].x - P[CH[s === 'L' ? 'R' : 'L'].hip].x) || (s === 'L' ? -1 : 1);
    const values = { pelvis: Math.atan2(P[24].y - P[23].y, Math.abs(P[24].x - P[23].x) || 1e-6) * DEG };
    for (const s of ['L', 'R']) values[`kneeX_${s}`] = (P[CH[s].kn].x - P[CH[s].an].x) * lat(s);
    return { t, P, values, sig: P[27].y, lat: { L: lat('L'), R: lat('R') } };
  }
  // Punto più basso del pedale: massimo locale del segnale verticale, con 0,2 s di ritardo.
  detectCycle(now) {
    const F = this.frames, lag = 200;
    const win = F.filter((f) => f.t >= now - 1500);
    if (win.length < 8) return;
    const cand = win.reduce((best, f) => (Math.abs(f.t - (now - lag)) < Math.abs(best.t - (now - lag)) ? f : best));
    const near = win.filter((f) => Math.abs(f.t - cand.t) <= lag);
    if (near.some((f) => f.sig > cand.sig)) return;
    const amp = Math.max(...win.map((f) => f.sig)) - Math.min(...win.map((f) => f.sig));
    if (amp < 0.03 || (this.lastBdc && cand.t - this.lastBdc.t < 350)) return;
    const prev = this.lastBdc; this.lastBdc = cand;
    if (!prev || cand.t - prev.t > 2000) return;
    const cyc = F.filter((f) => f.t >= prev.t && f.t <= cand.t);
    const c = this.view === 'side' ? this.sideCycle(cyc) : this.frontCycle(cyc);
    if (c) { c.t0 = prev.t; c.t1 = cand.t; c.cadence = 60000 / (cand.t - prev.t); this.cycles.push(c); if (!this.recording && this.cycles.length > 20) this.cycles.shift(); this.onCycle?.(c, this); }
  }
  sideCycle(F) {
    const val = (k) => F.map((f) => f.values[k]);
    const xs = F.map((f) => f.spindle.x), dx = Math.max(...xs) - Math.min(...xs);
    if (!(dx > 0.01)) return null;
    const mm = 2 * this.crank / dx, dir = F.at(-1).dir;
    const knees = val('knee'), iExt = knees.indexOf(Math.min(...knees.filter((x) => x != null)));
    const fwd = F.reduce((b, f) => (f.spindle.x * dir > b.spindle.x * dir ? f : b), F[0]);
    const cN = CH[fwd.near], kops = (fwd.P[cN.kn].x - fwd.spindle.x) * dir * mm;
    const hipY = F.map((f) => f.P[CH[f.near].hip].y);
    // Altezza della sella: distanza anca-caviglia che darebbe la flessione voluta, a parità di coscia e gamba.
    const bdc = F[iExt], cb = CH[bdc.near];
    const T = median(F.map((f) => dist(f.P[CH[f.near].hip], f.P[CH[f.near].kn]))), S = median(F.map((f) => dist(f.P[CH[f.near].kn], f.P[CH[f.near].an])));
    const D = dist(bdc.P[cb.hip], bdc.P[cb.an]);
    const saddleFor = (flex) => (Math.sqrt(T * T + S * S - 2 * T * S * Math.cos((180 - flex) / DEG)) - D) * mm;
    const ank = val('ankle');
    return {
      kneeExt: Math.min(...knees.filter((x) => x != null)), kneeTop: Math.max(...knees.filter((x) => x != null)),
      hipMin: Math.min(...val('hip').filter((x) => x != null)), trunk: mean(val('trunk')), shoulder: mean(val('shoulder')), elbow: mean(val('elbow')),
      ankleRange: range(ank), kops, hipRock: range(hipY) * mm, mm, saddleFor: { 30: saddleFor(30), 35: saddleFor(35), 40: saddleFor(40) },
      pose: { bdc: bdc.P.map((p) => [p.x, p.y, p.v]), fwd: fwd.P.map((p) => [p.x, p.y, p.v]), near: bdc.near, dir, center: [mean(xs), mean(F.map((f) => f.spindle.y))], radius: dx / 2 },
    };
  }
  frontCycle(F) {
    const ys = F.map((f) => f.P[27].y), dy = Math.max(...ys) - Math.min(...ys);
    if (!(dy > 0.01)) return null;
    const mm = 2 * this.crank / dy, out = { mm, pelvisRange: range(F.map((f) => f.values.pelvis)), paths: {} };
    for (const s of ['L', 'R']) {
      const kx = F.map((f) => f.P[CH[s].kn].x);
      out[`kneeTravel_${s}`] = range(kx) * mm;
      const top = F.reduce((b, f) => (f.P[CH[s].an].y < b.P[CH[s].an].y ? f : b), F[0]);
      out[`kneeOff_${s}`] = top.values[`kneeX_${s}`] * mm;
      const lat = F[0].lat[s], h = (f) => f.P[CH[s].hip];
      out.paths[s] = F.map((f) => [(f.P[CH[s].kn].x - h(f).x) * lat * mm, (f.P[CH[s].kn].y - h(f).y) * mm, (f.P[CH[s].an].x - h(f).x) * lat * mm, (f.P[CH[s].an].y - h(f).y) * mm]);
    }
    return out;
  }
  // Ultimo giro completo, per i valori dal vivo.
  live() { return this.cycles.at(-1) ?? null; }
  summary() {
    const C = this.cycles.length > 4 ? this.cycles.slice(1, -1) : this.cycles;
    const keys = this.view === 'side' ? SIDE_KEYS : FRONT_KEYS, values = {}, spread = {};
    for (const k of keys) { const a = C.map((c) => c[k]); values[k] = median(a); const q = a.filter(Number.isFinite).sort((x, y) => x - y); spread[k] = q.length > 3 ? [q[Math.floor(q.length * 0.25)], q[Math.floor(q.length * 0.75)]] : null; }
    const out = { view: this.view, cycles: C.length, values, spread, quality: this.total ? this.quality.reduce((a, b) => a + b, 0) / this.quality.length : 0 };
    if (this.view === 'side' && C.length) {
      out.saddleFor = Object.fromEntries([30, 35, 40].map((f) => [f, median(C.map((c) => c.saddleFor[f]))]));
      const mid = C.reduce((b, c) => (Math.abs(c.kneeExt - values.kneeExt) < Math.abs(b.kneeExt - values.kneeExt) ? c : b), C[0]);
      out.pose = mid.pose; out.mm = mid.mm;
    }
    if (this.view !== 'side' && C.length) {
      const mid = C.reduce((b, c) => (Math.abs(c.pelvisRange - values.pelvisRange) < Math.abs(b.pelvisRange - values.pelvisRange) ? c : b), C[0]);
      out.paths = mid.paths;
    }
    return out;
  }
}

/* ---------- confronto con i valori di riferimento e regolazioni ---------- */
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
const round5 = (x) => Math.round(x / 5) * 5;
export const targetOf = (key, cat) => {
  const C = CATEGORIES[cat] ?? CATEGORIES.strada;
  if (C[key]) return C[key];
  if (key === 'kops') return [-LIMITS.kops, LIMITS.kops];
  if (key === 'hipRock') return [0, LIMITS.hipRock];
  if (key === 'ankleRange') return LIMITS.ankleRange;
  if (key.startsWith('kneeTravel')) return [0, LIMITS.kneeTravel];
  if (key === 'pelvisRange') return [0, LIMITS.pelvisRange];
  return null;
};
export const stateOf = (key, v, cat) => { const t = targetOf(key, cat); if (!t || v == null) return 'none'; return v < t[0] ? 'low' : v > t[1] ? 'high' : 'ok'; };

export function findings(doc) {
  const out = [], cat = doc.category ?? 'strada', S = doc.views?.side, F = doc.views?.front;
  const add = (o) => out.push({ state: 'flag', ...o });
  if (S?.values) {
    const v = S.values, st = (k) => stateOf(k, v[k], cat), tg = (k) => targetOf(k, cat), sf = S.saddleFor ?? {};
    if (st('kneeExt') === 'low') { const mm = Math.abs(round5(sf[35] ?? 0)); add({ key: 'saddleHigh', parts: ['thigh', 'shin'], title: 'Sella forse alta', value: `Ginocchio piegato di ${fmt(v.kneeExt)}° in basso, riferimento ${tg('kneeExt').join('-')}°.`, plain: 'In basso la gamba si distende troppo: il bacino può oscillare e la parte dietro del ginocchio si carica.', cue: mm ? `Abbassa la sella di circa ${mm} mm, a passi di 3-5 mm, e ricontrolla.` : 'Abbassa la sella a passi di 3-5 mm e ricontrolla.' }); }
    if (st('kneeExt') === 'high') { const mm = Math.abs(round5(sf[35] ?? 0)); add({ key: 'saddleLow', parts: ['thigh', 'shin'], title: 'Sella forse bassa', value: `Ginocchio piegato di ${fmt(v.kneeExt)}° in basso, riferimento ${tg('kneeExt').join('-')}°.`, plain: 'In basso il ginocchio resta molto piegato: la spinta è meno efficace e la parte davanti del ginocchio si carica.', cue: mm ? `Alza la sella di circa ${mm} mm, a passi di 3-5 mm, e ricontrolla.` : 'Alza la sella a passi di 3-5 mm e ricontrolla.' }); }
    if (st('kneeTop') === 'high') add({ key: 'kneeTop', parts: ['thigh', 'shin'], title: 'Ginocchio molto chiuso in alto', value: `${fmt(v.kneeTop)}°, riferimento fino a ${tg('kneeTop')[1]}°.`, plain: 'Nel punto più alto del pedale il ginocchio si piega molto.', cue: 'Di solito dipende da sella bassa o avanzata, o da pedivelle lunghe per la gamba.' });
    if (st('hipMin') === 'low') add({ key: 'hipClosed', parts: ['trunk', 'thigh'], title: 'Anca molto chiusa in alto', value: `${fmt(v.hipMin)}°, riferimento da ${tg('hipMin')[0]}°.`, plain: 'Busto e coscia si avvicinano molto: la spinta perde forza e la zona lombare lavora di più.', cue: 'Alza il manubrio o accorcia l’allungamento; nel crono alza gli appoggi delle braccia.' });
    if (st('trunk') === 'low') add({ key: 'trunkLow', parts: ['trunk'], title: 'Busto molto basso per questo tipo di bici', value: `${fmt(v.trunk)}°, riferimento ${tg('trunk').join('-')}°.`, plain: 'La posizione è molto aerodinamica ma pesa su collo, schiena e mani.', cue: 'Alza il manubrio con gli spessori o con un attacco più inclinato verso l’alto.' });
    if (st('trunk') === 'high') add({ key: 'trunkHigh', parts: ['trunk'], title: 'Busto molto alto per questo tipo di bici', value: `${fmt(v.trunk)}°, riferimento ${tg('trunk').join('-')}°.`, plain: 'Il busto resta dritto: comodo, ma con più resistenza all’aria e meno appoggio sulle braccia.', cue: 'Se cerchi una posizione più sportiva abbassa il manubrio poco alla volta.' });
    if (st('shoulder') === 'high') add({ key: 'reachLong', parts: ['uarm', 'trunk'], title: 'Manubrio lontano', value: `Busto e braccio a ${fmt(v.shoulder)}°, riferimento ${tg('shoulder').join('-')}°.`, plain: 'Le braccia si allungano molto per arrivare al manubrio: spalle e collo si caricano.', cue: 'Prova un attacco manubrio più corto di 10-20 mm.' });
    if (st('shoulder') === 'low') add({ key: 'reachShort', parts: ['uarm', 'trunk'], title: 'Manubrio vicino', value: `Busto e braccio a ${fmt(v.shoulder)}°, riferimento ${tg('shoulder').join('-')}°.`, plain: 'Le braccia restano raccolte: il busto si incurva e le ginocchia possono avvicinarsi al manubrio.', cue: 'Prova un attacco manubrio più lungo di 10-20 mm.' });
    if (st('elbow') === 'low') add({ key: 'elbowLocked', parts: ['farm', 'uarm'], title: 'Gomiti quasi bloccati', value: `${fmt(v.elbow)}°, riferimento ${tg('elbow').join('-')}°.`, plain: 'Le braccia tese trasmettono le vibrazioni a spalle e collo.', cue: 'Tieni i gomiti morbidi; se non riesci, il manubrio è forse lontano o basso.' });
    if (st('elbow') === 'high') add({ key: 'elbowBent', parts: ['farm', 'uarm'], title: 'Gomiti molto piegati', value: `${fmt(v.elbow)}°, riferimento ${tg('elbow').join('-')}°.`, plain: 'Le braccia lavorano per sostenere il busto.', cue: 'Il manubrio è forse vicino o alto per la posizione cercata.' });
    if (v.kops != null && Math.abs(v.kops) > LIMITS.kops) add({ key: 'kops', parts: ['shin'], title: v.kops > 0 ? 'Ginocchio davanti al perno del pedale' : 'Ginocchio dietro al perno del pedale', value: `${fmt(Math.abs(v.kops))} mm con la pedivella orizzontale.`, plain: 'Riferimento classico, non una regola: indica se la sella è avanzata o arretrata rispetto ai pedali.', cue: `Se ci sono fastidi al ginocchio, sposta la sella ${v.kops > 0 ? 'indietro' : 'in avanti'} di circa ${round5(Math.min(Math.abs(v.kops) - 10, 20)) || 5} mm e ricontrolla l’altezza.` });
    if (v.hipRock != null && v.hipRock > LIMITS.hipRock) add({ key: 'hipRock', parts: ['trunk'], title: 'Bacino che oscilla sulla sella', value: `${fmt(v.hipRock)} mm in alto e in basso.`, plain: 'Il bacino si muove per arrivare al pedale in basso.', cue: 'Spesso la sella è alta; controlla anche le tacchette e la sella stessa.' });
    if (v.ankleRange != null && v.ankleRange > LIMITS.ankleRange[1]) add({ key: 'ankle', parts: ['foot'], title: 'Caviglia che lavora molto', value: `Escursione di ${fmt(v.ankleRange)}°.`, plain: 'La caviglia si piega e si distende molto a ogni giro: può compensare una sella alta.', cue: 'Controlla l’altezza della sella e la posizione delle tacchette sotto il piede.' });
  }
  if (F?.values) {
    const v = F.values;
    for (const s of ['L', 'R']) {
      const tr = v[`kneeTravel_${s}`];
      if (tr != null && tr > LIMITS.kneeTravel) add({ key: `knee_${s}`, side: s, parts: ['thigh', 'shin'], title: `Ginocchio ${s === 'L' ? 'sinistro' : 'destro'} che si sposta di lato`, value: `${fmt(tr)} mm a ogni giro.`, plain: 'Il ginocchio non sale e scende dritto: si sposta verso l’interno o l’esterno durante la pedalata.', cue: 'Controlla rotazione e larghezza delle tacchette, eventuali spessori e plantari.' });
    }
    const a = v.kneeTravel_L, b = v.kneeTravel_R;
    if (a != null && b != null && Math.abs(a - b) > LIMITS.kneeAsym) add({ key: 'kneeAsym', parts: ['thigh', 'shin'], side: a > b ? 'L' : 'R', title: 'Ginocchia diverse tra i lati', value: `Sinistro ${fmt(a)} mm, destro ${fmt(b)} mm.`, plain: 'Un ginocchio si muove di lato molto più dell’altro.', cue: 'Valuta tacchette e piede del lato che si muove di più; a volte serve un piccolo spessore.' });
    if (v.pelvisRange != null && v.pelvisRange > LIMITS.pelvisRange) add({ key: 'pelvis', parts: ['pelvis'], title: 'Bacino che ondeggia di lato', value: `${fmt(v.pelvisRange, 1)}° a ogni giro.`, plain: 'Il bacino si inclina da un lato all’altro mentre pedala.', cue: 'Spesso la sella è alta; se è più marcato da un lato, valuta una differenza di lunghezza delle gambe.' });
  }
  let n = 0;
  return out.map((f) => ({ ...f, n: ++n }));
}

/* ---------- figure ---------- */
const f1 = (x) => (Math.round(x * 10) / 10).toString();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEG = (s) => ({ thigh: [CH[s].hip, CH[s].kn], shin: [CH[s].kn, CH[s].an], foot: [CH[s].an, CH[s].to], uarm: [CH[s].sh, CH[s].el], farm: [CH[s].el, CH[s].wr] });

// Di lato: la persona al punto più basso del pedale, la bici schematica, gli angoli e gli errori numerati.
export function sideFigure(doc, fs) {
  const S = doc.views?.side; if (!S?.pose) return '';
  const pose = S.pose, P = pose.bdc.map(([x, y]) => ({ x, y })), near = pose.near, dir = pose.dir, c = CH[near];
  const C = { x: pose.center[0], y: pose.center[1] }, r = pose.radius;
  const wheelR = r * 2.0, rear = { x: C.x - dir * r * 2.4, y: C.y - r * 0.3 }, front = { x: C.x + dir * r * 5.6, y: C.y - r * 0.3 };
  const pts = [...[0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32].map((i) => P[i]), ...[rear, front].flatMap((w) => [{ x: w.x - wheelR, y: w.y + wheelR }, { x: w.x + wheelR, y: w.y - wheelR }])];
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y)) - 0.05, maxY = Math.max(...pts.map((p) => p.y));
  const W = 420, H = Math.round(W * (maxY - minY) / (maxX - minX) + 30), sc = (W - 40) / (maxX - minX);
  const M = (p) => ({ x: 20 + (dir > 0 ? p.x - minX : maxX - p.x) * sc, y: 15 + (p.y - minY) * sc });
  const ln = (a, b, cls) => { const A = M(a), B = M(b); return `<line x1="${f1(A.x)}" y1="${f1(A.y)}" x2="${f1(B.x)}" y2="${f1(B.y)}" class="${cls}"/>`; };
  let o = '';
  // Bici schematica: ruote, movimento centrale, telaio verso sella e manubrio.
  const seat = { x: P[c.hip].x - dir * r * 0.1, y: P[c.hip].y + r * 0.35 }, bar = { x: P[c.wr].x, y: P[c.wr].y + r * 0.1 };
  for (const w of [rear, front]) { const A = M(w); o += `<circle cx="${f1(A.x)}" cy="${f1(A.y)}" r="${f1(wheelR * sc)}" class="bf-bike"/>`; }
  o += ln(rear, C, 'bf-bike') + ln(C, seat, 'bf-bike') + ln(seat, bar, 'bf-bike') + ln(bar, front, 'bf-bike') + ln(rear, seat, 'bf-bike') + ln(C, bar, 'bf-bike');
  const Ac = M(C); o += `<circle cx="${f1(Ac.x)}" cy="${f1(Ac.y)}" r="${f1(r * sc)}" class="bf-crank"/>`;
  const errParts = new Set(fs.flatMap((f) => f.parts ?? []));
  const far = CH[near === 'L' ? 'R' : 'L'];
  for (const [a, b] of [[far.hip, far.kn], [far.kn, far.an], [far.sh, far.el], [far.el, far.wr]]) o += ln(P[a], P[b], 'bf-far');
  const segs = { ...SEG(near), trunk: [c.hip, c.sh] };
  for (const [name, [a, b]] of Object.entries(segs)) o += errParts.has(name) ? ln(P[a], P[b], 'mf-err-o') + ln(P[a], P[b], 'mf-err-i') : ln(P[a], P[b], 'mf-me');
  const hd = M(P[0]); o += `<circle cx="${f1(hd.x)}" cy="${f1(hd.y)}" r="${f1(0.035 * sc)}" class="mf-head"/>`;
  for (const i of [c.sh, c.el, c.hip, c.kn, c.an]) { const q = M(P[i]); o += `<circle cx="${f1(q.x)}" cy="${f1(q.y)}" r="3.4" class="mf-joint"/>`; }
  // Angoli misurati scritti accanto all'articolazione.
  const v = S.values, lab = (i, txt, dx, dy) => { const q = M(P[i]); return `<text x="${f1(q.x + dx)}" y="${f1(q.y + dy)}" class="bf-ang">${txt}</text>`; };
  o += lab(c.kn, `${fmt(v.kneeExt)}°`, 10, 4) + lab(c.hip, `${fmt(v.hipMin)}°`, -40, -8) + lab(c.sh, `${fmt(v.shoulder)}°`, 6, -10) + lab(c.el, `${fmt(v.elbow)}°`, 8, 12);
  const mid = (name) => { const [a, b] = segs[name] ?? segs.trunk; const A = M(P[a]), B = M(P[b]); return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }; };
  const placed = [];
  for (const f of fs.filter((f) => !f.key.startsWith('knee_') && f.key !== 'kneeAsym' && f.key !== 'pelvis')) {
    let { x, y } = mid(f.parts?.[0] ?? 'trunk'); x += 22; y -= 18;
    for (let k = 0; k < 6 && placed.some((p) => Math.hypot(p.x - x, p.y - y) < 26); k++) y += 26;
    placed.push({ x, y }); o += `<g class="mf-badge" transform="translate(${f1(x)} ${f1(y)})"><circle r="12"/><text y="5">${f.n}</text></g>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="mf-svg" role="img" aria-label="Posizione in sella al punto più basso del pedale, ${fs.length ? 'con errori numerati' : 'senza errori oltre le soglie'}">${o}</svg>`;
}
// Da davanti o da dietro: percorso dei due ginocchi in un giro, rispetto all'anca dello stesso lato.
export function frontFigure(doc, fs) {
  const F = doc.views?.front; if (!F?.paths?.L || !F?.paths?.R) return '';
  const W = 420, H = 300, X = 4, o = [];
  const flagged = new Set(fs.filter((f) => f.side).map((f) => f.side));
  // Solo il ginocchio, centrato sulla sua verticale media; lo spostamento laterale è ingrandito 4 volte.
  const prep = (s) => { const k = F.paths[s].map((p) => [p[0], p[1]]), mx = k.reduce((a, p) => a + p[0], 0) / k.length; return k.map(([x, y]) => [(x - mx) * X, y]); };
  const all = ['L', 'R'].map(prep), ys = all.flat().map((p) => p[1]), xs = all.flat().map((p) => Math.abs(p[0]));
  const y0 = Math.min(...ys), y1 = Math.max(...ys), sc = Math.min((H - 70) / ((y1 - y0) || 1), (W / 4 - 20) / (Math.max(...xs) || 1));
  ['L', 'R'].forEach((s, n) => {
    const ox = n === 0 ? W * 0.27 : W * 0.73, g = s === 'L' ? -1 : 1;
    const pts = all[n].map(([x, y]) => [ox + g * x * sc, 30 + (y - y0) * sc]);
    o.push(`<line x1="${f1(ox)}" x2="${f1(ox)}" y1="18" y2="${H - 34}" class="mf-ref"/>`);
    const poly = `points="${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}"`;
    o.push(flagged.has(s) ? `<polygon ${poly} class="mf-err-o bf-path"/><polygon ${poly} class="mf-err-i bf-path"/>` : `<polygon ${poly} class="mf-me bf-path"/>`);
    o.push(`<text x="${f1(ox)}" y="${H - 14}" text-anchor="middle" class="mf-small">Ginocchio ${s === 'L' ? 'sinistro' : 'destro'}</text>`);
  });
  o.push(`<text x="${W / 2}" y="${H - 1}" text-anchor="middle" class="mf-small">Spostamento laterale ingrandito ${X} volte; esterno verso i bordi</text>`);
  return `<svg viewBox="0 0 ${W} ${H + 6}" class="mf-svg" role="img" aria-label="Percorso dei ginocchi visto ${F.view === 'rear' ? 'da dietro' : 'da davanti'}">${o.join('')}</svg>`;
}
export const findingsList = (fs) => fs.length
  ? `<ol class="mf-list">${fs.map((f) => `<li><span class="mf-num">${f.n}</span><div><b>${esc(f.title)}</b> <span class="mf-val">${esc(f.value)}</span><br>${esc(f.plain)}<br><span class="mf-cue">Cosa fare: ${esc(f.cue)}</span></div></li>`).join('')}</ol>`
  : '<p class="mf-good">Tutti i valori misurati sono negli intervalli di riferimento.</p>';
