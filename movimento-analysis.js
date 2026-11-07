// Dai punti del riconoscimento alle ripetizioni: filtro, lato misurato, conteggio, statistiche.
import { PAIRS, dist, other, DEG } from './movimento-measure.js';

export function median(a) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; }
export function quantile(a, q) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, l = Math.floor(p), h = Math.ceil(p); return s[l] + (s[h] - s[l]) * (p - l); }
export function meanSd(a) { const n = a.length; if (!n) return { mean: null, sd: null, n: 0 }; const mean = a.reduce((x, y) => x + y, 0) / n; return { mean, sd: n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0, n }; }

// Filtro One Euro: toglie il tremolio a riposo senza ritardare i movimenti veloci.
class OneEuro {
  constructor(minCut, beta, dCut = 1) { Object.assign(this, { minCut, beta, dCut, x: null, dx: 0, t: null }); }
  static a(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  f(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    const d = (v - this.x) / dt, ad = OneEuro.a(this.dCut, dt);
    this.dx += ad * (d - this.dx);
    const cut = this.minCut + this.beta * Math.abs(this.dx), a = OneEuro.a(cut, dt);
    this.x += a * (v - this.x);
    return this.x;
  }
}

export function preparePoints(raw, { aspect, view }) {
  const P = raw.map((l) => ({ x: l.x * aspect, y: l.y, z: l.z ?? 0, v: l.visibility ?? 1 }));
  if (view === 'front' || view === 'rear') {
    // Da dietro il modello confonde spesso i lati: si assegnano dalla posizione nell'immagine.
    // Dietro: la sinistra del soggetto è a sinistra nell'immagine. Davanti: il contrario.
    const hipsOk = P[23].v > 0.4 && P[24].v > 0.4;
    const dx = hipsOk ? P[24].x - P[23].x : P[12].x - P[11].x;
    const wrong = view === 'rear' ? dx < 0 : dx > 0;
    if (wrong && Math.abs(dx) > 0.004) for (const [a, b] of PAIRS) { const t = P[a]; P[a] = P[b]; P[b] = t; }
  }
  return P;
}

// Riconosce ripetizione: partenza stabile, picco, ritorno. Lavora su un solo segnale con segno.
export class RepCounter {
  constructor({ minRange, sign = 1, minMs = 450, onRep, onPeak }) {
    Object.assign(this, { minRange, sign, minMs, onRep, onPeak });
    this.state = 'rest'; this.rest = null; this.restT = 0; this.peak = null; this.peakT = 0; this.startT = 0; this.lastT = null; this.settle = null; this.samples = []; this.pre = [];
  }
  push(raw, t) {
    if (raw == null || !Number.isFinite(raw)) { this.lastT = t; return; }
    const v = raw * this.sign;
    const dt = this.lastT == null ? 0 : Math.max(0, t - this.lastT) / 1000; this.lastT = t;
    if (this.state === 'rest') {
      if (this.rest === null) { this.rest = v; this.restT = t; }
      this.rest += 1.2 * dt; // la base risale lentamente se un valore basso era un errore
      if (v <= this.rest) { this.rest = v; this.restT = t; }
      this.pre.push({ t, v }); while (this.pre.length && this.pre[0].t < t - 6000) this.pre.shift();
      if (v - this.rest >= this.minRange) { this.state = 'out'; this.peak = v; this.peakT = t; this.startT = this.restT; this.samples = this.pre.filter((x) => x.t >= this.restT && x.t < t); this.pre = []; this.onPeak?.(this.sign * v, t, this); }
    } else if (this.state === 'out') {
      if (v > this.peak) { this.peak = v; this.peakT = t; this.onPeak?.(this.sign * v, t, this); }
      if (v <= this.rest + 0.3 * (this.peak - this.rest)) { this.state = 'settle'; this.settle = v; this.settleT = t; }
    } else if (this.state === 'settle') {
      if (v < this.settle) { this.settle = v; this.settleT = t; }
      if (v - this.settle > Math.max(3, 0.08 * (this.peak - this.rest)) || t - this.settleT > 350) this.finish(t);
    }
    if (this.state !== 'rest') this.samples.push({ t, v });
  }
  finish(t) {
    const rom = this.peak - Math.min(this.rest, this.settle);
    const startV = this.rest, s = this.samples;
    const lo = startV + 0.1 * (this.peak - startV), hi = startV + 0.9 * (this.peak - startV);
    const firstLo = s.find((x) => x.v >= lo), firstHi = s.find((x) => x.v >= hi), lastHiIdx = s.map((x) => x.v >= hi).lastIndexOf(true);
    const afterHi = lastHiIdx >= 0 ? s.slice(lastHiIdx).find((x) => x.v <= lo) : null;
    const rep = {
      t0: this.startT, tPeak: this.peakT, t1: this.settleT, rom,
      down: firstHi && firstLo ? firstHi.t - firstLo.t : null,
      hold: firstHi && lastHiIdx >= 0 ? s[lastHiIdx].t - firstHi.t : null,
      up: afterHi && lastHiIdx >= 0 ? afterHi.t - s[lastHiIdx].t : null,
      peakValue: this.sign * this.peak, startValue: this.sign * this.rest,
    };
    const ok = this.settleT - this.startT >= this.minMs;
    this.state = 'rest'; this.rest = this.settle; this.restT = this.settleT; this.settle = null; this.peak = null; this.samples = [];
    if (ok) this.onRep?.(rep);
  }
}

const CHECK_WINDOW = 45;
export class SetAnalyzer {
  constructor({ protocol, view, aspect = 16 / 9, sideMode = 'auto', baseTilt = null, recording = false, onRep, onPeak }) {
    Object.assign(this, { protocol, view, aspect, sideMode, baseTilt, recording, onRep, onPeak });
    this.spec = protocol.views[view];
    this.minVis = 0.35;
    this.filters = Array.from({ length: 33 }, () => ({ x: new OneEuro(1.6, 2.2), y: new OneEuro(1.6, 2.2) }));
    this.near = sideMode === 'L' || sideMode === 'R' ? sideMode : 'L'; this.nearScore = 0;
    this.dir = 1; this.dirHist = [];
    this.work = this.near;
    this.legHist = []; this.hipHist = []; this.leg = null; this.topY = null;
    this.frames = []; this.total = 0; this.valid = 0; this.quality = []; this.fpsT = [];
    this.series = {}; this.reps = []; this.path = [];
    this.last = null; this.peakCtx = {}; this.viewWarn = null;
    const addCounter = (id, side) => new RepCounter({
      minRange: this.spec.minRange, sign: this.spec.driverSign ?? 1,
      onRep: (r) => this.addRep(r, id, side),
      onPeak: (v, t) => this.onPeak?.(id, side, v, t, this.last),
    });
    this.counters = this.spec.perSide
      ? Object.entries(this.spec.perSide).map(([side, id]) => ({ id, side, c: addCounter(id, side) }))
      : [{ id: this.spec.driver, side: null, c: addCounter(this.spec.driver, null) }];
  }

