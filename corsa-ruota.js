// La ruota della corsa: il ciclo del passo disegnato con le figure del cliente, gli errori numerati e spiegati.
// Modulo senza pagina né video: riceve una sessione e restituisce testo e disegni. I segni restano distinti
// anche in una stampa in scala di grigi, perché non dipendono solo dal colore.
import { fmt } from './asym.js';

/* ---------- soglie ---------- */
export const WHEEL_DEFAULTS = { overstride: 30, heelFoot: 8, heelKnee: 6, toes: -8, cadenceMargin: 10, cadenceMin: 155, oscillation: 13, trunkForward: 15, trunkBack: 0, arms: 3, valgus: 10 };
export const WHEEL_LIMIT_INFO = {
  overstride: { label: 'Piede troppo avanti', detail: 'Tallone davanti al bacino, oltre questo valore', unit: '% gamba' },
  heelFoot: { label: 'Tallone a gamba tesa: piede', detail: 'Punta alzata al contatto, oltre questo valore', unit: '°' },
  heelKnee: { label: 'Tallone a gamba tesa: ginocchio', detail: 'Ginocchio al contatto, sotto questo valore', unit: '°' },
  toes: { label: 'Corsa sulle punte', detail: 'Piede a inizio appoggio, sotto questo valore (negativo: tallone alto)', unit: '°' },
  cadenceMargin: { label: 'Cadenza bassa, con velocità e altezza', detail: 'Passi in meno rispetto al valore atteso', unit: 'passi/min' },
  cadenceMin: { label: 'Cadenza bassa, senza velocità o altezza', detail: 'Sotto questo valore', unit: 'passi/min' },
  oscillation: { label: 'Rimbalzo verso l’alto', detail: 'Oscillazione verticale, oltre questo valore', unit: '% gamba' },
  trunkForward: { label: 'Busto in avanti', detail: 'Inclinazione del tronco, oltre questo valore', unit: '°' },
  trunkBack: { label: 'Busto all’indietro', detail: 'Inclinazione del tronco, sotto questo valore', unit: '°' },
  arms: { label: 'Braccia che incrociano', detail: 'Mano oltre la linea centrale, oltre questo valore', unit: '% gamba' },
  valgus: { label: 'Ginocchia verso l’interno', detail: 'Valgo dinamico, oltre questo valore', unit: '°' },
};
const STORE_KEY = 'lab_ruota';
const MIN_STEPS = 5;
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
export function wheelLimits() {
  const out = { ...WHEEL_DEFAULTS };
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'); for (const k of Object.keys(out)) if (k in s) out[k] = s[k] === null ? null : Number(s[k]); } catch { /* restano i valori iniziali */ }
  return out;
}
export function saveWheelLimits(t) {
  const clean = {};
  for (const k of Object.keys(WHEEL_DEFAULTS)) { const v = t[k]; clean[k] = v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v); }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(clean)); } catch { /* non salvate */ }
  return clean;
}

/* ---------- voci ---------- */
// Equazione di Malisoux 2023, valida tra 7 e 15 km/h.
export function expectedCadence(doc) {
  const v = parseFloat(doc.speed), h = Number(doc.heightCm);
  if (!(v >= 7 && v <= 15) || !(h > 100)) return null;
  let age = doc.birth ? new Date(doc.createdAt).getFullYear() - Number(doc.birth) : 35;
  if (!(age >= 10 && age <= 100)) age = 35;
  return 203.056 + 0.193 * age - 44.242 * (h / 100) + 3.067 * v;
}
const SIDE_WORD = { L: 'a sinistra', R: 'a destra', B: 'su entrambi i lati' };
const stat = (M, k) => { const s = M?.[k]; return s && s.n >= MIN_STEPS && ok(s.mean) ? s.mean : null; };

