// Soggetto simulato con angoli noti: serve per la prova senza camera e per i test delle misure.
const rad = Math.PI / 180;
const THIGH = 0.21, SHANK = 0.21, TRUNK = 0.27, UARM = 0.15, FARM = 0.135, HIP_W = 0.042, SH_W = 0.08, FOOT = 0.06;
let seed = 7;
export const reseed = (s) => { seed = s; };
function gauss() { const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
const wave = (t, period) => { const u = ((t / period) % 1 + 1) % 1; return (1 - Math.cos(2 * Math.PI * u)) / 2; }; // 0 → 1 → 0, parte da 0

export const SIM_DEFAULT = { period: 3200, kneeMax: 105, tibiaMax: 32, trunkMax: 38, valgusL: 3, valgusR: 8, armMax: 165, elbowMax: 130, rotMax: 85, noise: 0.0008, dir: 1, drop: 5 };

export function simulate(kind, view, t, params = {}, aspect = 16 / 9) {
  const S = { ...SIM_DEFAULT, ...params }, dir = S.dir;
  const pts = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0.97 }));
  const set = (i, x, y, z = 0, v = 0.97) => { pts[i] = { x, y, z, v }; };
  const cx = aspect / 2, u = wave(t, S.period);
  const leftImg = view === 'rear' ? -1 : 1; // da davanti la sinistra del soggetto è a destra nell'immagine
  const standing = { hipY: 0.5, knee: 0, tibia: 0, trunk: 0 };
  let squat = { ...standing };
  if (['squat', 'overhead', 'single', 'lunge'].includes(kind)) squat = { knee: S.kneeMax * u, tibia: S.tibiaMax * u, trunk: S.trunkMax * u };

  if (view === 'side') {
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
