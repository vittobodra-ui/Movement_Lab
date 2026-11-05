// Calcoli stabilometrici. Modulo puro: nessun accesso a pagina o pedana.
// Assi: x positivo verso la destra del cliente, y positivo verso le punte. Unità: millimetri e kg.
export const SENSOR_X = 433, SENSOR_Y = 238; // distanza tra i centri dei sensori (Leach et al., 2014)
export const BOARD_W = 511, BOARD_D = 316;
export const FS = 50, LOWPASS_HZ = 10;
const CHI2_95_2D = 5.991;

export function rotate(s) { return { tl: s.br, tr: s.bl, bl: s.tr, br: s.tl, t: s.t }; }
export function copOf(s) {
  const total = s.tl + s.tr + s.bl + s.br;
  if (total < 1) return null;
  return { x: (SENSOR_X / 2) * ((s.tr + s.br) - (s.tl + s.bl)) / total, y: (SENSOR_Y / 2) * ((s.tr + s.tl) - (s.br + s.bl)) / total, total };
}
export const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((p, q) => p - q), m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
export const quantile = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((p, r) => p - r), i = (s.length - 1) * q, l = Math.floor(i), h = Math.ceil(i); return s[l] + (s[h] - s[l]) * (i - l); };
const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;

// La pedana invia i dati a intervalli irregolari: si riportano su una griglia uniforme.
export function resample(samples, fs = FS) {
  if (samples.length < 2) return null;
  const t0 = samples[0].t, tN = samples[samples.length - 1].t, n = Math.floor(((tN - t0) / 1000) * fs) + 1;
  const keys = ['tl', 'tr', 'bl', 'br'], out = Object.fromEntries(keys.map((k) => [k, new Float64Array(n)]));
  let j = 0, maxGap = 0;
  for (let i = 1; i < samples.length; i++) maxGap = Math.max(maxGap, samples[i].t - samples[i - 1].t);
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / fs;
    while (j < samples.length - 2 && samples[j + 1].t <= t) j++;
    const a = samples[j], b = samples[j + 1], u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    for (const k of keys) out[k][i] = a[k] + (b[k] - a[k]) * u;
  }
  return { ...out, n, fs, maxGap, rateIn: ((samples.length - 1) * 1000) / (tN - t0) };
}

// Filtro Butterworth passa-basso applicato avanti e indietro: nessun ritardo.
export function lowpass(x, fc = LOWPASS_HZ, fs = FS) {
  const w = Math.tan((Math.PI * fc) / fs), q = Math.SQRT2, norm = 1 / (1 + q * w + w * w);
  const b0 = w * w * norm, b1 = 2 * b0, b2 = b0, a1 = 2 * (w * w - 1) * norm, a2 = (1 - q * w + w * w) * norm;
  const pad = Math.min(x.length - 1, Math.round(fs));
  const ext = new Float64Array(x.length + 2 * pad);
  for (let i = 0; i < pad; i++) { ext[i] = 2 * x[0] - x[pad - i]; ext[ext.length - 1 - i] = 2 * x[x.length - 1] - x[x.length - 1 - pad + i]; }
  ext.set(x, pad);
  const run = (arr) => {
    let z1 = arr[0] * (1 - b0), z2 = arr[0] * (b2 - a2);
    for (let i = 0; i < arr.length; i++) { const v = arr[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; arr[i] = y; }
  };
  run(ext); ext.reverse(); run(ext); ext.reverse();
  return ext.slice(pad, pad + x.length);
}

export function swayMetrics(xs, ys, fs) {
  const n = xs.length, mx = mean(xs), my = mean(ys);
  let len = 0, lenX = 0, lenY = 0, sxx = 0, syy = 0, sxy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i];
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    if (i) { const ax = xs[i] - xs[i - 1], ay = ys[i] - ys[i - 1]; len += Math.hypot(ax, ay); lenX += Math.abs(ax); lenY += Math.abs(ay); }
  }
  sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc), dur = (n - 1) / fs;
  return {
    meanX: mx, meanY: my, length: len, velocity: len / dur, velX: lenX / dur, velY: lenY / dur,
    rangeX: x1 - x0, rangeY: y1 - y0, rmsX: Math.sqrt(sxx), rmsY: Math.sqrt(syy),
    area: Math.PI * CHI2_95_2D * Math.sqrt(Math.max(0, det)),
    ellipse: { a: Math.sqrt(CHI2_95_2D * l1), b: Math.sqrt(CHI2_95_2D * l2), angle: Math.atan2(l1 - sxx, sxy || 1e-9) }, durationS: dur,
  };
}

