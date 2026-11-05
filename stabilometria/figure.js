// Disegni: pedana, piedi divisi in zone, traccia del centro di pressione, andamento nel tempo.
import { SENSOR_X, SENSOR_Y, BOARD_W, BOARD_D } from './signal.js';
import { loadPair, mark as asymMark } from '../asym.js';
const it = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
let uid = 0;

// Contorno di pianta del piede sinistro, disegnato per questa app. u: 0 laterale, 0,4 mediale; v: 0 tallone, 1 punta.
const SOLE = [[0.20, 0.0], [0.06, 0.02, 0.04, 0.12, 0.05, 0.20], [0.06, 0.35, 0.03, 0.48, 0.02, 0.60], [0.01, 0.68, 0.03, 0.76, 0.07, 0.79], [0.14, 0.84, 0.28, 0.86, 0.36, 0.80], [0.41, 0.75, 0.40, 0.66, 0.35, 0.58], [0.29, 0.47, 0.30, 0.33, 0.33, 0.22], [0.35, 0.12, 0.30, 0.01, 0.20, 0.0]];
const TOES = [[0.33, 0.925, 0.055, 0.07], [0.225, 0.905, 0.033, 0.045], [0.16, 0.885, 0.03, 0.04], [0.105, 0.855, 0.027, 0.036], [0.06, 0.81, 0.024, 0.03]];
function footGeom(cx, yMid, len, side) {
  const sign = side === 'L' ? 1 : -1, y0 = yMid - len / 2;
  const X = (u) => cx + (u - 0.2) * len * sign, Y = (v) => -(y0 + v * len);
  const [s, ...rest] = SOLE;
  const d = `M${X(s[0]).toFixed(1)} ${Y(s[1]).toFixed(1)}${rest.map((c) => `C${X(c[0]).toFixed(1)} ${Y(c[1]).toFixed(1)} ${X(c[2]).toFixed(1)} ${Y(c[3]).toFixed(1)} ${X(c[4]).toFixed(1)} ${Y(c[5]).toFixed(1)}`).join('')}Z`;
  const toes = TOES.map(([u, v, rx, ry]) => `<ellipse cx="${X(u).toFixed(1)}" cy="${Y(v).toFixed(1)}" rx="${(rx * len).toFixed(1)}" ry="${(ry * len).toFixed(1)}"/>`).join('');
  return { d, toes, Y, cx, sign, len };
}

function zoneColor(pct) {
  const u = Math.max(0, Math.min(1, (pct - 10) / 25)), a = [253, 231, 214], b = [168, 44, 22];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * u));
  return { fill: `rgb(${c.join(',')})`, ink: u > 0.55 ? '#fff' : '#10243a' };
}
const boardRect = () => `<rect x="${-BOARD_W / 2}" y="${-BOARD_D / 2}" width="${BOARD_W}" height="${BOARD_D}" rx="26" class="fig-board"/>`;

// Figura del report: piedi nella posizione reale, quattro zone, centro di pressione medio.
export function plateFigure({ placement: p, loads, cop }) {
  const id = ++uid;
  const yMid = p.yMid ?? (p.yHeel + 0.35 * p.footLen), xs = { L: p.xL, R: p.xR }, asym = loadPair(loads);
  const feet = ['L', 'R'].map((side) => {
    const g = footGeom(xs[side], yMid, p.footLen, side), split = g.Y(0.5);
    const fz = zoneColor(loads.zones[`${side}F`]), rz = zoneColor(loads.zones[`${side}R`]);
    const topY = -BOARD_D / 2 - 12;
    return `<g class="fig-foot">
      <clipPath id="f${id}${side}"><rect x="-400" y="-400" width="800" height="${400 + split}"/></clipPath>
      <clipPath id="r${id}${side}"><rect x="-400" y="${split}" width="800" height="400"/></clipPath>
      <g clip-path="url(#f${id}${side})" fill="${fz.fill}"><path d="${g.d}"/>${g.toes}</g>
      <g clip-path="url(#r${id}${side})" fill="${rz.fill}"><path d="${g.d}"/></g>
      <path d="${g.d}" fill="none" class="fig-outline"/><g fill="none" class="fig-outline">${g.toes}</g>
      <line x1="${g.cx - 0.2 * p.footLen}" x2="${g.cx + 0.2 * p.footLen}" y1="${split}" y2="${split}" class="fig-split"/>
      <text x="${g.cx}" y="${g.Y(0.69)}" text-anchor="middle" fill="${fz.ink}" class="fig-pct">${it(loads.zones[`${side}F`])}%</text>
      <text x="${g.cx}" y="${g.Y(0.25)}" text-anchor="middle" fill="${rz.ink}" class="fig-pct">${it(loads.zones[`${side}R`])}%</text>
      <text x="${g.cx}" y="${topY}" text-anchor="middle" class="fig-side">${side === 'L' ? 'Sinistro' : 'Destro'} ${it(side === 'L' ? loads.left : loads.right)}%${asym?.level && asym.side === side ? ` ${asymMark(asym.level)}` : ''}</text></g>`;
  }).join('');
  const sensors = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([a, b]) => `<circle cx="${(a * SENSOR_X) / 2}" cy="${(-b * SENSOR_Y) / 2}" r="7" class="fig-sensor"/>`).join('');
  const mark = cop ? `<g class="fig-cop"><circle cx="${cop.x}" cy="${-cop.y}" r="9"/><line x1="${cop.x - 16}" x2="${cop.x + 16}" y1="${-cop.y}" y2="${-cop.y}"/><line x1="${cop.x}" x2="${cop.x}" y1="${-cop.y - 16}" y2="${-cop.y + 16}"/></g>` : '';
  return `<svg viewBox="${-BOARD_W / 2 - 12} ${-BOARD_D / 2 - 42} ${BOARD_W + 24} ${BOARD_D + 76}" class="fig" role="img" aria-label="Piedi sulla pedana: sinistro ${it(loads.left)}%, destro ${it(loads.right)}%">
    ${boardRect()}${sensors}<line x1="0" x2="0" y1="${-BOARD_D / 2}" y2="${BOARD_D / 2}" class="fig-mid"/><line x1="${-BOARD_W / 2}" x2="${BOARD_W / 2}" y1="0" y2="0" class="fig-mid"/>${feet}${mark}
    <text x="0" y="${BOARD_D / 2 + 22}" text-anchor="middle" class="fig-note">Lato dei talloni</text></svg>`;
}