export function wheelItems(doc, T = wheelLimits()) {
  const V = doc?.views ?? {}, side = V.side?.metrics ?? null;
  const rear = V.rear?.metrics ?? null, front = V.front?.metrics ?? null, fr = rear ?? front;
  const armsFrom = front ?? rear;
  const manual = doc?.ruota?.manual ?? {}, hidden = doc?.ruota?.hidden ?? {};
  const items = [];
  const SHORT = { overstride: 'posizione del piede all’atterraggio', heelstrike: 'atterraggio sul tallone', pronation: 'pronazione', supination: 'supinazione', toes: 'appoggio del tallone', cadence: 'cadenza', oscillation: 'oscillazione verticale', trunk: 'busto', arms: 'braccia e spalle', valgus: 'ginocchia' };
  const add = (n, key, title, state, value, plain, where) => items.push({ n, key, title, short: SHORT[key], state: hidden[key] && (state === 'flag' || state === 'manual') ? 'hidden' : state, value, plain, where });
  const needSide = 'Serve la vista laterale.', needFront = 'Serve la vista frontale o posteriore.';

  const over = stat(side, 'overstride');
  add(1, 'overstride', 'Piede troppo avanti (overstriding)', over == null ? 'none' : T.overstride != null && over >= T.overstride ? 'flag' : 'ok',
    over == null ? needSide : `Tallone ${fmt(over)}% della gamba davanti al bacino.`, 'Il piede atterra molto davanti al corpo: a ogni passo frena un po’ la corsa.', 'A');

  const foot = stat(side, 'footAngle'), knee = stat(side, 'kneeIC');
  const hs = foot != null && knee != null && T.heelFoot != null && T.heelKnee != null && foot >= T.heelFoot && knee < T.heelKnee;
  add(2, 'heelstrike', 'Atterraggio sul tallone a gamba tesa', foot == null || knee == null ? 'none' : hs ? 'flag' : 'ok',
    foot == null || knee == null ? (side ? 'Sessione registrata prima di questa misura.' : needSide) : `Punta alzata di ${fmt(foot)}°, ginocchio piegato di ${fmt(knee)}° (stima).`, 'Il tallone tocca per primo con il ginocchio quasi dritto: la gamba ammortizza meno l’arrivo a terra.', 'A');

  add(3, 'pronation', 'Pronazione eccessiva o arco che cede', manual.pronation ? 'manual' : 'eye', manual.pronation ? `Osservata ${SIDE_WORD[manual.pronation]}.` : 'Non si misura da video: la valuta il fisioterapista.', 'All’appoggio il piede cede verso l’interno e l’arco si abbassa.', 'R');
  add(4, 'supination', 'Supinazione rigida', manual.supination ? 'manual' : 'eye', manual.supination ? `Osservata ${SIDE_WORD[manual.supination]}.` : 'Non si misura da video: la valuta il fisioterapista.', 'Il piede resta sul bordo esterno e ammortizza poco.', 'R');

  const flat = stat(side, 'footFlat');
  add(5, 'toes', 'Corsa sulle punte', flat == null ? 'none' : T.toes != null && flat <= T.toes ? 'flag' : 'ok',
    flat == null ? (side ? 'Sessione registrata prima di questa misura.' : needSide) : `A inizio appoggio il piede resta inclinato di ${fmt(flat)}° (stima).`, 'Il tallone non si avvicina mai a terra: il polpaccio lavora di più.', 'B');

  const cad = stat(side, 'cadence') ?? stat(fr, 'cadence'), exp = expectedCadence(doc);
  const lowCad = cad != null && (exp != null ? T.cadenceMargin != null && cad < exp - T.cadenceMargin : T.cadenceMin != null && cad < T.cadenceMin);
  add(6, 'cadence', 'Cadenza bassa', cad == null ? 'none' : lowCad ? 'flag' : 'ok',
    cad == null ? 'Dati insufficienti.' : `${fmt(cad)} passi al minuto${exp != null ? `, attesi circa ${fmt(exp)} a ${fmt(parseFloat(doc.speed), 1)} km/h` : ''}.`, 'Passi lunghi e lenti. Aumentare un po’ la frequenza riduce i carichi su ginocchio e anca.', 'C');

  const osc = stat(side, 'oscillation');
  add(7, 'oscillation', 'Troppo rimbalzo verso l’alto', osc == null ? 'none' : T.oscillation != null && osc >= T.oscillation ? 'flag' : 'ok',
    osc == null ? needSide : `Il bacino sale e scende del ${fmt(osc)}% della gamba.`, 'Parte della spinta va verso l’alto invece che in avanti.', 'D');

  const trunk = stat(side, 'trunk');
  const tFwd = trunk != null && T.trunkForward != null && trunk >= T.trunkForward, tBack = trunk != null && T.trunkBack != null && trunk <= T.trunkBack;
  add(8, 'trunk', tBack ? 'Busto piegato all’indietro' : 'Busto spezzato alle anche', trunk == null ? 'none' : tFwd || tBack ? 'flag' : 'ok',
    trunk == null ? needSide : `Tronco ${fmt(Math.abs(trunk))}° ${trunk >= 0 ? 'in avanti' : 'indietro'}.`, tBack ? 'Il busto resta dietro al bacino e la spinta in avanti si riduce.' : 'Il busto si piega molto in avanti dalle anche invece di restare allineato.', 'T');

  const armL = stat(armsFrom, 'armCross_L'), armR = stat(armsFrom, 'armCross_R'), armMax = Math.max(armL ?? -Infinity, armR ?? -Infinity);
  const armFlag = (armL != null || armR != null) && T.arms != null && armMax >= T.arms;
  const armText = armL == null && armR == null ? (fr ? 'Sessione registrata prima di questa misura.' : needFront)
    : armMax > 0 ? `Mano oltre la linea centrale: sinistra ${fmt(armL, 1)}%, destra ${fmt(armR, 1)}% della gamba.` : 'Le mani restano dal proprio lato.';
  add(9, 'arms', 'Spalle contratte e braccia che incrociano', armFlag || manual.shoulders ? (armFlag ? 'flag' : 'manual') : armL == null && armR == null ? 'eye' : 'ok',
    `${armText}${manual.shoulders ? ' Spalle contratte, osservate dal fisioterapista.' : ''}`, 'Le braccia oltrepassano la linea centrale o le spalle restano alte: il busto tende a ruotare e a irrigidirsi.', 'R');

  const vL = stat(fr, 'valgus_L'), vR = stat(fr, 'valgus_R'), vMax = Math.max(vL ?? -Infinity, vR ?? -Infinity);
  add(10, 'valgus', 'Ginocchia che cedono verso l’interno', vL == null && vR == null ? 'none' : T.valgus != null && vMax >= T.valgus ? 'flag' : 'ok',
    vL == null && vR == null ? needFront : `Valgo: sinistra ${fmt(vL, 1)}°, destra ${fmt(vR, 1)}°.`, 'All’appoggio il ginocchio si sposta verso l’interno.', 'R');
  return items;
}