// Dove stanno i piedi sulla pedana. "guided": misurati col cliente; "manual": dalle misure inserite.
export function manualPlacement(stanceCm = 20, footCm = 26) {
  const L = footCm * 10, xL = (-stanceCm * 10) / 2, xR = (stanceCm * 10) / 2;
  return { method: 'manual', xL, xR, yHeel: -0.35 * L, yFore: 0.2 * L, footLen: L, yMid: 0 };
}
// Dalla mediana della prova in appoggio su un piede e dagli spostamenti su punte e talloni.
export function guidedPlacement({ leftFoot, rightFoot, toes, heels, footCm = 26 }) {
  const L = footCm * 10;
  return { method: 'guided', xL: leftFoot.x, xR: rightFoot.x, yHeel: heels.y, yFore: toes.y, footLen: L, yMid: heels.y + 0.35 * L };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const ZONE_NAMES = { LF: 'avampiede sinistro', RF: 'avampiede destro', LR: 'retropiede sinistro', RR: 'retropiede destro' };
export function footLoads(cop, pl) {
  const left = clamp01((pl.xR - cop.x) / (pl.xR - pl.xL));
  const fore = clamp01((cop.y - pl.yHeel) / (pl.yFore - pl.yHeel));
  const zones = { LF: left * fore * 100, RF: (1 - left) * fore * 100, LR: left * (1 - fore) * 100, RR: (1 - left) * (1 - fore) * 100 };
  const top = Object.entries(zones).sort((a, b) => b[1] - a[1])[0][0];
  return { left: left * 100, right: (1 - left) * 100, fore: fore * 100, rear: (1 - fore) * 100, zones, top };
}

// Analisi completa di una prova.
export function analyzeTrial(samples, { placement = null, singleLeg = false } = {}) {
  const r = resample(samples); if (!r || r.n < FS) return null;
  const totals = new Float64Array(r.n), xs = new Float64Array(r.n), ys = new Float64Array(r.n);
  for (let i = 0; i < r.n; i++) {
    const c = copOf({ tl: r.tl[i], tr: r.tr[i], bl: r.bl[i], br: r.br[i] });
    totals[i] = c?.total ?? 0; xs[i] = c?.x ?? 0; ys[i] = c?.y ?? 0;
  }
  const fx = lowpass(xs), fy = lowpass(ys);
  const m = swayMetrics(fx, fy, FS), weight = median(Array.from(totals));
  const corners = { tl: mean(r.tl), tr: mean(r.tr), bl: mean(r.bl), br: mean(r.br) }, sum = corners.tl + corners.tr + corners.bl + corners.br;
  const cornersPct = Object.fromEntries(Object.entries(corners).map(([k, v]) => [k, (v / sum) * 100]));
  const warnings = [];
  if (r.rateIn < 30) warnings.push(`Pochi dati ricevuti: ${Math.round(r.rateIn)} al secondo invece di almeno 30.`);
  if (r.maxGap > 300) warnings.push(`La pedana ha smesso di inviare dati per ${(r.maxGap / 1000).toFixed(1).replace('.', ',')} s.`);
  if (totals.reduce((p, q) => Math.min(p, q), Infinity) < weight * 0.6) warnings.push('Il peso è calato molto durante la prova: il cliente può aver perso l’appoggio.');
  const step = 4;
  return {
    ...m, weight, corners, cornersPct, rateIn: r.rateIn, warnings,
    loads: placement && !singleLeg ? footLoads({ x: m.meanX, y: m.meanY }, placement) : null,
    series: { fs: FS / step, x: Array.from(fx.filter((_, i) => i % step === 0), (v) => +v.toFixed(1)), y: Array.from(fy.filter((_, i) => i % step === 0), (v) => +v.toFixed(1)) },
    raw: { fs: FS, tl: round(r.tl), tr: round(r.tr), bl: round(r.bl), br: round(r.br) },
  };
}
const round = (a) => Array.from(a, (v) => +v.toFixed(2));

export function rombergOf(eo, ec) {
  if (!eo || !ec) return null;
  return { length: ec.length / eo.length, area: ec.area / eo.area, velocity: ec.velocity / eo.velocity };
}