  get fps() { const n = this.fpsT.length; return n > 1 ? (n - 1) * 1000 / (this.fpsT[n - 1] - this.fpsT[0] || 1) : 0; }
  get qualityNow() { const q = this.quality; return q.length ? q.filter(Boolean).length / q.length : 0; }

  push(raw, t) {
    this.total++;
    this.fpsT.push(t); if (this.fpsT.length > 40) this.fpsT.shift();
    if (!raw) { this.quality.push(0); if (this.quality.length > 60) this.quality.shift(); this.last = null; for (const k of this.counters) k.c.push(null, t); return null; }
    const P = preparePoints(raw, { aspect: this.aspect, view: this.view });
    for (let i = 0; i < 33; i++) { P[i].x = this.filters[i].x.f(P[i].x, t); P[i].y = this.filters[i].y.f(P[i].y, t); }
    return this.evaluateFrame(P, t);
  }

  updateContext(P, t) {
    // Verso in cui guarda il soggetto, nelle viste laterali
    if (this.view === 'side') {
      const ears = (P[7].x + P[8].x) / 2, nose = P[0].x - ears;
      const toes = (P[31].x - P[29].x) + (P[32].x - P[30].x);
      const sample = Math.abs(nose) > 0.004 && P[0].v > 0.5 ? Math.sign(nose) : Math.sign(toes);
      if (sample) { this.dirHist.push(sample); if (this.dirHist.length > CHECK_WINDOW) this.dirHist.shift(); }
      const s = this.dirHist.reduce((a, b) => a + b, 0);
      if (s > 0) this.dir = 1; else if (s < 0) this.dir = -1;
    } else this.dir = 1;
    // Lato misurato: quello vicino alla camera, con isteresi
    if (this.sideMode === 'auto') {
      const score = (s) => { const ix = s === 'L' ? [11, 13, 15, 23, 25, 27] : [12, 14, 16, 24, 26, 28]; let z = 0, v = 0; for (const i of ix) { z += P[i].z; v += P[i].v; } return { z: z / 6, v: v / 6 }; };
      const l = score('L'), r = score('R');
      const raw = (l.v - r.v) * 1.5 + (r.z - l.z) * 3;
      this.nearScore = this.nearScore * 0.93 + raw * 0.07;
      if (this.nearScore > 0.02) this.near = 'L'; else if (this.nearScore < -0.02) this.near = 'R';
    } else this.near = this.sideMode;
    // Gamba di lavoro
    const pick = this.spec.legPick ?? 'near';
    if (this.sideMode === 'L' || this.sideMode === 'R') this.work = this.sideMode;
    else if (pick === 'near') this.work = this.near;
    else if (pick === 'front') { const lx = P[27].x * this.dir, rx = P[28].x * this.dir; if (Math.abs(lx - rx) > 0.02) this.work = lx > rx ? 'L' : 'R'; }
    else if (pick === 'lower') { if (Math.abs(P[27].y - P[28].y) > 0.02) this.work = P[27].y > P[28].y ? 'L' : 'R'; }
    // Gamba e posizione alta del bacino, usate per la discesa
    const legs = [];
    if (P[23].v > 0.4 && P[27].v > 0.3) legs.push(dist(P[23], P[27]));
    if (P[24].v > 0.4 && P[28].v > 0.3) legs.push(dist(P[24], P[28]));
    if (legs.length) { this.legHist.push(Math.max(...legs)); if (this.legHist.length > 300) this.legHist.shift(); this.leg = quantile(this.legHist, 0.9); }
    this.hipHist.push({ t, y: (P[23].y + P[24].y) / 2 });
    while (this.hipHist.length && this.hipHist[0].t < t - 8000) this.hipHist.shift();
    this.topY = quantile(this.hipHist.map((h) => h.y), 0.05);
    // La camera è davvero dove dovrebbe essere?
    const shW = Math.abs(P[11].x - P[12].x), torso = Math.abs((P[11].y + P[12].y) / 2 - (P[23].y + P[24].y) / 2);
    if (torso > 0.03 && P[11].v > 0.5 && P[12].v > 0.5 && P[23].v > 0.4) {
      const ratio = shW / torso;
      this.viewRatio = this.viewRatio == null ? ratio : this.viewRatio * 0.95 + ratio * 0.05;
      this.viewWarn = this.view === 'side' && this.viewRatio > 0.45 ? 'Il soggetto non sembra di profilo: gli angoli risultano falsati.'
        : this.view !== 'side' && this.viewRatio < 0.22 ? 'Il soggetto non sembra di fronte alla camera: gli angoli risultano falsati.' : null;
    }
  }