/* ---------- pose ---------- */
const RAD = Math.PI / 180;
const REF = {
  thigh: [[0, 22], [0.1, 15], [0.2, 2], [0.38, -20], [0.5, -18], [0.62, -2], [0.75, 25], [0.88, 38], [0.95, 33]],
  knee: [[0, 15], [0.1, 38], [0.2, 30], [0.38, 20], [0.5, 55], [0.62, 95], [0.75, 85], [0.88, 40], [0.95, 20]],
  foot: [[0, 10], [0.07, 0], [0.22, 0], [0.32, -25], [0.38, -55], [0.5, -65], [0.62, -75], [0.75, -40], [0.88, -5], [0.95, 10]],
};
function curve(cp, x) { // Catmull-Rom periodica
  const u = ((x % 1) + 1) % 1, n = cp.length;
  let i = n - 1; for (let k = 0; k < n; k++) { const nx = k + 1 < n ? cp[k + 1][0] : 1; if (u >= cp[k][0] && u < nx) { i = k; break; } }
  const x1 = cp[i][0], x2 = i + 1 < n ? cp[i + 1][0] : 1, t = (u - x1) / (x2 - x1 || 1);
  const v = (k) => cp[((k % n) + n) % n][1], p0 = v(i - 1), p1 = v(i), p2 = v(i + 1), p3 = v(i + 2);
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
}
function refLeg(phi, over = {}) {
  const th = (over.thigh ?? curve(REF.thigh, phi)) * RAD, kn = (over.knee ?? curve(REF.knee, phi)) * RAD, ft = (over.foot ?? curve(REF.foot, phi)) * RAD;
  const k = [0.5 * Math.sin(th), 0.5 * Math.cos(th)], sh = th - kn, a = [k[0] + 0.5 * Math.sin(sh), k[1] + 0.5 * Math.cos(sh)];
  const u = [Math.cos(ft), -Math.sin(ft)], d = [Math.sin(ft), Math.cos(ft)];
  return { k, a, h: [a[0] - 0.07 * u[0] + 0.05 * d[0], a[1] - 0.07 * u[1] + 0.05 * d[1]], t: [a[0] + 0.22 * u[0] + 0.05 * d[0], a[1] + 0.22 * u[1] + 0.05 * d[1]] };
}
function refArm(phi) {
  const a = -0.6 * curve(REF.thigh, phi) * RAD, f = a + 85 * RAD, sh = [0, 0];
  return { e: [sh[0] + 0.3 * Math.sin(a), 0.3 * Math.cos(a)], w: [0.3 * Math.sin(a) + 0.28 * Math.sin(f), 0.3 * Math.cos(a) + 0.28 * Math.cos(f)] };
}
export function refPose(phi, o = {}) {
  const tr = (o.trunk ?? 7) * RAD, s = [0.72 * Math.sin(tr), -0.72 * Math.cos(tr)];
  const shift = (p) => [p[0] + s[0], p[1] + s[1]], arm = (x) => { const r = refArm(x); return { e: shift(r.e), w: shift(r.w) }; };
  return { A: refLeg(phi, o.A), B: refLeg(phi + 0.5), s, hd: [s[0] + 0.2 * Math.sin(tr + 6 * RAD), s[1] - 0.2 * Math.cos(tr + 6 * RAD)], armN: arm(phi + 0.5), armF: arm(phi) };
}
// Posa media reale: la prima metà del ciclo è il passo in cui la gamba A è davanti, la seconda quello dopo.
export function wheelPose(w, phi) {
  const u = ((phi % 1) + 1) % 1, leadIsA = u < 0.5, s = (leadIsA ? u : u - 0.5) * 2 * w.N;
  const i0 = Math.min(w.N - 1, Math.floor(s)), i1 = Math.min(w.N - 1, i0 + 1), f = s - i0;
  const at = (part) => [w.parts[part][i0 * 2] + (w.parts[part][i1 * 2] - w.parts[part][i0 * 2]) * f, w.parts[part][i0 * 2 + 1] + (w.parts[part][i1 * 2 + 1] - w.parts[part][i0 * 2 + 1]) * f];
  const leg = (p) => ({ k: at(`${p}k`), a: at(`${p}a`), h: at(`${p}h`), t: at(`${p}t`) });
  const fr = { e: at('ef'), w: at('wf') }, bk = { e: at('eb'), w: at('wb') };
  return { A: leg(leadIsA ? 'l' : 'z'), B: leg(leadIsA ? 'z' : 'l'), s: at('sh'), hd: at('hd'), armN: leadIsA ? fr : bk, armF: leadIsA ? bk : fr };
}
export function footPath(w) {
  const pts = [];
  for (let i = 0; i < w.N; i++) pts.push([w.parts.la[i * 2], w.parts.la[i * 2 + 1]]);
  for (let i = 0; i < w.N; i++) pts.push([w.parts.za[i * 2], w.parts.za[i * 2 + 1]]);
  return pts;
}

