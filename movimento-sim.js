// Soggetto simulato con angoli noti: serve per la prova senza camera e per i test delle misure.
const rad = Math.PI / 180;
const THIGH = 0.21, SHANK = 0.21, TRUNK = 0.27, UARM = 0.15, FARM = 0.135, HIP_W = 0.042, SH_W = 0.08, FOOT = 0.06;
let seed = 7;
export const reseed = (s) => { seed = s; };
function gauss() { const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
const wave = (t, period) => { const u = ((t / period) % 1 + 1) % 1; return (1 - Math.cos(2 * Math.PI * u)) / 2; }; // 0 → 1 → 0, parte da 0

export const SIM_DEFAULT = { period: 3200, kneeMax: 105, tibiaMax: 32, trunkMax: 38, valgusL: 3, valgusR: 8, armMax: 165, elbowMax: 130, rotMax: 85, noise: 0.0008, dir: 1, drop: 5 };

// Gomito tra spalla e polso: delle due soluzioni sceglie quella preferita da pick.
function ik(S, W, a, b, pick) {
  const dx = W.x - S.x, dy = W.y - S.y, d = Math.min(Math.hypot(dx, dy), a + b - 1e-4), base = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const E1 = { x: S.x + a * Math.cos(base + al), y: S.y + a * Math.sin(base + al) }, E2 = { x: S.x + a * Math.cos(base - al), y: S.y + a * Math.sin(base - al) };
  return pick(E1) >= pick(E2) ? E1 : E2;
}
// Panca, piegamenti e trazioni: posizioni lontane dallo stare in piedi.
function specialPose(kind, view, S, u, cx, set, leftImg) {
  const dir = S.dir;
  const head = (x, y, side = true) => {
    set(0, x, y); for (const i of [1, 2, 3, 4, 5, 6]) set(i, x + (side ? 0 : (i < 4 ? leftImg : -leftImg) * 0.02), y - 0.012);
    set(7, x + (side ? 0.02 * dir : leftImg * 0.04), y, side ? -0.02 : 0); set(8, x + (side ? 0.02 * dir : -leftImg * 0.04), y, side ? 0.02 : 0); set(9, x, y + 0.02); set(10, x, y + 0.02);
  };
  const foot = (an, he, to, A, z = 0, fx = 0.05) => { set(an, A.x, A.y, z); set(he, A.x - 0.012 * Math.sign(fx), A.y + 0.016, z); set(to, A.x + fx, A.y + 0.018, z); };
  const hand = (wr, ix, pi, th, W, z = 0) => { set(wr, W.x, W.y, z); set(ix, W.x, W.y - 0.03, z); set(pi, W.x, W.y - 0.028, z); set(th, W.x, W.y - 0.025, z); };
  const UA = 0.15, FA = 0.135;
  if (kind === 'bench' && view === 'side') {
    // Testa a sinistra con dir = 1. Panca all'altezza y = 0.62.
    const hx = -dir, y0 = 0.62, Sh = { x: cx + 0.18 * hx, y: y0 }, Hp = { x: cx - 0.12 * hx, y: y0 - (S.bridge ?? 0) * u };
    // Di lato il braccio appare accorciato, perché è aperto verso l'esterno: si posiziona il gomito, poi l'avambraccio.
    const phi = (-90 + (90 + (S.flare ?? 40)) * u) * rad, ua = UA * (1 - 0.25 * u), psi = (S.forearm ?? 0) * u * rad;
    const E = { x: Sh.x - hx * ua * Math.cos(phi), y: Sh.y + ua * Math.sin(phi) }, W = { x: E.x + hx * FA * Math.sin(psi), y: E.y - FA * Math.cos(psi) };
    for (const [z, off] of [[-0.08, 0], [0.08, 0.003]]) {
      const L = z < 0;
      set(L ? 11 : 12, Sh.x + off, Sh.y, z); set(L ? 13 : 14, E.x + off, E.y, z); hand(L ? 15 : 16, L ? 19 : 20, L ? 17 : 18, L ? 21 : 22, { x: W.x + off, y: W.y }, z);
      set(L ? 23 : 24, Hp.x + off, Hp.y, z);
      const K = { x: Hp.x - 0.21 * hx + off, y: y0 - 0.03 }; set(L ? 25 : 26, K.x, K.y, z);
      foot(L ? 27 : 28, L ? 29 : 30, L ? 31 : 32, { x: K.x - 0.04 * hx, y: y0 + 0.2 }, z, -0.05 * hx);
    }
    head(Sh.x + 0.1 * hx, y0 - 0.015);
    return;
  }
  if (kind === 'bench') { // ai piedi della panca: braccia in alto, corpo che si allontana verso la camera
    const y0 = 0.5;
    for (const s of ['L', 'R']) {
      const g = s === 'L' ? leftImg : -leftImg, L = s === 'L', asym = L ? 0 : (S.benchAsym ?? 0);
      const Sh = { x: cx + g * 0.085, y: y0 }, E = { x: Sh.x + g * (0.01 + 0.09 * u), y: Sh.y - UA * 0.9 * (1 - u) + (0.02 - asym) * u };
      const W = { x: E.x + g * (S.wristOut ?? 0) * u, y: E.y - FA * 0.95 };
      set(L ? 11 : 12, Sh.x, Sh.y); set(L ? 13 : 14, E.x, E.y); hand(L ? 15 : 16, L ? 19 : 20, L ? 17 : 18, L ? 21 : 22, W);
      set(L ? 23 : 24, cx + g * 0.045, y0 + 0.17); set(L ? 25 : 26, cx + g * 0.08, y0 + 0.3); foot(L ? 27 : 28, L ? 29 : 30, L ? 31 : 32, { x: cx + g * 0.1, y: y0 + 0.42 }, 0, g * 0.012);
    }
    head(cx, y0 - 0.06, false);
    return;
  }
  if (kind === 'pushup') {
    const fx = dir, gy = 0.86, W = { x: cx - 0.12 * fx, y: gy }, A = { x: cx + 0.42 * fx, y: gy - 0.01 };
    const Sh = { x: W.x + 0.01 * fx + 0.03 * fx * u, y: gy - (UA + FA) * 0.97 + ((UA + FA) * 0.97 - 0.1) * u };
    const E = ik(Sh, W, UA, FA, (e) => (e.x - Sh.x) * fx);
    const on = (k) => ({ x: Sh.x + (A.x - Sh.x) * k, y: Sh.y + (A.y - Sh.y) * k });
    const Hp = on(0.45); Hp.y += (S.sag ?? 0); const K = on(0.72); K.y += (S.sag ?? 0) * 0.4;
    for (const [z, off] of [[-0.08, 0], [0.08, 0.003]]) {
      const L = z < 0;
      set(L ? 11 : 12, Sh.x + off, Sh.y, z); set(L ? 13 : 14, E.x + off, E.y, z); hand(L ? 15 : 16, L ? 19 : 20, L ? 17 : 18, L ? 21 : 22, { x: W.x + off, y: W.y }, z);
      set(L ? 23 : 24, Hp.x + off, Hp.y, z); set(L ? 25 : 26, K.x + off, K.y, z); foot(L ? 27 : 28, L ? 29 : 30, L ? 31 : 32, { x: A.x + off, y: A.y }, z, 0.03 * fx);
    }
    head(Sh.x - 0.1 * fx, Sh.y + 0.01);
    return;
  }
  // Trazioni: barra in alto, il corpo sale.
  const bar = 0.05, hang = bar + (UA + FA) * 0.97, topY = bar + (S.pullTop ?? 0.05);
  const shY = hang + (topY - hang) * u;
  if (view === 'side') {
    const W = { x: cx + 0.03 * dir, y: bar }, Sh = { x: cx - 0.02 * dir, y: shY };
    const E = ik(Sh, W, UA, FA, (e) => (e.x - Sh.x) * dir);
    const lean = (S.swing ?? 0) * Math.sin(2 * Math.PI * u) * Math.PI / 180, Hp = { x: Sh.x - Math.sin(lean) * 0.27 * dir, y: Sh.y + 0.27 * Math.cos(lean) };
    const kip = (S.kip ?? 0) * u * Math.PI / 180;
    const K = { x: Hp.x + Math.sin(kip) * 0.21 * dir, y: Hp.y + Math.cos(kip) * 0.21 }, A = { x: K.x + Math.sin(kip * 0.6) * 0.21 * dir, y: K.y + 0.21 * Math.cos(kip * 0.6) };
    for (const [z, off] of [[-0.08, 0], [0.08, 0.003]]) {
      const L = z < 0;
      set(L ? 11 : 12, Sh.x + off, Sh.y, z); set(L ? 13 : 14, E.x + off, E.y, z); hand(L ? 15 : 16, L ? 19 : 20, L ? 17 : 18, L ? 21 : 22, { x: W.x + off, y: W.y }, z);
      set(L ? 23 : 24, Hp.x + off, Hp.y, z); set(L ? 25 : 26, K.x + off, K.y, z); foot(L ? 27 : 28, L ? 29 : 30, L ? 31 : 32, { x: A.x + off, y: A.y }, z, 0.04 * dir);
    }
    head(Sh.x + 0.015 * dir, Sh.y - 0.1);
    return;
  }
  for (const s of ['L', 'R']) {
    const g = s === 'L' ? leftImg : -leftImg, L = s === 'L', low = L ? 0 : (S.pullAsym ?? 0) * u;
    const Sh = { x: cx + g * 0.08, y: shY + low }, W = { x: cx + g * 0.17, y: bar };
    const E = ik(Sh, W, UA, FA, (e) => Math.abs(e.x - cx));
    set(L ? 11 : 12, Sh.x, Sh.y); set(L ? 13 : 14, E.x, E.y); hand(L ? 15 : 16, L ? 19 : 20, L ? 17 : 18, L ? 21 : 22, W);
    const Hp = { x: cx + g * 0.042, y: shY + 0.27 }; set(L ? 23 : 24, Hp.x, Hp.y); set(L ? 25 : 26, Hp.x + g * 0.005, Hp.y + 0.21); foot(L ? 27 : 28, L ? 29 : 30, L ? 31 : 32, { x: Hp.x + g * 0.01, y: Hp.y + 0.42 }, 0, g * 0.012);
  }
  head(cx, shY - 0.1, false);
}

const HINGE = { deadlift: [80, 14, 58], sumodl: [85, 8, 42], trapbar: [95, 22, 40], rdl: [22, 4, 75], stiff: [8, 0, 80], slrdl: [18, 4, 80], row: [25, 8, 50] };

export function simulate(kind, view, t, params = {}, aspect = 16 / 9) {
  const S = { ...SIM_DEFAULT, ...params }, dir = S.dir;
  const pts = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0.97 }));
  const set = (i, x, y, z = 0, v = 0.97) => { pts[i] = { x, y, z, v }; };
  const cx = aspect / 2, u = wave(t, S.period);
  const leftImg = view === 'rear' ? -1 : 1; // da davanti la sinistra del soggetto è a destra nell'immagine
  const standing = { hipY: 0.5, knee: 0, tibia: 0, trunk: 0 };
  let squat = { ...standing };
  if (['squat', 'overhead', 'single', 'lunge'].includes(kind)) squat = { knee: S.kneeMax * u, tibia: S.tibiaMax * u, trunk: S.trunkMax * u };
  const hinge = HINGE[kind];
  if (hinge) {
    const [k, tb, tr] = [S.hingeKnee ?? hinge[0], hinge[1], S.hingeTrunk ?? hinge[2]], w = kind === 'row' ? 1 : u;
    squat = { knee: k * w, tibia: tb * w, trunk: tr * w - (S.lockBack ?? 0) * (1 - w) };
  }

  if (kind === 'bench' || kind === 'pushup' || kind === 'pull') specialPose(kind, view, S, u, cx, set, leftImg);
  else if (view === 'side') {
    // Catena vicina = sinistra (z più piccola), lontana = destra
    const near = S.near ?? 'L', far = near === 'L' ? 'R' : 'L';
    const idx = (s) => (s === 'L' ? { sh: 11, el: 13, wr: 15, pi: 17, ix: 19, th: 21, hip: 23, kn: 25, an: 27, he: 29, to: 31, ear: 7 } : { sh: 12, el: 14, wr: 16, pi: 18, ix: 20, th: 22, hip: 24, kn: 26, an: 28, he: 30, to: 32, ear: 8 });
    const groundY = 0.9;
    const ankX = cx;
    const placeLeg = (s, knee, tibia, z, ankOff = 0, hipPos = null) => {
      const c = idx(s), A = { x: ankX + ankOff, y: groundY - 0.02 };
      const K = { x: A.x + dir * Math.sin(tibia * rad) * SHANK, y: A.y - Math.cos(tibia * rad) * SHANK };
      const thighBack = knee - tibia; // inclinazione indietro della coscia rispetto alla verticale
      const H = hipPos ?? { x: K.x - dir * Math.sin(thighBack * rad) * THIGH, y: K.y - Math.cos(thighBack * rad) * THIGH };
      set(c.an, A.x, A.y, z); set(c.kn, K.x, K.y, z); set(c.hip, H.x, H.y, z);
      set(c.he, A.x - dir * 0.012, A.y + 0.016, z); set(c.to, A.x + dir * FOOT, A.y + 0.018, z);
      return H;
    };
    let H;
    if (kind === 'lunge') {
      const knee = S.kneeMax * u, tibia = 10 * u;
      H = placeLeg(near, knee, tibia, -0.08, 0.08 * dir);
      const rearAnk = { x: H.x - dir * 0.2, y: groundY - 0.02 };
      const c = idx(far); const m = { x: (H.x + rearAnk.x) / 2, y: (H.y + rearAnk.y) / 2 };
      set(c.hip, H.x, H.y, 0.08); set(c.kn, m.x + dir * 0.04, m.y, 0.08); set(c.an, rearAnk.x, rearAnk.y, 0.08);
      set(c.he, rearAnk.x - dir * 0.012, rearAnk.y + 0.016, 0.08); set(c.to, rearAnk.x + dir * FOOT, rearAnk.y + 0.018, 0.08);
    } else if (kind === 'slrdl') {
      H = placeLeg(near, squat.knee, squat.tibia, -0.08);
      const c = idx(far), lean = squat.trunk * rad, back = { x: -dir * Math.sin(lean), y: Math.cos(lean) };
      const K = { x: H.x + back.x * THIGH, y: H.y + back.y * THIGH }, A = { x: K.x + back.x * SHANK, y: K.y + back.y * SHANK };
      set(c.hip, H.x, H.y, 0.08); set(c.kn, K.x, K.y, 0.08); set(c.an, A.x, A.y, 0.08); set(c.he, A.x, A.y + 0.01, 0.08); set(c.to, A.x + dir * 0.02, A.y + 0.04, 0.08);
    } else if (kind === 'single') {
      H = placeLeg(near, squat.knee, squat.tibia, -0.08);
      const c = idx(far); set(c.hip, H.x, H.y, 0.08); set(c.kn, H.x + dir * 0.17, H.y + 0.04, 0.08); set(c.an, H.x + dir * 0.3, H.y + 0.03, 0.08); set(c.he, H.x + dir * 0.3, H.y + 0.05, 0.08); set(c.to, H.x + dir * 0.36, H.y + 0.01, 0.08);
    } else {
      H = placeLeg(near, squat.knee, squat.tibia, -0.08);
      placeLeg(far, squat.knee, squat.tibia, 0.08, 0.002);
      pts[idx(far).hip] = { ...pts[idx(far).hip], x: H.x, y: H.y };
    }
    const lean = (kind === 'lunge' ? 8 * u : squat.trunk) * rad;
    const Sh = { x: H.x + dir * Math.sin(lean) * TRUNK, y: H.y - Math.cos(lean) * TRUNK };
    const placeArm = (s, sh, el, z) => {
      const c = idx(s), Hm = { x: H.x, y: H.y };
      const down = Math.atan2(Hm.x - Sh.x, Hm.y - Sh.y); // direzione tronco verso il basso
      const a = down + dir * sh * rad;
      const E = { x: Sh.x + Math.sin(a) * UARM, y: Sh.y + Math.cos(a) * UARM };
      const a2 = a + dir * el * rad;
      const W = { x: E.x + Math.sin(a2) * FARM, y: E.y + Math.cos(a2) * FARM };
      set(c.sh, Sh.x, Sh.y, z); set(c.el, E.x, E.y, z); set(c.wr, W.x, W.y, z);
      const ix = a2 + dir * (S.wristNow ?? 0) * rad;
      set(c.ix, W.x + Math.sin(ix) * 0.05, W.y + Math.cos(ix) * 0.05, z); set(c.pi, W.x + Math.sin(ix) * 0.045, W.y + Math.cos(ix) * 0.045, z); set(c.th, W.x + Math.sin(ix) * 0.035, W.y + Math.cos(ix) * 0.035, z);
    };
    let sh = 12, el = 25, shFar = 12, elFar = 25;
    if (kind === 'flex') { sh = 5 + (S.armMax - 5) * u; el = 5; shFar = 5; elFar = 8; }
    else if (kind === 'ext') { sh = 2 - (S.extMax ?? 50) * u; el = 5; shFar = 5; elFar = 8; }
    else if (kind === 'elbow') { sh = 4; el = 5 + S.elbowMax * u; shFar = 4; elFar = 5 + S.elbowMax * u; }
    else if (kind === 'overhead') { sh = 175 - (S.armDrop ?? 0) * u; el = 3; shFar = sh; elFar = 3; }
    else if (kind === 'rot') { sh = 90; el = 90; S.forearmNow = (S.rotBase ?? -10) + (S.rotMax - (S.rotBase ?? -10)) * u; }
    else if (kind === 'wrist') { sh = 45; el = 55; S.wristNow = 55 * u; }
    else if (hinge && kind !== 'row') {
      // Braccia verso la barra, che resta sopra il centro del piede salvo barAhead (in gradi in avanti).
      const footX = ankX + dir * 0.024, back = Math.asin(Math.max(-1, Math.min(1, (Sh.x - footX) * dir / (UARM + FARM)))) / rad;
      sh = squat.trunk - back + (S.barAhead ?? 0) * u; el = 2; shFar = sh; elFar = 2;
    }
    else if (kind === 'row') { sh = squat.trunk - 110 * u; el = 5 + 95 * u; shFar = sh; elFar = el; }
    placeArm(far, shFar, elFar, 0.08);
    placeArm(near, sh, el, -0.08);
    if (kind === 'rot') {
      const c = idx(near), E = pts[c.el], a = S.forearmNow * rad;
      set(c.wr, E.x + dir * Math.cos(a) * FARM, E.y - Math.sin(a) * FARM, -0.08); set(c.ix, pts[c.wr].x, pts[c.wr].y - 0.04, -0.08);
    }
    const head = { x: Sh.x + dir * Math.sin(lean) * 0.1 + dir * 0.015, y: Sh.y - Math.cos(lean) * 0.1 };
    set(0, head.x + dir * 0.035, head.y + 0.01); for (const i of [1, 2, 3, 4, 5, 6]) set(i, head.x + dir * 0.03, head.y - 0.005);
    set(7, head.x - dir * 0.005, head.y, -0.02); set(8, head.x - dir * 0.005, head.y, 0.02); set(9, head.x + dir * 0.03, head.y + 0.025); set(10, head.x + dir * 0.03, head.y + 0.025);
  } else {
    const L = leftImg, drop = kind === 'single' ? S.drop * u : 0;
    let hipY = 0.5, armsL = 8, armsR = 8, elL = 8, elR = 8;
    const legFold = kind === 'single' ? 0 : squat.knee;
    if (['squat', 'overhead', 'lunge'].includes(kind)) hipY = 0.48 + (1 - Math.cos(legFold * rad / 2)) * (THIGH + SHANK);
    if (hinge) hipY = 0.48 + (1 - Math.cos(hinge[0] * u * rad / 2)) * (THIGH + SHANK) * 0.8;
    if (kind === 'single') hipY = 0.48 + (1 - Math.cos(S.kneeMax * u * rad / 2)) * (THIGH + SHANK);
    if (kind === 'abd') { const uL = wave(t, S.period), uR = wave(t, S.period); armsL = 5 + (S.armMax - 5) * uL; armsR = 5 + ((S.armMaxR ?? S.armMax - 15) - 5) * uR; elL = elR = 4; }
    if (kind === 'press') { armsL = 70 + 100 * u; armsR = 70 + 92 * u; elL = 100 * (1 - u) + 5; elR = 100 * (1 - u) + 5; }
    if (kind === 'elbow') { elL = 5 + S.elbowMax * u; elR = 5 + (S.elbowMax - 12) * u; armsL = armsR = 5; }
    if (kind === 'overhead') { armsL = 172; armsR = 165; elL = elR = 4; }
    const shY = hipY - TRUNK;
    const dy = Math.tan(drop * rad) * HIP_W; // gamba di lavoro = sinistra: l'anca destra cade
    const hipL = { x: cx + L * HIP_W, y: hipY - dy }, hipR = { x: cx - L * HIP_W, y: hipY + dy };
    const placeLeg = (s, sign, hip, valgus, z) => {
      const idx = s === 'L' ? { kn: 25, an: 27, he: 29, to: 31, hp: 23 } : { kn: 26, an: 28, he: 30, to: 32, hp: 24 };
      const A = { x: cx + sign * 0.07, y: 0.88 };
      const mx = (hip.x + A.x) / 2, my = (hip.y + A.y) / 2;
      const half = Math.hypot(A.x - hip.x, A.y - hip.y) / 2;
      const K = { x: mx - sign * Math.tan((valgus * rad) / 2) * half, y: my };
      set(idx.hp, hip.x, hip.y, z); set(idx.kn, K.x, K.y, z); set(idx.an, A.x, A.y, z); set(idx.he, A.x, A.y + 0.02, z); set(idx.to, A.x + sign * 0.012, A.y + 0.024, z);
    };
    const peak = u;
    placeLeg('L', L, hipL, S.valgusL * peak, 0);
    if (kind === 'single') {
      set(24, hipR.x, hipR.y); const fy = Math.min(hipR.y + 0.26, 0.78); set(26, hipR.x - L * 0.03, (hipR.y + fy) / 2); set(28, hipR.x - L * 0.06, fy); set(30, hipR.x - L * 0.06, fy + 0.02); set(32, hipR.x - L * 0.07, fy + 0.03);
    } else placeLeg('R', -L, hipR, S.valgusR * peak, 0);
    const shL = { x: cx + L * SH_W, y: shY }, shR = { x: cx - L * SH_W, y: shY };
    const placeArm = (sign, sh, arm, el, s) => {
      const idx = s === 'L' ? { sh: 11, el: 13, wr: 15, pi: 17, ix: 19, th: 21 } : { sh: 12, el: 14, wr: 16, pi: 18, ix: 20, th: 22 };
      const down = Math.atan2((s === 'L' ? hipL.x : hipR.x) - sh.x, HIP_W * 0 + (s === 'L' ? hipL.y : hipR.y) - sh.y);
      const a = down + sign * arm * rad;
      const E = { x: sh.x + Math.sin(a) * UARM, y: sh.y + Math.cos(a) * UARM };
      const a2 = a + sign * el * rad;
      const W = { x: E.x + Math.sin(a2) * FARM, y: E.y + Math.cos(a2) * FARM };
      set(idx.sh, sh.x, sh.y); set(idx.el, E.x, E.y); set(idx.wr, W.x, W.y); set(idx.ix, W.x, W.y + 0.04); set(idx.pi, W.x, W.y + 0.035); set(idx.th, W.x, W.y + 0.03);
    };
    placeArm(L, shL, armsL, elL, 'L'); placeArm(-L, shR, armsR, elR, 'R');
    const hy = shY - 0.1;
    set(0, cx, hy); for (const i of [1, 2, 3, 4, 5, 6]) set(i, cx + (i < 4 ? L : -L) * 0.02, hy - 0.012);
    set(7, cx + L * 0.04, hy - 0.005); set(8, cx - L * 0.04, hy - 0.005); set(9, cx + L * 0.012, hy + 0.025); set(10, cx - L * 0.012, hy + 0.025);
    if (view === 'rear' && S.swapRear) for (const [a, b] of [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) { const x = pts[a]; pts[a] = pts[b]; pts[b] = x; }
  }
  if (S.swapSide && view === 'side' && S.swapSide(t)) for (const [a, b] of [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) { const x = pts[a]; pts[a] = pts[b]; pts[b] = x; }
  return pts.map((p) => ({ x: (p.x + gauss() * S.noise) / aspect, y: p.y + gauss() * S.noise, z: p.z, visibility: p.v }));
}