// Pedana dal vivo
export function liveFigure(placement) {
  const yMid = placement ? (placement.yMid ?? placement.yHeel + 0.35 * placement.footLen) : 0;
  const feet = placement ? ['L', 'R'].map((side) => { const g = footGeom(side === 'L' ? placement.xL : placement.xR, yMid, placement.footLen, side); return `<g class="live-foot"><path d="${g.d}"/>${g.toes}</g>`; }).join('') : '';
  const sensor = (k, a, b) => `<g class="live-sensor" id="s_${k}"><circle cx="${(a * SENSOR_X) / 2}" cy="${(-b * SENSOR_Y) / 2}" r="10"/><text x="${(a * SENSOR_X) / 2 + (a > 0 ? -18 : 18)}" y="${(-b * SENSOR_Y) / 2 + 6}" text-anchor="${a > 0 ? 'end' : 'start'}">–</text></g>`;
  return `<svg viewBox="${-BOARD_W / 2 - 8} ${-BOARD_D / 2 - 30} ${BOARD_W + 16} ${BOARD_D + 60}" class="fig live" role="img" aria-label="Pedana dal vivo">
    ${boardRect()}<line x1="0" x2="0" y1="${-BOARD_D / 2}" y2="${BOARD_D / 2}" class="fig-mid"/><line x1="${-BOARD_W / 2}" x2="${BOARD_W / 2}" y1="0" y2="0" class="fig-mid"/>
    ${feet}${sensor('tl', -1, 1)}${sensor('tr', 1, 1)}${sensor('bl', -1, -1)}${sensor('br', 1, -1)}
    <polyline id="trail" class="live-trail" points=""/><g id="dot" class="live-dot" style="display:none"><circle r="11"/><circle r="4" class="c"/></g>
    <text x="0" y="${-BOARD_D / 2 - 11}" text-anchor="middle" class="fig-note">Punte</text><text x="0" y="${BOARD_D / 2 + 22}" text-anchor="middle" class="fig-note">Talloni</text>
    <text x="${-BOARD_W / 2 + 6}" y="${-BOARD_D / 2 - 11}" class="fig-note">Sinistra</text><text x="${BOARD_W / 2 - 6}" y="${-BOARD_D / 2 - 11}" text-anchor="end" class="fig-note">Destra</text></svg>`;
}