/* ---------- disegno ---------- */
const f1 = (v) => v.toFixed(1);
const line = (a, b, cls) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" class="${cls}"/>`;
const poly = (pts, cls, close = false) => `<${close ? 'polygon' : 'polyline'} points="${pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ')}" class="${cls}"/>`;
const errSeg = (pts, big) => poly(pts, `rw-err-o${big ? ' big' : ''}`) + poly(pts, `rw-err-i${big ? ' big' : ''}`);
function badge(x, y, n, kind = 'flag') {
  if (kind === 'manual') return `<g class="rw-badge manual" transform="translate(${f1(x)} ${f1(y)})"><polygon points="0,-18 18,0 0,18 -18,0"/><text y="6">${n}</text></g>`;
  return `<g class="rw-badge" transform="translate(${f1(x)} ${f1(y)})"><circle r="15"/><text y="6">${n}</text></g>`;
}
function figure(ox, oy, S, pose, ref, err = new Set(), big = false) {
  const P = (p) => [ox + S * p[0], oy + S * p[1]], hip = [ox, oy];
  const c = big ? ' big' : '';
  let out = '';
  if (ref) {
    const R = (leg) => poly([hip, P(leg.k), P(leg.a), P(leg.h), P(leg.t), P(leg.a)], `rw-ref${c}`);
    out += `<g>${R(ref.A)}${poly([hip, P(ref.s)], `rw-ref${c}`)}<circle cx="${f1(P(ref.hd)[0])}" cy="${f1(P(ref.hd)[1])}" r="${f1(S * 0.13)}" class="rw-ref${c}"/></g>`;
  }
  const legFar = pose.B, far = `rw-far${c}`, near = `rw-near${c}`;
  out += poly([hip, P(legFar.k), P(legFar.a), P(legFar.t), P(legFar.h), P(legFar.a)], far);
  out += poly([P(pose.s), P(pose.armF.e), P(pose.armF.w)], far);
  const seg = (key, pts) => (err.has(key) ? errSeg(pts, big) : poly(pts, near));
  out += seg('trunk', [hip, P(pose.s)]);
  out += `<circle cx="${f1(P(pose.hd)[0])}" cy="${f1(P(pose.hd)[1])}" r="${f1(S * 0.13)}" class="rw-head${c}"/>`;
  out += seg('thigh', [hip, P(pose.A.k)]) + seg('shank', [P(pose.A.k), P(pose.A.a)]) + seg('foot', [P(pose.A.a), P(pose.A.t), P(pose.A.h), P(pose.A.a)]);
  out += poly([P(pose.s), P(pose.armN.e), P(pose.armN.w)], near);
  out += `<circle cx="${ox}" cy="${oy}" r="${big ? 5.5 : 3.5}" class="rw-joint"/><circle cx="${f1(P(pose.A.k)[0])}" cy="${f1(P(pose.A.k)[1])}" r="${big ? 4.5 : 3}" class="rw-joint"/>`;
  return out;
}

// In ogni fase, oltre alla gamba, si segna il busto una volta sola, al centro e in appoggio: ripeterlo ovunque confonde.
const PHASES = [
  { id: 'A', phi: 0, name: 'Contatto', ground: true },
  { id: 'B', phi: 0.16, name: 'Appoggio', ground: true },
  { id: 'C', phi: 0.38, name: 'Spinta' },
  { id: 'D', phi: 0.46, name: 'Volo' },
  { id: 'E', phi: 0.57, name: 'Ritorno' },
  { id: 'F', phi: 0.72, name: 'Ginocchio avanti' },
  { id: 'G', phi: 0.88, name: 'Verso il contatto' },
];
const CX = 520, CY = 515, RING = 256, RFIG = 404, FIG_S = 78;

