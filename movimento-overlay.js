// Disegno sopra il video: scheletro, punti di repere, archi con i gradi.
import { BONES, NAMES } from './movimento-measure.js';
export const COLORS = { L: '#4d9df0', R: '#f58a55', gold: '#ffe14d', hit: '#8df0a8', white: '#ffffff', dim: 'rgba(255,255,255,.45)' };
const KEY = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export function drawPose(c, frame, o) {
  const { W, H, aspect, mirror = false, view, labels = false, path = null, picked = null, goalHit = false, hideArcs = false } = o;
  const s = Math.min(W, H) / 720;
  const map = (p) => ({ x: ((mirror ? aspect - p.x : p.x) / aspect) * W, y: p.y * H });
  const pts = frame.P.map(map);
  c.save();
  if (path?.length > 1) {
    c.lineWidth = 2.2 * s; c.lineJoin = 'round'; c.lineCap = 'round';
    const n = path.length;
    for (let i = 1; i < n; i++) {
      c.strokeStyle = `rgba(255,225,77,${0.12 + 0.75 * (i / n)})`;
      const a = map(path[i - 1]), b = map(path[i]);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
  }
  const sideView = view === 'side';
  const stroke = (bones, col, alpha = 1) => {
    c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = 3.2 * s; c.lineCap = 'round'; c.beginPath();
    for (const [a, b] of bones) {
      if (frame.P[a].v < 0.25 || frame.P[b].v < 0.25) continue;
      c.moveTo(pts[a].x, pts[a].y); c.lineTo(pts[b].x, pts[b].y);
    }
    c.stroke(); c.globalAlpha = 1;
  };
  // Di lato la catena lontana è attenuata e disegnata per prima, così non copre quella misurata.
  const order = sideView && frame.near === 'L' ? ['R', 'L'] : ['L', 'R'];
  for (const s2 of order) stroke(BONES[s2], s2 === 'L' ? COLORS.L : COLORS.R, sideView && frame.near !== s2 ? 0.4 : 1);
  stroke(BONES.c, COLORS.white);
  for (let i = 11; i < 33; i++) {
    if (frame.P[i].v < 0.25) continue;
    const k = KEY.includes(i), r = (k ? 5.5 : 2.6) * s;
    const col = i % 2 ? COLORS.L : COLORS.R, alpha = sideView && ((i % 2 === 1) !== (frame.near === 'L')) ? 0.45 : 1;
    c.globalAlpha = alpha;
    c.beginPath(); c.arc(pts[i].x, pts[i].y, r, 0, 7); c.fillStyle = k ? '#0d1b2b' : col; c.fill();
    if (k) { c.lineWidth = 2.4 * s; c.strokeStyle = col; c.stroke(); c.beginPath(); c.arc(pts[i].x, pts[i].y, r * 0.35, 0, 7); c.fillStyle = '#fff'; c.fill(); }
    c.globalAlpha = 1;
  }
  if (labels) {
    c.font = `${Math.round(13 * s)}px Bahnschrift, Roboto, "Segoe UI", sans-serif`;
    for (const i of KEY) {
      if (frame.P[i].v < 0.4) continue;
      const tx = NAMES[i], w = c.measureText(tx).width;
      const left = (i % 2 === 0) !== (view === 'rear');
      const x = left ? pts[i].x - w - 12 * s : pts[i].x + 12 * s;
      c.fillStyle = 'rgba(13,27,43,.72)'; c.fillRect(x - 3 * s, pts[i].y - 9 * s, w + 6 * s, 17 * s);
      c.fillStyle = '#fff'; c.fillText(tx, x, pts[i].y + 4 * s);
    }
  }
  if (picked) for (const [n, i] of picked.entries()) {
    c.beginPath(); c.arc(pts[i].x, pts[i].y, 11 * s, 0, 7); c.lineWidth = 3 * s; c.strokeStyle = COLORS.gold; c.stroke();
    c.font = `600 ${Math.round(14 * s)}px Bahnschrift, Roboto, sans-serif`; c.fillStyle = COLORS.gold; c.fillText(String(n + 1), pts[i].x + 13 * s, pts[i].y - 9 * s);
  }
  if (!hideArcs) drawArcs(c, frame.draws ?? [], { map, s, W, H, mirror, aspect, goalHit });
  c.restore();
}

function drawArcs(c, draws, { map, s, W, H, mirror, goalHit }) {
  const placed = [];
  const sorted = [...draws].sort((a, b) => Number(b.primary) - Number(a.primary));
  for (const d of sorted) {
    const V = map(d.at);
    const vec = (r) => ({ x: (mirror ? -1 : 1) * r.x, y: r.y });
    const r1 = vec(d.r1), r2 = vec(d.r2);
    const a1 = Math.atan2(r1.y, r1.x), a2 = Math.atan2(r2.y, r2.x);
    let delta = a2 - a1; while (delta > Math.PI) delta -= 2 * Math.PI; while (delta <= -Math.PI) delta += 2 * Math.PI;
    const R = (d.primary ? 54 : 34) * s;
    const col = d.primary ? (goalHit ? COLORS.hit : COLORS.gold) : COLORS.white;
    if (d.guide) {
      c.setLineDash([6 * s, 6 * s]); c.lineWidth = 1.6 * s; c.strokeStyle = d.primary ? col : COLORS.dim;
      c.beginPath(); c.moveTo(V.x, V.y); c.lineTo(V.x + Math.cos(a1) * R * 1.5, V.y + Math.sin(a1) * R * 1.5); c.stroke(); c.setLineDash([]);
    }
    if (d.primary) {
      c.beginPath(); c.moveTo(V.x, V.y); c.arc(V.x, V.y, R, a1, a1 + delta, delta < 0); c.closePath();
      c.fillStyle = goalHit ? 'rgba(141,240,168,.2)' : 'rgba(255,225,77,.2)'; c.fill();
      // Tacche ogni 15 gradi, come su un goniometro
      c.lineWidth = 1.6 * s; c.strokeStyle = col;
      const step = (15 * Math.PI) / 180, n = Math.floor(Math.abs(delta) / step);
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = a1 + Math.sign(delta || 1) * i * step, l = i % 3 === 0 ? 10 : 6;
        c.moveTo(V.x + Math.cos(a) * R, V.y + Math.sin(a) * R);
        c.lineTo(V.x + Math.cos(a) * (R + l * s), V.y + Math.sin(a) * (R + l * s));
      }
      c.stroke();
    }
    c.beginPath(); c.arc(V.x, V.y, R, a1, a1 + delta, delta < 0); c.lineWidth = (d.primary ? 3.4 : 2) * s; c.strokeStyle = col; c.stroke();
    const size = Math.round((d.primary ? 33 : 21) * s);
    c.font = `${d.primary ? 700 : 600} ${size}px Bahnschrift, Roboto, "Segoe UI", sans-serif`;
    const text = `${d.v.toFixed(d.primary ? 0 : d.d ?? 0).replace('.', ',')}°`, tw = c.measureText(text).width;
    const pad = 5 * s, boxW = tw + pad * 2 + (d.side ? 6 * s : 0), boxH = size + pad * 1.6;
    const mid = a1 + delta / 2, dist = R + (d.primary ? 18 : 12) * s;
    let bx = V.x + Math.cos(mid) * dist - (Math.cos(mid) < 0 ? boxW : 0), by = V.y + Math.sin(mid) * dist - boxH / 2;
    bx = Math.max(4, Math.min(W - boxW - 4, bx)); by = Math.max(4, Math.min(H - boxH - 4, by));
    for (let t = 0; t < 8 && placed.some((q) => bx < q.x + q.w && bx + boxW > q.x && by < q.y + q.h && by + boxH > q.y); t++) by = Math.min(H - boxH - 4, by + boxH * 0.72 * (t % 2 ? -t : t) + boxH * 0.72);
    placed.push({ x: bx, y: by, w: boxW, h: boxH });
    c.fillStyle = d.primary ? col : 'rgba(13,27,43,.86)';
    c.beginPath(); c.roundRect(bx, by, boxW, boxH, 4 * s); c.fill();
    if (d.side) { c.fillStyle = d.side === 'L' ? COLORS.L : COLORS.R; c.fillRect(bx, by, 6 * s, boxH); }
    c.fillStyle = d.primary ? '#14241f' : '#fff';
    c.fillText(text, bx + pad + (d.side ? 6 * s : 0), by + boxH - pad * 1.25);
  }
}

export function nearestPoint(frame, x, y, { W, H, aspect, mirror }) {
  let best = -1, bd = Infinity;
  frame.P.forEach((p, i) => {
    if (i > 0 && i < 11) return; // il viso non serve per misurare angoli
    const px = ((mirror ? aspect - p.x : p.x) / aspect) * W, py = p.y * H, d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
