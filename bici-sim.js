// Ciclista virtuale con misure note, per provare il programma senza bici né camera.
export const DEMO = { cadence: 88, saddle: -0.011, trunk: 42, shoulder: 88, elbow: 18, rock: 0, kneeWobble: 0.0006, kneeWobbleR: 0.0006, pelvisRock: 2, ankling: 18, ankPhase: 200 };
const RAD = Math.PI / 180;

function ik(H, A, a, b, dir) {
  const dx = A.x - H.x, dy = A.y - H.y, d = Math.min(Math.hypot(dx, dy), a + b - 1e-4), base = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const k1 = { x: H.x + a * Math.cos(base + al), y: H.y + a * Math.sin(base + al) }, k2 = { x: H.x + a * Math.cos(base - al), y: H.y + a * Math.sin(base - al) };
  return (k1.x - k2.x) * dir > 0 ? k1 : k2;
}

export function simulate(view, t, params = {}, aspect = 16 / 9) {
  const S = { ...DEMO, ...params }, th = (t / (60000 / S.cadence)) * 2 * Math.PI + Math.PI / 2;
  const P = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.97 }));
  const set = (i, x, y, z = 0) => { P[i].x = x; P[i].y = y; P[i].z = z; };
  const TH = 0.19, SH = 0.185, CR = 0.07, TR = 0.3, UA = 0.15, FA = 0.14;
  if (view === 'side') {
    const dir = 1, C = { x: aspect * 0.5, y: 0.74 };
    const H = { x: C.x - dir * 0.089, y: C.y - 0.315 - (S.saddle ?? 0) + (S.rock ?? 0) * Math.sin(2 * th) };
    const leg = (ang, near) => {
      const sp = { x: C.x + dir * CR * Math.cos(ang), y: C.y + CR * Math.sin(ang) }, phi = (S.ankling ?? 6) * Math.sin(ang + (S.ankPhase ?? 0) * RAD) * RAD;
      const rot = (vx, vy) => ({ x: sp.x + dir * (vx * Math.cos(phi) - vy * Math.sin(phi)), y: sp.y + (vx * Math.sin(phi) + vy * Math.cos(phi)) });
      const A = rot(-0.045, -0.032), T = rot(0.03, 0.006), He = rot(-0.07, -0.01);
      const K = ik(H, A, TH, SH, dir), z = near ? -0.1 : 0.1, L = near;
      set(L ? 23 : 24, H.x + (near ? 0 : 0.004), H.y, z); set(L ? 25 : 26, K.x, K.y, z); set(L ? 27 : 28, A.x, A.y, z); set(L ? 29 : 30, He.x, He.y, z); set(L ? 31 : 32, T.x, T.y, z);
    };
    leg(th, true); leg(th + Math.PI, false);
    const a = S.trunk * RAD, Sh = { x: H.x + dir * TR * Math.cos(a), y: H.y - TR * Math.sin(a) };
    const toHip = Math.atan2(H.y - Sh.y, H.x - Sh.x), ua = toHip - dir * S.shoulder * RAD, fa = ua + dir * S.elbow * RAD;
    const E = { x: Sh.x + UA * Math.cos(ua), y: Sh.y + UA * Math.sin(ua) }, W = { x: E.x + FA * Math.cos(fa), y: E.y + FA * Math.sin(fa) };
    for (const [L, z] of [[true, -0.1], [false, 0.1]]) {
      const o = L ? 0 : 0.004;
      set(L ? 11 : 12, Sh.x + o, Sh.y, z); set(L ? 13 : 14, E.x + o, E.y, z); set(L ? 15 : 16, W.x + o, W.y, z);
      for (const i of L ? [17, 19, 21] : [18, 20, 22]) set(i, W.x + dir * 0.02 + o, W.y + 0.01, z);
    }
    set(0, Sh.x + dir * 0.09, Sh.y - 0.07); for (const i of [1, 2, 3, 4, 5, 6]) set(i, Sh.x + dir * 0.08, Sh.y - 0.085); set(7, Sh.x + dir * 0.04, Sh.y - 0.08, -0.05); set(8, Sh.x + dir * 0.04, Sh.y - 0.08, 0.05); set(9, Sh.x + dir * 0.085, Sh.y - 0.05); set(10, Sh.x + dir * 0.085, Sh.y - 0.05);
  } else {
    // Da davanti la sinistra del ciclista è a destra nell'immagine; da dietro a sinistra.
    const cx = aspect * 0.5, g = (s) => ((s === 'L') === (view === 'rear') ? -1 : 1);
    const rock = (S.pelvisRock ?? 0) * Math.sin(th) * RAD;
    for (const s of ['L', 'R']) {
      const ang = s === 'L' ? th : th + Math.PI, L = s === 'L';
      const hip = { x: cx + g(s) * 0.075, y: 0.45 + (L ? -1 : 1) * 0.075 * Math.sin(rock) };
      const ankY = 0.78 + CR * Math.sin(ang), wob = (L ? S.kneeWobble : S.kneeWobbleR) ?? 0;
      const knee = { x: cx + g(s) * (0.085 + wob * Math.sin(ang) * 6), y: 0.6 + 0.06 * Math.sin(ang) };
      const ank = { x: cx + g(s) * 0.09, y: ankY };
      set(L ? 23 : 24, hip.x, hip.y); set(L ? 25 : 26, knee.x, knee.y); set(L ? 27 : 28, ank.x, ank.y);
      set(L ? 29 : 30, ank.x, ank.y + 0.015); set(L ? 31 : 32, ank.x + g(s) * 0.005, ank.y + 0.03);
      set(L ? 11 : 12, cx + g(s) * 0.11, 0.3); set(L ? 13 : 14, cx + g(s) * 0.16, 0.36); set(L ? 15 : 16, cx + g(s) * 0.2, 0.4);
      for (const i of L ? [17, 19, 21] : [18, 20, 22]) set(i, cx + g(s) * 0.21, 0.41);
    }
    set(0, cx, 0.22); for (const i of [1, 2, 3, 4, 5, 6]) set(i, cx + (i < 4 ? -1 : 1) * 0.02, 0.21); set(7, cx - 0.04, 0.22); set(8, cx + 0.04, 0.22); set(9, cx - 0.01, 0.24); set(10, cx + 0.01, 0.24);
  }
  for (const p of P) p.x /= aspect;
  return P;
}