function ringArc(a0, a1, r) { // angoli in gradi, in senso orario da ore 12
  const p = (a) => [CX + r * Math.sin(a * RAD), CY - r * Math.cos(a * RAD)], [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`;
}
export function wheelSvg(doc, items) {
  const side = doc?.views?.side, w = side?.wheel && side.wheel.parts ? side.wheel : null;
  const st = (key) => items.find((i) => i.key === key)?.state;
  const flagged = (key) => st(key) === 'flag';
  const M = side?.metrics ?? {}, measuredTrunk = stat(M, 'trunk');
  const stanceF = Math.max(0.28, Math.min(0.5, w?.stance ?? 0.38));
  const a0 = 180 - 180 * stanceF; // inizio appoggio, centrato in basso
  // Le fasi hanno posizioni nominali con l'appoggio al 38% del ciclo: si riportano sull'appoggio misurato.
  const realPhi = (phi) => (phi <= 0.38 ? (phi / 0.38) * stanceF : stanceF + ((phi - 0.38) / 0.62) * (1 - stanceF));
  const angleOf = (phi) => a0 + 360 * realPhi(phi);
  const poseAt = (phi) => {
    if (w) return wheelPose(w, phi);
    const o = {};
    if (measuredTrunk != null) o.trunk = measuredTrunk;
    if (phi === 0) { const sh = stat(M, 'shank'), kn = stat(M, 'kneeIC'); if (sh != null && kn != null) o.A = { thigh: sh + kn, knee: kn }; }
    return refPose(phi, o);
  };
  const trunkErr = flagged('trunk') ? ['trunk'] : [];
  const errFor = { A: [...(flagged('overstride') ? ['shank', 'thigh'] : []), ...(flagged('heelstrike') ? ['foot', 'shank'] : [])], B: [...(flagged('toes') ? ['foot', 'shank'] : []), ...trunkErr] };
  let out = '';
  // anello
  const end = a0 + 360 * stanceF;
  out += `<circle cx="${CX}" cy="${CY}" r="${RING}" class="rw-ring"/><path d="${ringArc(a0, end, RING)}" class="rw-ring-st"/>`;
  const angs = Object.fromEntries(PHASES.map((ph) => [ph.id, angleOf(ph.phi)]));
  const pt = (a, r) => [CX + r * Math.sin(a * RAD), CY - r * Math.cos(a * RAD)];
  const [bx0, by0] = pt(angs.B - 4, RING + 6), [bx1, by1] = pt(angs.A + 4, RING + 6);
  out += `<path id="rwTopArc" d="${ringArc(angs.E + 2, angs.F - 2, RING - 6)}" fill="none"/><path id="rwBotArc" d="M${f1(bx0)} ${f1(by0)}A${RING + 6} ${RING + 6} 0 0 0 ${f1(bx1)} ${f1(by1)}" fill="none"/>`;
  out += `<text class="rw-ring-t"><textPath href="#rwTopArc" startOffset="50%" text-anchor="middle">VOLO E RITORNO</textPath></text>`;
  out += `<text class="rw-ring-t st"><textPath href="#rwBotArc" startOffset="50%" text-anchor="middle">APPOGGIO</textPath></text>`;
  for (const [x0, x1, dark] of [[angs.F, angs.G], [angs.G, angs.A], [angs.B, angs.C, true], [angs.D, angs.E]]) { // frecce: il piede gira in senso orario
    const ang = (x0 + (x1 < x0 ? x1 + 360 : x1)) / 2, [x, y] = pt(ang, RING);
    out += `<path d="M-6 -9L6 0L-6 9" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)})" class="rw-chev${dark ? ' st' : ''}"/>`;
  }
  // figure attorno
  for (const ph of PHASES) {
    const ang = angleOf(ph.phi), sinA = Math.sin(ang * RAD), cosA = Math.cos(ang * RAD);
    const tx = CX + RING * sinA, ty = CY - RING * cosA, fx = CX + RFIG * sinA, fy = CY - RFIG * cosA + 2;
    const S = FIG_S, pose = poseAt(realPhi(ph.phi)), ref = refPose(ph.phi), err = new Set(errFor[ph.id] ?? []);
    out += `<line x1="${f1(CX + (RING + 15) * sinA)}" y1="${f1(CY - (RING + 15) * cosA)}" x2="${f1(CX + (RFIG - 68) * sinA)}" y2="${f1(CY - (RFIG - 68) * cosA)}" class="rw-lead"/>`;
    out += `<g class="rw-tick" transform="translate(${f1(tx)} ${f1(ty)})"><circle r="13"/><text y="5">${ph.id}</text></g>`;
    if (ph.ground) { const yg = fy + S * Math.max(pose.A.h[1], pose.A.t[1]) + 2; out += line([fx - 66, yg], [fx + 72, yg], 'rw-ground'); }
    out += figure(fx, fy, S, pose, ref, err);
    out += `<text x="${f1(fx)}" y="${f1(fy + S * 1.3)}" text-anchor="middle" class="rw-label"><tspan class="id">${ph.id}</tspan> ${ph.name}</text>`;
    if (ph.id === 'A') {
      if (flagged('overstride')) out += badge(fx + S * pose.A.t[0] + 24, fy + S * pose.A.t[1] - 18, 1);
      if (flagged('heelstrike')) out += badge(fx + S * pose.A.k[0] + 30, fy + S * pose.A.k[1] - 22, 2);
    }
    if (ph.id === 'B' && flagged('toes')) out += badge(fx + S * pose.A.h[0] - 28, fy + S * pose.A.h[1] - 10, 5);
    if (ph.id === 'D' && flagged('oscillation')) {
      const x = fx + 72;
      out += `<path d="M${x} ${f1(fy - 26)}V${f1(fy + 26)}M${x - 7} ${f1(fy - 17)}L${x} ${f1(fy - 27)}L${x + 7} ${f1(fy - 17)}M${x - 7} ${f1(fy + 17)}L${x} ${f1(fy + 27)}L${x + 7} ${f1(fy + 17)}" class="rw-arrow"/>${badge(x, fy - 46, 7)}`;
    }
  }
  // centro: percorso del piede e figura al contatto
  const S = 152, ox = CX - 8, oy = CY - 6, P = (p) => [ox + S * p[0], oy + S * p[1]];
  out += `<text x="${CX - 138}" y="${CY - 118}" text-anchor="middle" class="rw-small">percorso</text><text x="${CX - 138}" y="${CY - 98}" text-anchor="middle" class="rw-small">del piede</text>`;
  const refPath = []; for (let i = 0; i < 60; i++) refPath.push(P(refPose(i / 60).A.a));
  out += poly(refPath, 'rw-path-ref', true);
  if (w) {
    const path = footPath(w).map(P);
    out += poly(path, 'rw-path', true);
    if (flagged('overstride')) {
      const N = path.length, hl = []; for (let i = -Math.round(N * 0.1); i <= Math.round(N * 0.07); i++) hl.push(path[(i + N) % N]);
      out += errSeg(hl, true);
    }
  }
  const pose0 = poseAt(0), err0 = new Set([...(flagged('overstride') ? ['shank', 'thigh'] : []), ...(flagged('heelstrike') ? ['foot'] : []), ...trunkErr]);
  out += figure(ox, oy, S, pose0, refPose(0), err0, true);
  const heel = P(pose0.A.h);
  if (stat(M, 'overstride') != null) {
    const y = Math.min(heel[1] + 21, CY + 182);
    out += `<path d="M${ox} ${f1(oy + 4)}V${f1(y + 7)}M${f1(heel[0])} ${f1(y - 13)}V${f1(y + 7)}M${ox} ${f1(y)}H${f1(heel[0])}" class="rw-dim${flagged('overstride') ? ' err' : ''}"/>`;
    out += `<text x="${ox - 10}" y="${f1(y + 7)}" text-anchor="end" class="rw-val${flagged('overstride') ? ' err' : ''}">${fmt(stat(M, 'overstride'))}%</text>`;
    if (flagged('overstride')) out += badge(heel[0] + 28, y + 2, 1);
  }
  if (measuredTrunk != null) {
    const s = P(pose0.s);
    if (flagged('trunk')) { out += `<text x="${f1(s[0] - 22)}" y="${f1(s[1] - 4)}" text-anchor="end" class="rw-val err">${fmt(Math.abs(measuredTrunk))}°</text>${badge(s[0] - 40, s[1] + 26, 8)}`; }
  }
  const cad = items.find((i) => i.key === 'cadence');
  const cadV = stat(M, 'cadence') ?? stat(doc?.views?.rear?.metrics ?? doc?.views?.front?.metrics, 'cadence');
  if (cadV != null) {
    const x = CX + 142, y = CY - 106, on = cad?.state === 'flag';
    out += `<text x="${x}" y="${y}" text-anchor="middle" class="rw-big${on ? ' err' : ''}">${fmt(cadV)}</text><text x="${x}" y="${y + 21}" text-anchor="middle" class="rw-small">passi al minuto</text>`;
    if (on) out += badge(x, y - 50, 6);
  }
  return `<svg viewBox="0 0 1040 1046" class="rw-svg" role="img" aria-label="Ruota della corsa: il ciclo del passo con ${items.filter((i) => i.state === 'flag').length} errori misurati">${out}</svg>`;
}