  ctxFor(P) { return { P, near: this.near, dir: this.dir, work: this.work, leg: this.leg, topY: this.topY, minVis: this.minVis, baseTilt: this.baseTilt }; }

  evaluateFrame(P, t) {
    this.updateContext(P, t);
    const ctx = this.ctxFor(P);
    const res = evaluate(this.spec, ctx);
    const seenKey = [23, 24, 25, 26, 27, 28, 11, 12, 13, 14, 15, 16].filter((i) => P[i].v > 0.5).length >= 4;
    this.quality.push(seenKey ? 1 : 0); if (this.quality.length > 60) this.quality.shift();
    if (seenKey) this.valid++;
    const frame = { t, P, values: res.values, draws: res.draws, near: this.near, dir: this.dir, work: this.work, leg: this.leg, topY: this.topY };
    this.last = frame;
    for (const k of this.counters) k.c.push(res.values[k.id], t);
    if (this.recording) {
      this.frames.push(frame);
      for (const [id, v] of Object.entries(res.values)) if (v != null) (this.series[id] ??= []).push({ t, v });
      const pp = pathPoint(this.protocol.path, P, this.work);
      if (pp) this.path.push({ t, x: pp.x, y: pp.y });
    }
    return frame;
  }

  addRep(r, id, side) {
    const frames = this.frames;
    const at = {}, ext = {};
    let best = null;
    for (const f of frames) if (f.t >= r.t0 && f.t <= r.t1) {
      for (const [k, v] of Object.entries(f.values)) if (v != null) { const e = ext[k] ??= [v, v]; if (v < e[0]) e[0] = v; if (v > e[1]) e[1] = v; }
      if (!best || Math.abs(f.t - r.tPeak) < Math.abs(best.t - r.tPeak)) best = f;
    }
    if (best) Object.assign(at, best.values);
    if (!this.recording) return;
    const rep = { i: this.reps.filter((x) => x.side === side).length + 1, side, driver: id, ...r, at, ext };
    if (this.protocol.path && this.protocol.group === 'squat') {
      const seg = this.path.filter((p) => p.t >= r.t0 && p.t <= r.t1);
      if (seg.length > 2 && this.leg > 0) rep.drift = (Math.max(...seg.map((p) => p.x)) - Math.min(...seg.map((p) => p.x))) / this.leg * 100;
    }
    this.reps.push(rep);
    this.onRep?.(rep, this);
  }

