// Revisione di una serie: fotogramma per fotogramma, rallentatore, goniometro manuale, esportazione.
import { protocolById } from './movimento-measure.js';
import { evaluate } from './movimento-analysis.js';
import { drawPose } from './movimento-overlay.js';
import { frameContext } from './movimento-store.js';
import { setFindings, numbered } from './movimento-errori.js';

// Punti e assi che si possono seguire nella revisione.
const mid2 = (i, j) => ({ mid: [i, j] });
export const TRACKS = [
  { id: 'hipC', label: 'Centro del bacino', pt: mid2(23, 24), keys: ['shift', 'depth', 'drop', 'pelvis'] },
  { id: 'shC', label: 'Centro delle spalle', pt: mid2(11, 12), keys: ['trunk', 'trunkLat', 'comp'] },
  { id: 'head', label: 'Testa', pt: 0, keys: ['trunk', 'trunkLat'] },
  { id: 'knL', label: 'Ginocchio sinistro', pt: 25, side: 'L', keys: ['valgus', 'narrow', 'depth', 'ankle'] },
  { id: 'knR', label: 'Ginocchio destro', pt: 26, side: 'R', keys: ['valgus', 'narrow', 'depth', 'ankle'] },
  { id: 'hpL', label: 'Anca sinistra', pt: 23, side: 'L', keys: ['pelvis', 'drop', 'shift', 'depth'] },
  { id: 'hpR', label: 'Anca destra', pt: 24, side: 'R', keys: ['pelvis', 'drop', 'shift', 'depth'] },
  { id: 'anL', label: 'Caviglia sinistra', pt: 27, side: 'L', keys: ['ankle'] },
  { id: 'anR', label: 'Caviglia destra', pt: 28, side: 'R', keys: ['ankle'] },
  { id: 'shL', label: 'Spalla sinistra', pt: 11, side: 'L', keys: ['shoulders', 'comp'] },
  { id: 'shR', label: 'Spalla destra', pt: 12, side: 'R', keys: ['shoulders', 'comp'] },
  { id: 'elL', label: 'Gomito sinistro', pt: 13, side: 'L', keys: ['swing', 'rom'] },
  { id: 'elR', label: 'Gomito destro', pt: 14, side: 'R', keys: ['swing', 'rom'] },
  { id: 'wrL', label: 'Polso sinistro', pt: 15, side: 'L', keys: ['arms', 'wrists', 'rom'] },
  { id: 'wrR', label: 'Polso destro', pt: 16, side: 'R', keys: ['arms', 'wrists', 'rom'] },
  { id: 'aTrunk', label: 'Asse del tronco', axis: [mid2(23, 24), mid2(11, 12)], ref: 'v', keys: ['trunk', 'trunkLat', 'comp'] },
  { id: 'aPelvis', label: 'Linea del bacino', axis: [23, 24], ref: 'h', keys: ['pelvis', 'drop'] },
  { id: 'aShoulders', label: 'Linea delle spalle', axis: [11, 12], ref: 'h', keys: ['shoulders'] },
  { id: 'aThL', label: 'Coscia sinistra', axis: [23, 25], ref: 'v', side: 'L', keys: ['valgus', 'depth'] },
  { id: 'aThR', label: 'Coscia destra', axis: [24, 26], ref: 'v', side: 'R', keys: ['valgus', 'depth'] },
  { id: 'aShL', label: 'Tibia sinistra', axis: [27, 25], ref: 'v', side: 'L', keys: ['valgus', 'ankle'] },
  { id: 'aShR', label: 'Tibia destra', axis: [28, 26], ref: 'v', side: 'R', keys: ['valgus', 'ankle'] },
  { id: 'aArL', label: 'Braccio sinistro', axis: [11, 13], ref: 'v', side: 'L', keys: ['rom', 'arms', 'swing'] },
  { id: 'aArR', label: 'Braccio destro', axis: [12, 14], ref: 'v', side: 'R', keys: ['rom', 'arms', 'swing'] },
  { id: 'aFaL', label: 'Avambraccio sinistro', axis: [13, 15], ref: 'v', side: 'L', keys: ['rom', 'wrists'] },
  { id: 'aFaR', label: 'Avambraccio destro', axis: [14, 16], ref: 'v', side: 'R', keys: ['rom', 'wrists'] },
];
const trackById = (id) => TRACKS.find((t) => t.id === id) ?? null;

