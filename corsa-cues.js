// Immagini della correzione per lo schermo del corridore: a sinistra l'errore in rosso, a destra il gesto corretto.
const f1 = (x) => (Math.round(x * 10) / 10).toString();
const RAD = Math.PI / 180, TH = 0.25, SH = 0.25;

function ik(H, A, a, b, fwd) {
  const dx = A[0] - H[0], dy = A[1] - H[1], d = Math.min(Math.hypot(dx, dy), a + b - 1e-4), base = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const k1 = [H[0] + a * Math.cos(base + al), H[1] + a * Math.sin(base + al)], k2 = [H[0] + a * Math.cos(base - al), H[1] + a * Math.sin(base - al)];
  return (k1[0] - k2[0]) * fwd > 0 ? k1 : k2;
}
// Di lato, verso destra, al contatto del piede. y verso il basso, terreno a 0.
function sidePose({ foot = 0.05, lean = 8, bounce = 0 } = {}) {
  const H = [0, -0.47 - bounce], A = [foot, -0.04], K = ik(H, A, TH, SH, 1);
  const S = [H[0] + 0.3 * Math.sin(lean * RAD), H[1] - 0.3 * Math.cos(lean * RAD)], Hd = [S[0] + 0.1 * Math.sin(lean * RAD) + 0.02, S[1] - 0.1 * Math.cos(lean * RAD)];
  const K2 = [H[0] + 0.1, H[1] + 0.2], A2 = [K2[0] - 0.13, K2[1] + 0.14];
  const E = [S[0] - 0.07, S[1] + 0.13], W = [E[0] + 0.1, E[1] - 0.03], E2 = [S[0] + 0.07, S[1] + 0.12], W2 = [E2[0] + 0.07, E2[1] - 0.08];
  return { segs: { thigh: [H, K], shin: [K, A], foot: [A, [A[0] + 0.07, A[1] + 0.02]], thigh2: [H, K2], shin2: [K2, A2], trunk: [H, S], uarm: [S, E], farm: [E, W], uarm2: [S, E2], farm2: [E2, W2] }, far: ['thigh2', 'shin2', 'uarm2', 'farm2'], Hd };
}
// Da dietro, appoggio sul piede sinistro (a sinistra nell'immagine).
function rearPose({ valgus = 0, drop = 0, cross = 0 } = {}) {
  const hw = 0.085, Pc = [0, -0.48], dy = Math.sin(drop * RAD) * hw * 2;
  const HL = [Pc[0] - hw, Pc[1]], HR = [Pc[0] + hw, Pc[1] + dy];
  const AL = [-0.06 + cross, -0.03], KL = [(HL[0] + AL[0]) / 2 + valgus, (HL[1] + AL[1]) / 2];
  const KR = [HR[0] + 0.02, HR[1] + 0.18], AR = [KR[0] + 0.01, KR[1] + 0.2];
  const Sc = [0, -0.79], SL = [-0.12, -0.79], SR = [0.12, -0.79];
  return { segs: { thighL: [HL, KL], shinL: [KL, AL], footL: [AL, [AL[0] - 0.03, AL[1] + 0.02]], thighR: [HR, KR], shinR: [KR, AR], pelvis: [HL, HR], trunk: [Pc, Sc], shoulders: [SL, SR], uarmL: [SL, [-0.15, -0.64]], farmL: [[-0.15, -0.64], [-0.1, -0.53]], uarmR: [SR, [0.15, -0.64]], farmR: [[0.15, -0.64], [0.1, -0.53]] }, far: [], Hd: [0, -0.9], mid: true };
}
const CUES = {
  over: { pose: sidePose, wrong: { foot: 0.3 }, right: { foot: 0.05 }, parts: ['thigh', 'shin'], text: 'Appoggia il piede quasi sotto il bacino, con il ginocchio un po’ piegato: frena meno e carica meno il ginocchio.' },
  trunk: { pose: sidePose, wrong: { lean: 26 }, right: { lean: 8 }, parts: ['trunk'], text: 'Busto alto e appena inclinato in avanti, dalle caviglie, non dalla vita.' },
  trunkBack: { pose: sidePose, wrong: { lean: -10 }, right: { lean: 8 }, parts: ['trunk'], text: 'Porta il peso leggermente in avanti, dalle caviglie.' },
  osc: { pose: sidePose, wrong: { bounce: 0.08 }, right: { bounce: 0.01 }, parts: ['trunk'], arrow: true, text: 'Spingi più in avanti e meno in alto: passi più rapidi e radenti.' },
  cad: { pose: null, text: 'Passi più corti e più frequenti, alla stessa velocità.' },
  valgus: { pose: rearPose, wrong: { valgus: 0.06 }, right: { valgus: 0 }, parts: ['thighL', 'shinL'], text: 'Il ginocchio resta sopra il piede, in linea con l’anca.' },
  drop: { pose: rearPose, wrong: { drop: 12 }, right: { drop: 0 }, parts: ['pelvis'], text: 'Bacino in piano sull’appoggio: stringi il gluteo della gamba a terra.' },
  cross: { pose: rearPose, wrong: { cross: 0.1 }, right: { cross: 0 }, parts: ['footL', 'shinL'], text: 'I piedi atterrano ciascuno sulla propria linea, non al centro.' },
};
export function cueKey(key) { return key.startsWith('valgus') ? 'valgus' : key.startsWith('drop') ? 'drop' : key === 'trunk' ? 'trunk' : key; }