  // Riepilogo salvato nell'archivio.
  summary() {
    const metrics = {};
    const specs = this.spec.metrics;
    for (const m of specs) {
      const peaks = this.reps.map((r) => r.at[m.id]).filter((v) => v != null && Number.isFinite(v));
      const all = (this.series[m.id] ?? []).map((e) => e.v);
      if (!all.length) continue;
      const st = meanSd(peaks);
      metrics[m.id] = { label: m.label, unit: m.unit, d: m.d, hint: m.hint ?? null, side: id2side(m.id), peakMean: st.mean, peakSd: st.sd, peakN: st.n, min: Math.min(...all), max: Math.max(...all) };
    }
    const t0 = this.frames[0]?.t ?? 0;
    const trace = {};
    const idsToTrace = [this.spec.primary, this.spec.second].filter(Boolean);
    for (const id of idsToTrace) {
      const s = this.series[id] ?? [];
      const step = Math.max(1, Math.floor(s.length / 300));
      trace[id] = s.filter((_, i) => i % step === 0).map((e) => [Math.round(e.t - t0), +e.v.toFixed(1)]);
    }
    const dur = this.frames.length ? (this.frames[this.frames.length - 1].t - t0) / 1000 : 0;
    const fpsAll = dur > 0 ? (this.frames.length - 1) / dur : 0;
    return {
      view: this.view, near: this.near, work: this.work, dir: this.dir, durationS: dur, fps: fpsAll, quality: this.total ? this.valid / this.total : 0,
      reps: this.reps.map((r) => ({ ...r, t0: r.t0 - t0, tPeak: r.tPeak - t0, t1: r.t1 - t0 })), metrics, trace, baseTilt: this.baseTilt, t0, viewWarn: this.viewWarn,
    };
  }
}
const id2side = (id) => (id.endsWith('_L') ? 'L' : id.endsWith('_R') ? 'R' : null);

export function pathPoint(kind, P, work) {
  if (!kind) return null;
  if (kind === 'hip') return { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2 };
  if (kind === 'shoulders') return { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 };
  if (kind === 'wrists') { const w = work === 'R' ? 16 : 15; return P[w].v > 0.4 ? { x: P[w].x, y: P[w].y } : null; }
  return null;
}

export function evaluate(spec, ctx) {
  const values = {}, draws = [];
  for (const m of spec.metrics) {
    let r = null;
    try { r = m.f(ctx); } catch { r = null; }
    if (r && Number.isFinite(r.v)) {
      values[m.id] = r.v;
      if (r.draw && !m.quiet) draws.push({ id: m.id, v: r.v, d: m.d, unit: m.unit, side: r.side ?? null, primary: m.id === spec.primary || m.id === spec.second, ...r.draw });
    } else values[m.id] = null;
  }
  return { values, draws };
}
export { other, DEG };

// Ricalcola una serie dai punti salvati, con un altro esercizio, vista o lato. I punti sono già filtrati:
// si rifanno solo il lato misurato, le misure e le ripetizioni. Nelle viste frontale e posteriore i lati
// si riassegnano dalla posizione nell'immagine, come durante la ripresa.
export function reanalyzePack(pack, { protocol, view, sideMode = 'auto', aspect = 16 / 9, baseTilt = null }) {
  const a = new SetAnalyzer({ protocol, view, aspect, sideMode, baseTilt, recording: true });
  for (let i = 0; i < pack.n; i++) {
    const P = [];
    for (let k = 0; k < 33; k++) { const o = i * 99 + k * 3; P.push({ x: pack.pts[o], y: pack.pts[o + 1], z: 0, v: pack.pts[o + 2] }); }
    if (view === 'front' || view === 'rear') {
      const hipsOk = P[23].v > 0.4 && P[24].v > 0.4, dx = hipsOk ? P[24].x - P[23].x : P[12].x - P[11].x;
      const wrong = view === 'rear' ? dx < 0 : dx > 0;
      if (wrong && Math.abs(dx) > 0.004) for (const [p, q] of PAIRS) { const t = P[p]; P[p] = P[q]; P[q] = t; }
    }
    a.total++; a.fpsT.push(pack.times[i]); if (a.fpsT.length > 40) a.fpsT.shift();
    a.evaluateFrame(P, pack.times[i]);
  }
  return a;
}