const it = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));

export class Review {
  constructor(root, { set, media, compact = false, onSave, onMessage }) {
    Object.assign(this, { root, set, media, compact, onSave, onMessage });
    this.protocol = protocolById(set.protocolId, set.customSpec);
    this.spec = this.protocol.views[set.view];
    this.pack = media?.pack ?? null;
    this.i = 0; this.playing = false; this.manual = []; this.manualMode = false;
    this.aspect = set.aspect ?? 16 / 9;
    this.build();
    if (this.pack?.n) this.load();
    else this.root.querySelector('.rv-empty').hidden = false;
  }
  build() {
    const bar = (this.set.summary.reps ?? []).map((r, k) => `<option value="${k}">${r.side ? `${r.side === 'L' ? 'Sin' : 'Des'} ` : ''}Rip. ${r.i}: ${it(r.peakValue)}</option>`).join('');
    this.root.innerHTML = `
      <div class="rv-stage"><video muted playsinline preload="auto"></video><canvas></canvas><p class="rv-empty" hidden>I punti di questa serie non sono in archivio.</p></div>
      <div class="rv-bar">
        <button class="rv-play" aria-label="Riproduci">Riproduci</button>
        <button class="rv-prev" aria-label="Fotogramma precedente">◀</button>
        <button class="rv-next" aria-label="Fotogramma successivo">▶</button>
        <input class="rv-seek" type="range" min="0" max="${Math.max(0, (this.pack?.n ?? 1) - 1)}" value="0" aria-label="Posizione nel video">
        <span class="rv-time">0,0 s</span>
      </div>
      <div class="rv-bar rv-bar2">
        <label>Velocità <select class="rv-rate"><option value="1">1×</option><option value="0.5">0,5×</option><option value="0.25">0,25×</option></select></label>
        ${bar ? `<label>Vai a <select class="rv-rep"><option value="">Ripetizione</option>${bar}</select></label>` : ''}
        <button class="rv-manual" aria-pressed="false">Angolo a mano</button>
        ${this.compact ? '' : '<button class="rv-save">Salva fotogramma</button>'}
      </div>
      ${this.compact ? '' : `<div class="rv-bar rv-bar2 rv-track-bar">
        <label>Traccia <select class="rv-track"><option value="">Nessun punto</option>
          <optgroup label="Punti">${TRACKS.filter((t) => !t.axis).map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</optgroup>
          <optgroup label="Assi">${TRACKS.filter((t) => t.axis).map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</optgroup></select></label>
        <label>Intervallo <select class="rv-scope"><option value="">Tutta la serie</option>${(this.set.summary.reps ?? []).map((r, k) => `<option value="${k}">Ripetizione ${r.side ? `${r.side === 'L' ? 'sin' : 'des'} ` : ''}${r.i}</option>`).join('')}</select></label>
      </div>
      <div class="rv-explain" hidden></div>
      <dl class="rv-values"></dl>`}`;
    const q = (s) => this.root.querySelector(s);
    this.video = q('video'); this.canvas = q('canvas');
    q('.rv-play').onclick = () => (this.playing ? this.pause() : this.play());
    q('.rv-prev').onclick = () => { this.pause(); this.show(this.i - 1); };
    q('.rv-next').onclick = () => { this.pause(); this.show(this.i + 1); };
    q('.rv-seek').oninput = (e) => { this.pause(); this.show(Number(e.target.value)); };
    q('.rv-rate').onchange = (e) => { this.rate = Number(e.target.value); this.video.playbackRate = this.rate; };
    if (q('.rv-rep')) q('.rv-rep').onchange = (e) => { if (e.target.value !== '') this.goRep(Number(e.target.value)); };
    q('.rv-manual').onclick = (e) => {
      this.manualMode = !this.manualMode; e.target.setAttribute('aria-pressed', String(this.manualMode)); this.manual = [];
      this.onMessage?.(this.manualMode ? 'Tocca tre punti sull’immagine: il secondo è il vertice dell’angolo.' : '');
      this.pause(); this.drawCurrent();
    };
    if (q('.rv-save')) q('.rv-save').onclick = () => this.saveFrame();
    if (q('.rv-track')) {
      const upd = () => { this.track = trackById(q('.rv-track').value); this.scope = q('.rv-scope').value === '' ? null : Number(q('.rv-scope').value); this.explainTrack(); this.drawCurrent(); };
      q('.rv-track').onchange = upd;
      q('.rv-scope').onchange = () => { upd(); if (this.scope != null) this.goRep(this.scope); };
    }
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.manualMode) return;
      const r = this.canvas.getBoundingClientRect();
      const scale = Math.min(r.width / this.canvas.width, r.height / this.canvas.height);
      const ox = (r.width - this.canvas.width * scale) / 2, oy = (r.height - this.canvas.height * scale) / 2;
      const x = (e.clientX - r.left - ox) / scale, y = (e.clientY - r.top - oy) / scale;
      if (this.manual.length >= 3) this.manual = [];
      this.manual.push({ x, y }); this.drawCurrent();
    });
  }
  async load() {
    const m = this.media;
    if (m.blob) {
      this.url = URL.createObjectURL(m.blob);
      const v = this.video; v.src = this.url;
      await new Promise((r) => { v.onloadedmetadata = r; v.onerror = r; setTimeout(r, 5000); });
      // I video registrati dal browser non dichiarano la durata finché non si raggiunge la fine.
      if (v.duration === Infinity) { await new Promise((r) => { v.ontimeupdate = () => { v.ontimeupdate = null; r(); }; v.currentTime = 1e7; setTimeout(r, 3000); }); v.currentTime = 0; }
      this.hasVideo = !v.error && v.videoWidth > 0;
    }
    const W = this.hasVideo ? this.video.videoWidth : (this.aspect >= 1 ? 1280 : 720), H = this.hasVideo ? this.video.videoHeight : (this.aspect >= 1 ? 720 : 1280);
    this.canvas.width = W; this.canvas.height = H;
    await this.show(0);
  }
  frameAt(i) {
    const ctx = frameContext(this.pack, i, this.set.summary.baseTilt ?? null);
    const res = evaluate(this.spec, ctx);
    return { ...ctx, values: res.values, draws: res.draws };
  }
  videoTime(i) { return Math.max(0, (this.pack.times[i] - (this.media.videoOffset ?? 0)) / 1000); }
  async show(i) {
    if (!this.pack?.n) return;
    this.i = Math.max(0, Math.min(this.pack.n - 1, i));
    this.root.querySelector('.rv-seek').value = String(this.i);
    if (this.hasVideo) {
      const v = this.video;
      await new Promise((r) => { const done = () => { v.removeEventListener('seeked', done); r(); }; v.addEventListener('seeked', done); v.currentTime = this.videoTime(this.i); setTimeout(done, 700); });
    }
    this.drawCurrent();
  }
  drawCurrent() {
    if (!this.pack?.n) return;
    const frame = this.frameAt(this.i), W = this.canvas.width, H = this.canvas.height, c = this.canvas.getContext('2d');
    const mirror = !!this.media.mirror;
    if (this.hasVideo) {
      if (mirror) { c.save(); c.translate(W, 0); c.scale(-1, 1); c.drawImage(this.video, 0, 0, W, H); c.restore(); } else c.drawImage(this.video, 0, 0, W, H);
    } else { c.fillStyle = '#0d1b2b'; c.fillRect(0, 0, W, H); }
    drawPose(c, frame, { W, H, aspect: this.aspect, mirror, view: this.set.view, hideArcs: !!this.track });
    if (this.track) this.drawTrack(c, W, H, mirror);
    this.drawManual(c, Math.min(W, H) / 720);
    const t0 = this.pack.times[0];
    this.root.querySelector('.rv-time').textContent = `${it((this.pack.times[this.i] - t0) / 1000, 1)} s`;
    const box = this.root.querySelector('.rv-values');
    if (box) box.innerHTML = this.spec.metrics.map((m) => `<div><dt>${m.label}${m.id.endsWith('_L') ? ' sin' : m.id.endsWith('_R') ? ' des' : ''}</dt><dd>${it(frame.values[m.id], m.d)} <small>${m.unit}</small></dd></div>`).join('');
    this.lastFrame = frame;
  }
  drawManual(c, s) {
    const pts = this.manual;
    if (!pts.length) return;
    c.strokeStyle = '#8df0a8'; c.fillStyle = '#8df0a8'; c.lineWidth = 3 * s;
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    for (const p of pts) { c.beginPath(); c.arc(p.x, p.y, 6 * s, 0, 7); c.fill(); }
    if (pts.length === 3) {
      const [a, b, d] = pts;
      const u = { x: a.x - b.x, y: a.y - b.y }, w = { x: d.x - b.x, y: d.y - b.y };
      const ang = Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / ((Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)) || 1)))) * 180 / Math.PI;
      this.manualAngle = ang;
      const text = `${it(ang, 1)}°`, size = Math.round(30 * s);
      c.font = `700 ${size}px Bahnschrift, Roboto, sans-serif`;
      const tw = c.measureText(text).width;
      const bx = Math.min(c.canvas.width - tw - 18 * s, b.x + 14 * s), by = Math.max(4, b.y - size - 16 * s);
      c.fillStyle = '#8df0a8'; c.beginPath(); c.roundRect(bx, by, tw + 14 * s, size + 12 * s, 4 * s); c.fill();
      c.fillStyle = '#14241f'; c.fillText(text, bx + 7 * s, by + size + 1 * s);
    }
  }
  /* Tracciamento di un punto o di un asse */
  pointAt(i, spec) {
    const g = (k) => { const o = i * 99 + k * 3; return { x: this.pack.pts[o], y: this.pack.pts[o + 1], v: this.pack.pts[o + 2] }; };
    if (typeof spec === 'number') return g(spec);
    const a = g(spec.mid[0]), b = g(spec.mid[1]);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) };
  }
  trackRange() {
    const n = this.pack.n, r = this.scope != null ? this.set.summary.reps?.[this.scope] : null;
    if (!r) return [0, n - 1];
    const t0 = this.pack.times[0];
    let a = 0, b = n - 1;
    while (a < n - 1 && this.pack.times[a] - t0 < r.t0) a++;
    while (b > a && this.pack.times[b] - t0 > r.t1) b--;
    return [a, b];
  }
  // Angolo dell'asse rispetto alla verticale o all'orizzontale dell'immagine, in gradi.
  axisAngle(i, t) {
    const A = this.pointAt(i, t.axis[0]), B = this.pointAt(i, t.axis[1]);
    if (A.v < 0.3 || B.v < 0.3) return null;
    const dx = B.x - A.x, dy = B.y - A.y;
    return t.ref === 'h' ? Math.atan2(dy, Math.abs(dx) || 1e-6) * 180 / Math.PI : Math.atan2(dx, -dy) * 180 / Math.PI;
  }
  drawTrack(c, W, H, mirror) {
    const t = this.track, [a, b] = this.trackRange(), s = Math.min(W, H) / 720;
    const map = (p) => ({ x: ((mirror ? this.aspect - p.x : p.x) / this.aspect) * W, y: p.y * H });
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (!t.axis) {
      const pts = []; for (let i = a; i <= b; i++) { const p = this.pointAt(i, t.pt); if (p.v >= 0.3) pts.push(map(p)); }
      if (pts.length > 1) {
        const start = pts[0];
        c.setLineDash([8 * s, 6 * s]); c.lineWidth = 2 * s; c.strokeStyle = 'rgba(255,255,255,.85)';
        c.beginPath(); c.moveTo(start.x, 0); c.lineTo(start.x, H); c.stroke(); c.setLineDash([]);
        for (const [w, col] of [[8 * s, 'rgba(0,0,0,.55)'], [4 * s, '#ffe14d']]) {
          c.lineWidth = w; c.strokeStyle = col; c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
        }
        c.lineWidth = 3 * s; c.strokeStyle = '#ffe14d'; c.fillStyle = 'rgba(0,0,0,.6)';
        c.beginPath(); c.arc(start.x, start.y, 9 * s, 0, 7); c.fill(); c.stroke();
      }
      const cur = this.pointAt(this.i, t.pt);
      if (cur.v >= 0.3) { const p = map(cur); c.beginPath(); c.arc(p.x, p.y, 11 * s, 0, 7); c.fillStyle = '#ffe14d'; c.fill(); c.lineWidth = 3 * s; c.strokeStyle = '#000'; c.stroke(); }
    } else {
      const step = Math.max(1, Math.round((b - a) / 14));
      for (let i = a; i <= b; i += step) {
        const A = this.pointAt(i, t.axis[0]), B = this.pointAt(i, t.axis[1]); if (A.v < 0.3 || B.v < 0.3) continue;
        const p = map(A), q = map(B); c.lineWidth = 3 * s; c.strokeStyle = 'rgba(255,225,77,.38)'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
      }
      const A = this.pointAt(this.i, t.axis[0]), B = this.pointAt(this.i, t.axis[1]);
      if (A.v >= 0.3 && B.v >= 0.3) {
        const p = map(A), q = map(B), L = Math.hypot(q.x - p.x, q.y - p.y) * 1.15;
        c.setLineDash([8 * s, 6 * s]); c.lineWidth = 2 * s; c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath();
        if (t.ref === 'h') { c.moveTo(p.x - L * 0.2, p.y); c.lineTo(p.x + L, p.y); } else { c.moveTo(p.x, p.y + L * 0.15); c.lineTo(p.x, p.y - L); }
        c.stroke(); c.setLineDash([]);
        for (const [w, col] of [[10 * s, 'rgba(0,0,0,.55)'], [5 * s, '#ffe14d']]) { c.lineWidth = w; c.strokeStyle = col; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke(); }
        const ang = this.axisAngle(this.i, t);
        if (ang != null) {
          const text = `${it(Math.abs(ang), 0)}°`, size = Math.round(28 * s); c.font = `700 ${size}px Bahnschrift, Roboto, sans-serif`;
          const tw = c.measureText(text).width, bx = Math.min(W - tw - 20 * s, (p.x + q.x) / 2 + 16 * s), by = (p.y + q.y) / 2 - size / 2;
          c.fillStyle = '#ffe14d'; c.beginPath(); c.roundRect(bx, by, tw + 14 * s, size + 10 * s, 4 * s); c.fill(); c.fillStyle = '#14241f'; c.fillText(text, bx + 7 * s, by + size);
        }
      }
    }
    c.restore();
  }
  // Numeri del tracciamento e spiegazione: cosa fa il punto e quali errori riguarda.
  explainTrack() {
    const box = this.root.querySelector('.rv-explain'); if (!box) return;
    const t = this.track;
    if (!t || !this.pack?.n) { box.hidden = true; box.innerHTML = ''; return; }
    const [a, b] = this.trackRange(), view = this.set.view, sm = this.set.summary;
    const legs = []; for (let i = a; i <= b; i++) if (this.pack.leg[i] > 0) legs.push(this.pack.leg[i]);
    const leg = legs.length ? legs.sort((x, y) => x - y)[Math.floor(legs.length / 2)] : null;
    const pct = (d) => (leg ? `${it(Math.abs(d) / leg * 100)}% della lunghezza della gamba` : `${it(Math.abs(d) * 100, 1)} centesimi dell’altezza dell’immagine`);
    // Verso nell'immagine → parola per il cliente
    const sR = view === 'rear' ? 1 : -1, mir = this.media?.mirror ? -1 : 1;
    const horiz = (dx) => {
      const d = dx * mir;
      if (view === 'side') return d * (sm.dir ?? 1) > 0 ? 'in avanti' : 'indietro';
      return d * sR > 0 ? 'verso destra' : 'verso sinistra';
    };
    const lines = [];
    // Istante chiave: punto più basso per le gambe, picco della ripetizione per le braccia.
    let lowest = a, keyWord = 'Nel punto più basso del movimento', keyShort = 'nel punto più basso';
    if (this.protocol.group === 'arm' && sm.reps?.length) {
      const r = sm.reps[this.scope ?? Math.floor(sm.reps.length / 2)], target = this.pack.times[0] + r.tPeak;
      let bd = Infinity; for (let i = a; i <= b; i++) { const d = Math.abs(this.pack.times[i] - target); if (d < bd) { bd = d; lowest = i; } }
      keyWord = 'Al punto massimo del movimento'; keyShort = 'al punto massimo';
    } else for (let i = a; i <= b; i++) if (this.pointAt(i, mid2(23, 24)).y > this.pointAt(lowest, mid2(23, 24)).y) lowest = i;
    if (!t.axis) {
      const pts = []; for (let i = a; i <= b; i++) { const p = this.pointAt(i, t.pt); if (p.v >= 0.3) pts.push({ ...p, i }); }
      if (pts.length < 3) { box.hidden = false; box.innerHTML = '<p class="fine">Il punto scelto non si vede abbastanza in questa serie.</p>'; return; }
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), start = pts[0];
      const atLow = pts.reduce((x, y) => (Math.abs(y.i - lowest) < Math.abs(x.i - lowest) ? y : x));
      lines.push(`Si sposta in tutto di ${pct(Math.max(...xs) - Math.min(...xs))} in orizzontale e di ${pct(Math.max(...ys) - Math.min(...ys))} in verticale.`);
      const dx = atLow.x - start.x;
      if (leg && Math.abs(dx) / leg > 0.02) lines.push(`${keyWord} è spostato ${horiz(dx)} di ${pct(dx)} rispetto alla partenza.`);
      else lines.push(`${keyWord} resta quasi sulla verticale della partenza.`);
      if ((t.id === 'knL' || t.id === 'knR') && view !== 'side') {
        const s = t.side, hip = this.pointAt(atLow.i, s === 'L' ? 23 : 24), ank = this.pointAt(atLow.i, s === 'L' ? 27 : 28), oh = this.pointAt(atLow.i, s === 'L' ? 24 : 23);
        const u = (atLow.y - hip.y) / ((ank.y - hip.y) || 1), lineX = hip.x + (ank.x - hip.x) * u, dev = (atLow.x - lineX) * Math.sign(oh.x - hip.x);
        lines.push(`Rispetto alla linea anca-caviglia il ginocchio va ${dev > 0 ? 'verso l’interno' : 'verso l’esterno'} di ${pct(dev)}.`);
      }
    } else {
      const angs = []; for (let i = a; i <= b; i++) { const v = this.axisAngle(i, t); if (v != null) angs.push(v); }
      if (angs.length < 3) { box.hidden = false; box.innerHTML = '<p class="fine">L’asse scelto non si vede abbastanza in questa serie.</p>'; return; }
      const refW = t.ref === 'h' ? 'dall’orizzontale' : 'dalla verticale', low = this.axisAngle(lowest, t);
      lines.push(`Inclinazione ${refW}: da ${it(Math.min(...angs))}° a ${it(Math.max(...angs))}°${low != null ? `, ${it(low)}° ${keyShort}` : ''}.`);
      lines.push('Le linee chiare mostrano l’asse lungo il movimento, quella gialla il fotogramma attuale, il tratteggio il riferimento.');
    }
    const fs = numbered(setFindings(this.set)).filter((f) => f.state === 'flag' && t.keys.some((k) => f.key === k || f.key.startsWith(`${k}_`)) && (!t.side || !f.side || !/^(valgus|rom)/.test(f.key) || f.side === t.side));
    box.hidden = false;
    box.innerHTML = `<h3>${t.label}${this.scope != null ? `, ripetizione ${this.scope + 1}` : ''}</h3><p>${lines.join(' ')}</p>
      ${fs.length ? `<p><b>Cosa non va:</b></p><ul class="mf-list">${fs.map((f) => `<li><span class="mf-num">${f.n}</span><div><b>${f.title}</b> <span class="mf-val">${f.value}</span><br>${f.plain}<br><span class="mf-cue">Cosa provare: ${f.cue}</span></div></li>`).join('')}</ul>`
        : '<p class="fine">Per questo punto nessuna misura supera le soglie. Guarda comunque il percorso: se oscilla molto da una ripetizione all’altra il controllo è poco costante.</p>'}`;
  }
  goRep(k, phase = 'peak') {
    const r = this.set.summary.reps[k]; if (!r) return;
    this.pause();
    const t0 = this.pack.times[0], target = t0 + (phase === 'peak' ? r.tPeak : r.t0);
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.pack.n; i++) { const d = Math.abs(this.pack.times[i] - target); if (d < bd) { bd = d; best = i; } }
    return this.show(best);
  }
  play() {
    if (this.i >= this.pack.n - 1) this.i = 0;
    this.playing = true; this.root.querySelector('.rv-play').textContent = 'Pausa';
    const v = this.video;
    if (this.hasVideo) {
      v.playbackRate = this.rate ?? 1; v.currentTime = this.videoTime(this.i); v.play();
      const tick = () => {
        if (!this.playing) return;
        const target = v.currentTime * 1000 + (this.media.videoOffset ?? 0);
        let i = this.i; while (i < this.pack.n - 1 && this.pack.times[i + 1] <= target) i++;
        this.i = i; this.root.querySelector('.rv-seek').value = String(i); this.drawCurrent();
        if (v.ended || i >= this.pack.n - 1) { this.pause(); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    } else {
      const start = performance.now(), base = this.pack.times[this.i], rate = this.rate ?? 1;
      const tick = () => {
        if (!this.playing) return;
        const target = base + (performance.now() - start) * rate;
        let i = this.i; while (i < this.pack.n - 1 && this.pack.times[i + 1] <= target) i++;
        this.i = i; this.root.querySelector('.rv-seek').value = String(i); this.drawCurrent();
        if (i >= this.pack.n - 1) { this.pause(); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
  }
  pause() {
    this.playing = false; cancelAnimationFrame(this.raf);
    if (this.hasVideo) this.video.pause();
    const b = this.root.querySelector('.rv-play'); if (b) b.textContent = 'Riproduci';
  }
  saveFrame() {
    this.pause();
    const c = document.createElement('canvas'); c.width = Math.min(960, this.canvas.width); c.height = Math.round(c.width * this.canvas.height / this.canvas.width);
    c.getContext('2d').drawImage(this.canvas, 0, 0, c.width, c.height);
    const t = (this.pack.times[this.i] - this.pack.times[0]) / 1000;
    const main = this.lastFrame?.values[this.spec.primary];
    const label = `Fotogramma a ${it(t, 1)} s${main != null ? `: ${Math.round(main)}°` : ''}${this.manualAngle != null && this.manual.length === 3 ? `, a mano ${it(this.manualAngle, 1)}°` : ''}`;
    this.onSave?.({ src: c.toDataURL('image/jpeg', 0.78), label, values: this.lastFrame?.values ?? {} });
  }
  // Riproduce la serie con i gradi disegnati e ne ricava un file video.
  async exportVideo(onDone) {
    if (!this.hasVideo || !this.canvas.captureStream || !window.MediaRecorder) { this.onMessage?.('Serve il video della serie per creare il file.', true); return; }
    const mime = ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(this.canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 5000000 }), chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    await this.show(0);
    rec.start();
    this.rate = 1; this.video.playbackRate = 1;
    this.play();
    await new Promise((r) => { const check = () => (this.playing ? setTimeout(check, 200) : r()); check(); });
    rec.stop(); await stopped;
    const blob = new Blob(chunks, { type: mime });
    onDone?.(blob, mime.includes('mp4') ? 'mp4' : 'webm');
  }
  csv() {
    const ids = this.spec.metrics.map((m) => m.id);
    const head = ['tempo_s', ...this.spec.metrics.map((m) => `"${m.label}${m.id.endsWith('_L') ? ' sin' : m.id.endsWith('_R') ? ' des' : ''} (${m.unit})"`)].join(';');
    const rows = [head];
    for (let i = 0; i < (this.pack?.n ?? 0); i++) {
      const f = this.frameAt(i);
      rows.push([((f.t - this.pack.times[0]) / 1000).toFixed(3), ...ids.map((id) => (f.values[id] == null ? '' : f.values[id].toFixed(1)))].join(';').replace(/\./g, ','));
    }
    return rows.join('\r\n');
  }
  destroy() { this.pause(); if (this.url) URL.revokeObjectURL(this.url); }
}
