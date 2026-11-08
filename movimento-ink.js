// Figura per la stampa: linee scure su fondo bianco, ritagliata sulla persona. Pochissimo inchiostro.
// P: punti del corpo con x in unità di larghezza (0..aspect), y in 0..1, v visibilità.
const BL = [[11, 23], [11, 13], [13, 15], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31]];
const BR = [[12, 24], [12, 14], [14, 16], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]];
const BC = [[11, 12], [23, 24]];

export function inkFigure(P, { mirror = false, aspect = 1, side = false, near = 'L', W = 300, H = 380 } = {}) {
  if (!P?.length) return null;
  const ok = (i) => P[i] && (P[i].v ?? P[i].visibility ?? 1) >= 0.25;
  const X = (p) => (mirror ? aspect - p.x : p.x);
  const idx = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].filter(ok);
  if (idx.length < 6) return null;
  const xs = idx.map((i) => X(P[i])), ys = idx.map((i) => P[i].y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const hd = ok(0) && ok(11) && ok(12) ? Math.hypot(X(P[0]) - (X(P[11]) + X(P[12])) / 2, P[0].y - (P[11].y + P[12].y) / 2) * 0.55 : 0;
  y0 -= hd * 1.4;
  const pad = (y1 - y0) * 0.08, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
  const s = Math.min(W / bw, H / bh), ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const M = (p) => [ox + (X(p) - x0) * s, oy + (p.y - y0) * s];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  c.lineCap = 'round'; c.lineJoin = 'round';
  // Terreno
  const gy = oy + (y1 - y0) * s + 3; c.strokeStyle = '#b9c1c9'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(10, gy); c.lineTo(W - 10, gy); c.stroke();
  const lw = Math.max(3, H / 95);
  const draw = (bones, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (const [a, b] of bones) { if (!ok(a) || !ok(b)) continue; const A = M(P[a]), B = M(P[b]); c.moveTo(...A); c.lineTo(...B); } c.stroke(); };
  if (side) {
    const far = near === 'L' ? BR : BL, nr = near === 'L' ? BL : BR;
    draw(far, '#a3adb7', lw * 0.8); draw(BC, '#a3adb7', lw * 0.8); draw(nr, '#1b2630', lw);
  } else {
    draw(BC, '#1b2630', lw); draw(BL, '#1f5fa8', lw); draw(BR, '#c4561f', lw);
  }
  for (const i of [11, 12, 23, 24, 25, 26, 27, 28]) {
    if (!ok(i)) continue;
    const q = M(P[i]); c.beginPath(); c.arc(q[0], q[1], lw * 0.95, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = lw * 0.55; c.strokeStyle = '#1b2630'; c.stroke();
  }
  if (hd) { const h = M(P[0]); c.beginPath(); c.arc(h[0], h[1], Math.max(lw * 2, hd * s * 0.75), 0, 7); c.lineWidth = lw * 0.8; c.strokeStyle = '#1b2630'; c.stroke(); }
  return cv.toDataURL('image/png');
}