function steps(ox, n, len, bad) {
  let o = '';
  for (let i = 0; i < n; i++) { const x = ox + 20 + i * len, y = 120 + (i % 2 ? 18 : -18); o += `<ellipse cx="${f1(x)}" cy="${y}" rx="9" ry="5" class="${bad ? 'cue-step bad' : 'cue-step'}"/>`; }
  return o + `<text x="${ox + 85}" y="170" text-anchor="middle" class="cue-small">${bad ? `${n} passi, lunghi` : `${n} passi, corti`}</text>`;
}
// SVG con le due figure; mirror le gira come in uno specchio.
export function runCueSvg(key, { mirror = false, side = 'L' } = {}) {
  const c = CUES[cueKey(key)]; if (!c) return '';
  const PW = 170, PH = 190;
  if (!c.pose) return `<svg viewBox="0 0 ${PW * 2 + 10} ${PH}" class="cue-svg"><text x="${PW / 2}" y="18" text-anchor="middle" class="cue-lab no">✕ Così no</text>${steps(0, 3, 62, true)}<line x1="${PW + 5}" x2="${PW + 5}" y1="8" y2="${PH - 8}" class="cue-sep"/><text x="${PW * 1.5 + 10}" y="18" text-anchor="middle" class="cue-lab yes">✓ Così</text>${steps(PW + 10, 5, 34, false)}</svg>`;
  const flipSide = c.pose === rearPose && side === 'R';
  const W = c.pose(c.wrong), R = c.pose(c.right);
  const pts = [W, R].flatMap((p) => Object.values(p.segs).flat()).concat([W.Hd, R.Hd]);
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1])) - (c.arrow ? 0.2 : 0.06), maxY = 0.02;
  const sc = Math.min((PW - 30) / (maxX - minX), (PH - 44) / (maxY - minY));
  const panel = (pose, ox, bad) => {
    const P = (p) => { let x = 15 + (p[0] - minX) * sc + ((PW - 30) - (maxX - minX) * sc) / 2; if (mirror !== flipSide) x = PW - x; return [ox + x, 28 + (p[1] - minY) * sc]; };
    const ln = (a, b, cls) => { const A = P(a), B = P(b); return `<line x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(B[0])}" y2="${f1(B[1])}" class="${cls}"/>`; };
    let o = `<line x1="${ox + 6}" x2="${ox + PW - 6}" y1="${f1(P([0, 0])[1])}" y2="${f1(P([0, 0])[1])}" class="mf-ground"/>`;
    if (pose.mid) o += ln([0, -0.95], [0, 0.01], 'cue-mid');
    for (const [name, [a, b]] of Object.entries(pose.segs)) {
      const far = pose.far.includes(name);
      o += bad && c.parts.includes(name) ? ln(a, b, 'mf-err-o') + ln(a, b, 'mf-err-i') : ln(a, b, far ? 'mf-me far' : 'mf-me');
    }
    const h = P(pose.Hd); o += `<circle cx="${f1(h[0])}" cy="${f1(h[1])}" r="${f1(0.055 * sc)}" class="mf-head"/>`;
    if (c.arrow) {
      // Percorso della testa durante la corsa: un'onda alta se rimbalza, quasi piatta se corre radente.
      const amp = bad ? 11 : 2, y0 = Math.max(P(pose.Hd)[1] - 9, 26 + amp); let d = '';
      for (let i = 0; i <= 40; i++) { const x = ox + 10 + i * (PW - 20) / 40, y = y0 - amp * Math.abs(Math.sin(i / 40 * Math.PI * 3)); d += `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`; }
      o += `<path d="${d}" class="cue-arrow${bad ? ' bad' : ''}"/>`;
    }
    o += `<text x="${ox + PW / 2}" y="18" text-anchor="middle" class="cue-lab ${bad ? 'no' : 'yes'}">${bad ? '✕ Così no' : '✓ Così'}</text>`;
    return o;
  };
  return `<svg viewBox="0 0 ${PW * 2 + 10} ${PH}" class="cue-svg" role="img" aria-label="A sinistra l’errore, a destra il gesto corretto">${panel(W, 0, true)}<line x1="${PW + 5}" x2="${PW + 5}" y1="8" y2="${PH - 8}" class="cue-sep"/>${panel(R, PW + 10, false)}</svg>`;
}
export const runCueText = (key) => CUES[cueKey(key)]?.text ?? '';