// Vista da dietro: una figura per ogni appoggio.
function rearFigure(ox, oy, S, stance, o, marks) {
  const sign = stance === 'L' ? -1 : 1; // da dietro la sinistra del corridore è a sinistra
  const wP = 0.13, wS = 0.21, P = (p) => [ox + S * p[0], oy + S * p[1]];
  const drop = (o.drop ?? 0) * RAD, val = (o.valgus ?? 0) * RAD;
  const hipSt = [sign * wP, -Math.sin(drop) * wP], hipSw = [-sign * wP, Math.sin(drop) * wP];
  const ankSt = [sign * 0.05, 1], lenSt = Math.hypot(ankSt[0] - hipSt[0], ankSt[1] - hipSt[1]);
  const midSt = [(hipSt[0] + ankSt[0]) / 2, (hipSt[1] + ankSt[1]) / 2], kneeSt = [midSt[0] - sign * Math.tan(val / 2) * lenSt / 2, midSt[1]];
  const kneeSw = [hipSw[0] - sign * 0.02, hipSw[1] + 0.46], ankSw = [kneeSw[0] - sign * 0.03, kneeSw[1] + 0.24];
  const lift = marks.shoulders ? 0.05 : 0;
  const shSt = [sign * wS, -0.72 - lift], shSw = [-sign * wS, -0.72 - lift], head = [0, -0.95 + lift * 0.3];
  const armFwd = o.arm ?? -6; // mano del braccio opposto alla gamba in appoggio: + oltre la linea centrale
  const elA = [-sign * 0.28, -0.42 - lift], wrA = [-sign * -(armFwd / 100), -0.28 - lift * 0.5]; // braccio avanti
  const elB = [sign * 0.3, -0.45 - lift], wrB = [sign * 0.27, -0.22 - lift * 0.5];
  const near = 'rw-near', far = 'rw-far';
  const err = marks.err;
  const seg = (key, pts) => (err.has(key) ? errSeg(pts, false) : poly(pts, near));
  let out = line(P([-0.42, 1.08]), P([0.42, 1.08]), 'rw-ground');
  // riferimento
  const refHipSt = [sign * wP, 0], refAnk = [sign * 0.05, 1], refKnee = [(refHipSt[0] + refAnk[0]) / 2, 0.5];
  out += poly([P(refHipSt), P(refKnee), P(refAnk)], 'rw-ref') + poly([P([-sign * wP, 0]), P([sign * wP, 0])], 'rw-ref');
  out += poly([P([-sign * wP, 0]), P([0, -0.72])], far);
  out += poly([P(hipSw), P(kneeSw), P(ankSw)], far);
  out += seg('pelvis', [P(hipSt), P(hipSw)]);
  out += poly([P(midOf(hipSt, hipSw)), P([0, -0.72 - lift])], near);
  out += seg('shoulders', [P(shSt), P(shSw)]);
  out += `<circle cx="${f1(P(head)[0])}" cy="${f1(P(head)[1])}" r="${f1(S * 0.13)}" class="rw-head"/>`;
  out += seg('thigh', [P(hipSt), P(kneeSt)]) + seg('shank', [P(kneeSt), P(ankSt)]);
  // Da dietro il piede è un tratto sotto la caviglia: con la pronazione la caviglia cade verso l'interno, con la supinazione verso l'esterno.
  const footTilt = marks.pron ? sign * -0.055 : marks.sup ? sign * 0.055 : 0;
  const sole = marks.pron || marks.sup ? 0.022 : 0;
  out += seg('foot', [P(ankSt), P([ankSt[0] - footTilt * 0.2, 1.05]), P([ankSt[0] - footTilt * 0.2 + sign * 0.075, 1.075 - (marks.sup ? sole : marks.pron ? -sole * 0.1 : 0)]), P([ankSt[0] - footTilt * 0.2 - sign * 0.06, 1.075 - (marks.pron ? sole : marks.sup ? -sole * 0.1 : 0)]), P([ankSt[0] - footTilt * 0.2, 1.05])]);
  out += seg('arm', [P(shSw), P(elA), P(wrA)]);
  out += poly([P(shSt), P(elB), P(wrB)], far);
  out += line(P([0, -0.78]), P([0, 1.12]), 'rw-mid');
  return { out, kneeSt: P(kneeSt), foot: P([ankSt[0], 1.06]), wrist: P(wrA), shoulder: P(shSw) };
}
const midOf = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function rearSvg(doc, items) {
  const fr = doc?.views?.rear?.metrics ?? doc?.views?.front?.metrics ?? null, armsFrom = doc?.views?.front?.metrics ?? fr;
  const T = wheelLimits(), man = doc?.ruota?.manual ?? {}, hid = doc?.ruota?.hidden ?? {};
  const st = (k) => items.find((i) => i.key === k)?.state;
  const has = (val, side) => val === side || val === 'B';
  const fig = (ox, stance, title) => {
    const other = stance === 'L' ? 'R' : 'L', S = 132, oy = 190;
    const valgus = stat(fr, `valgus_${stance}`), drop = stat(fr, `drop_${stance}`), arm = stat(armsFrom, `armCross_${other}`);
    const valOn = st('valgus') === 'flag' && valgus != null && T.valgus != null && valgus >= T.valgus;
    const armOn = st('arms') === 'flag' && arm != null && T.arms != null && arm >= T.arms;
    const pron = !hid.pronation && has(man.pronation, stance), sup = !hid.supination && has(man.supination, stance), shoulders = !hid.arms && !!man.shoulders;
    const err = new Set([...(valOn ? ['thigh', 'shank'] : []), ...(armOn ? ['arm'] : []), ...(pron || sup ? ['foot'] : []), ...(shoulders ? ['shoulders'] : [])]);
    const F = rearFigure(ox, oy, S, stance, { valgus: valgus ?? 0, drop: drop ?? 0, arm: arm ?? -8 }, { err, pron, sup, shoulders });
    let out = `<text x="${ox}" y="22" text-anchor="middle" class="rw-label">${title}</text>${F.out}`;
    if (valOn) out += `<text x="${f1(F.kneeSt[0] + (stance === 'L' ? -14 : 14))}" y="${f1(F.kneeSt[1] - 8)}" text-anchor="${stance === 'L' ? 'end' : 'start'}" class="rw-val err">${fmt(valgus)}°</text>${badge(F.kneeSt[0] + (stance === 'L' ? -28 : 28), F.kneeSt[1] + 18, 10)}`;
    if (armOn) out += badge(F.wrist[0] + (stance === 'L' ? -26 : 26), F.wrist[1] - 6, 9);
    if (pron) out += badge(F.foot[0] + (stance === 'L' ? -28 : 28), F.foot[1] - 8, 3, 'manual');
    if (sup) out += badge(F.foot[0] + (stance === 'L' ? -28 : 28), F.foot[1] - 8 + (pron ? -38 : 0), 4, 'manual');
    if (shoulders) out += badge(F.shoulder[0] + (stance === 'L' ? 22 : -22), F.shoulder[1] - 22, 9, 'manual');
    return out;
  };
  return `<svg viewBox="0 0 520 345" class="rw-svg" role="img" aria-label="Vista da dietro durante l'appoggio sinistro e destro">${fig(136, 'L', 'Appoggio sinistro')}${fig(384, 'R', 'Appoggio destro')}</svg>`;
}