// Traccia del centro di pressione con ellisse al 95%, una serie per prova.
export function swayFigure(tests) {
  const list = tests.filter((t) => t.m?.series);
  if (!list.length) return '';
  let ext = 15;
  for (const t of list) for (let i = 0; i < t.m.series.x.length; i++) ext = Math.max(ext, Math.abs(t.m.series.x[i] - t.m.meanX), Math.abs(t.m.series.y[i] - t.m.meanY));
  ext = Math.ceil(ext / 10) * 10 + 5;
  const grid = []; for (let v = -Math.floor(ext / 10) * 10; v <= ext; v += 10) { grid.push(`<line x1="${v}" x2="${v}" y1="${-ext}" y2="${ext}" class="${v === 0 ? 'sw-axis' : 'sw-grid'}"/><line y1="${v}" y2="${v}" x1="${-ext}" x2="${ext}" class="${v === 0 ? 'sw-axis' : 'sw-grid'}"/>`); }
  const traces = list.map((t) => {
    const pts = t.m.series.x.map((x, i) => `${(x - t.m.meanX).toFixed(1)},${(-(t.m.series.y[i] - t.m.meanY)).toFixed(1)}`).join(' ');
    const e = t.m.ellipse, deg = (-e.angle * 180) / Math.PI;
    return `<polyline points="${pts}" fill="none" stroke="${t.color}" stroke-width="${ext / 220}" stroke-linejoin="round" opacity=".78"/>
      <ellipse rx="${e.a.toFixed(1)}" ry="${e.b.toFixed(1)}" transform="rotate(${deg.toFixed(1)})" fill="none" stroke="${t.color}" stroke-width="${ext / 110}"${t.dash?.length ? ` stroke-dasharray="${t.dash.map((v) => (v * ext / 110).toFixed(2)).join(' ')}"` : ''}/>`;
  }).join('');
  const fs = ext / 11;
  return `<figure class="sway"><svg viewBox="${-ext} ${-ext - fs * 1.4} ${2 * ext} ${2 * ext + fs * 2.8}" class="fig" role="img" aria-label="Traccia del centro di pressione">
    ${grid.join('')}${traces}
    <text x="0" y="${-ext - fs * 0.35}" text-anchor="middle" font-size="${fs}" class="sw-text">Avanti</text><text x="0" y="${ext + fs * 1.05}" text-anchor="middle" font-size="${fs}" class="sw-text">Indietro</text>
    <text x="${-ext + fs * 0.2}" y="${-fs * 0.3}" font-size="${fs}" class="sw-text">Sinistra</text><text x="${ext - fs * 0.2}" y="${-fs * 0.3}" text-anchor="end" font-size="${fs}" class="sw-text">Destra</text></svg>
    <figcaption><span class="legend">${list.map((t) => `<span><svg class="dash-sample" width="34" height="8" aria-hidden="true"><line x1="0" x2="34" y1="4" y2="4" stroke="${t.color}" stroke-width="2.5"${t.dash?.length ? ` stroke-dasharray="${t.dash.map((v) => v * 2.5).join(' ')}"` : ''}/></svg>${t.label}</span>`).join('')}</span><span class="u">Griglia da 10 mm. Ogni traccia è centrata sulla propria media; l’ellisse contiene il 95% dei punti.</span></figcaption></figure>`;
}

export function timeFigure(t) {
  const W = 620, H = 150, L = 86, R = 10, s = t.m.series, n = s.x.length, dur = (n - 1) / s.fs;
  const xs = s.x.map((v) => v - t.m.meanX), ys = s.y.map((v) => v - t.m.meanY);
  let e = 5; for (let i = 0; i < n; i++) e = Math.max(e, Math.abs(xs[i]), Math.abs(ys[i])); e = Math.ceil(e / 5) * 5;
  const rowH = (H - 22) / 2;
  const row = (arr, top, label) => {
    const Y = (v) => top + rowH / 2 - (v / e) * (rowH / 2 - 3), X = (i) => L + (i / (n - 1)) * (W - L - R);
    return `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" class="sw-axis"/><text x="${L - 7}" y="${Y(0) + 4}" text-anchor="end" class="tick">${label}</text>
      <polyline fill="none" stroke="${t.color}" stroke-width="1.4" stroke-linejoin="round" points="${arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
  };
  const payload = JSON.stringify({ fs: s.fs, n, L, R, W, x: xs.map((v) => +v.toFixed(1)), y: ys.map((v) => +v.toFixed(1)) }).replace(/"/g, '&quot;');
  return `<figure class="timefig" data-time="${payload}"><figcaption>${t.label} <span class="u">scostamento dalla media, ±${e} mm</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" class="fig" role="img" aria-label="${t.label}: oscillazione nel tempo">${row(xs, 0, 'Laterale')}${row(ys, rowH, 'Avanti-dietro')}
    <line class="cross" y1="0" y2="${H - 22}" x1="0" x2="0" style="display:none"/>
    <text x="${L}" y="${H - 6}" class="tick">0 s</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="tick">${it(dur)} s</text></svg><div class="tip" hidden></div></figure>`;
}
export function bindTimeFigures(root) {
  root.querySelectorAll('[data-time]').forEach((f) => {
    const c = JSON.parse(f.dataset.time), svg = f.querySelector('svg'), cross = f.querySelector('.cross'), tip = f.querySelector('.tip');
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * c.W;
      const i = Math.max(0, Math.min(c.n - 1, Math.round(((vx - c.L) / (c.W - c.L - c.R)) * (c.n - 1))));
      const px = c.L + (i / (c.n - 1)) * (c.W - c.L - c.R);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.style.display = '';
      tip.innerHTML = `<b>${it(i / c.fs, 1)} s</b><br>Laterale: ${it(c.x[i], 1)} mm<br>Avanti-dietro: ${it(c.y[i], 1)} mm`;
      tip.hidden = false; tip.style.left = `${Math.min((px / c.W) * r.width + 10, r.width - 170)}px`;
    });
    svg.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.hidden = true; });
  });
}