/* ---------- sezione del report ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayText = (ms) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
function itemSign(i) {
  if (i.state === 'flag') return `<span class="rw-num">${i.n}</span>`;
  return `<span class="rw-num manual"><i>${i.n}</i></span>`;
}
function controlsHtml(doc, items) {
  const man = doc.ruota?.manual ?? {}, hid = doc.ruota?.hidden ?? {};
  const sel = (key, label) => `<label>${label} <select data-man="${key}">${[['', 'Non osservata'], ['L', 'Sinistra'], ['R', 'Destra'], ['B', 'Entrambe']].map(([v, t]) => `<option value="${v}"${(man[key] ?? '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const hide = items.filter((i) => hid[i.key] || i.state === 'flag');
  return `<details class="ruota-ctrl no-print"${man.pronation || man.supination || man.shoulders ? ' open' : ''}><summary>Segni del fisioterapista</summary>
    <p class="fine">Questi errori non si misurano in modo affidabile da video: guarda la ripresa e segnali tu. Sulla ruota compaiono con un rombo, diverso dal cerchio dei valori misurati.</p>
    <div class="ruota-sel">${sel('pronation', 'Pronazione')}${sel('supination', 'Supinazione')}<label class="check"><input type="checkbox" data-man="shoulders"${man.shoulders ? ' checked' : ''}> Spalle contratte</label></div>
    ${hide.length ? `<p class="fine">Se una misura non ti convince dopo aver guardato il video, puoi toglierla dalla ruota:</p><div class="ruota-sel">${hide.map((i) => `<label class="check"><input type="checkbox" data-hide="${i.key}"${hid[i.key] ? ' checked' : ''}> Non mostrare ${i.n}, ${esc(i.title.toLowerCase())}</label>`).join('')}</div>` : ''}</details>`;
}
function inner(doc) {
  const items = wheelItems(doc), hasSide = !!doc.views?.side;
  const flagged = items.filter((i) => i.state === 'flag' || i.state === 'manual');
  const names = (st) => items.filter((i) => i.state === st).map((i) => i.short);
  const fine = names('ok'), eye = names('eye'), none = names('none');
  const old = hasSide && !doc.views.side.wheel;
  return `<header class="ruota-head"><div><h2>La ruota della corsa</h2><p>${esc(doc.person || 'Persona non indicata')}, ${dayText(doc.createdAt)}${doc.simulated ? ', dati simulati' : ''}</p></div>
      <div class="no-print"><button type="button" class="ruota-print">Stampa solo la ruota</button></div></header>
    <p class="ruota-intro">A ogni ciclo il piede fa un giro completo: appoggio in basso, ritorno in alto. Al centro vedi il percorso del piede, intorno il corpo in ogni fase. ${old || !hasSide ? 'Questa sessione non contiene il percorso medio del piede: le figure sono schematiche.' : `Le figure sono la media di ${doc.views.side.wheel.n} passi.`} Un numero segnala ciò che supera la soglia.</p>
    <div class="ruota-grid">
      <figure class="ruota-main">${wheelSvg(doc, items)}</figure>
      <div class="ruota-right">
        <figure class="ruota-rear"><figcaption>Vista da dietro</figcaption>${rearSvg(doc, items)}</figure>
        <ul class="ruota-key">
          <li><svg width="32" height="12" aria-hidden="true"><line x1="0" x2="32" y1="6" y2="6" class="rw-near"/></svg>I tuoi passi</li>
          <li><svg width="32" height="12" aria-hidden="true"><line x1="0" x2="32" y1="6" y2="6" class="rw-ref"/></svg>Riferimento schematico</li>
          <li><svg width="32" height="14" aria-hidden="true"><line x1="3" x2="29" y1="7" y2="7" class="rw-err-o"/><line x1="3" x2="29" y1="7" y2="7" class="rw-err-i"/></svg>Parte segnalata</li>
          <li><span class="rw-num">1</span>Misurato oltre la soglia</li>
          <li><span class="rw-num manual"><i>3</i></span>Segnato dal fisioterapista</li>
        </ul>
      </div>
    </div>
    <div class="ruota-list">${flagged.length ? `<h3>Cosa vediamo</h3><ol class="ruota-ol">${flagged.map((i) => `<li>${itemSign(i)}<div><b>${esc(i.title)}</b> <span class="rw-value">${esc(i.value)}</span><br>${esc(i.plain)}</div></li>`).join('')}</ol>` : '<h3>Nessun errore segnalato</h3>'}
      ${fine.length ? `<p class="fine"><b>Entro le soglie:</b> ${esc(fine.join(', '))}.</p>` : ''}
      ${eye.length ? `<p class="fine"><b>Da valutare guardando la ripresa:</b> ${esc(eye.join(', '))}.</p>` : ''}
      ${none.length ? `<p class="fine"><b>Non misurati in questa sessione:</b> ${esc(none.join(', '))}.</p>` : ''}
      <p class="fine">Stime da video 2D, con soglie di partenza modificabili. Non sono una diagnosi: il segno indica cosa guardare insieme al fisioterapista.</p></div>
    ${controlsHtml(doc, items)}`;
}
export const ruotaSection = (doc) => `<section class="ruota-sec" id="ruota">${inner(doc)}</section>`;
export function bindRuota(root, doc, save) {
  const sec = root.querySelector('#ruota'); if (!sec) return;
  const refresh = async () => { await save(doc); const open = sec.querySelector('.ruota-ctrl')?.open; sec.innerHTML = inner(doc); if (open) sec.querySelector('.ruota-ctrl').open = true; bind(); };
  const bind = () => {
    sec.querySelector('.ruota-print').onclick = () => {
      document.body.classList.add('print-ruota');
      const done = () => { document.body.classList.remove('print-ruota'); removeEventListener('afterprint', done); };
      addEventListener('afterprint', done); print();
    };
    sec.querySelectorAll('[data-man]').forEach((el) => { el.onchange = () => { const R = doc.ruota ??= {}; R.manual ??= {}; R.manual[el.dataset.man] = el.type === 'checkbox' ? el.checked : el.value; refresh(); }; });
    sec.querySelectorAll('[data-hide]').forEach((el) => { el.onchange = () => { const R = doc.ruota ??= {}; R.hidden ??= {}; R.hidden[el.dataset.hide] = el.checked; refresh(); }; });
  };
  bind();
}
