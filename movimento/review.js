// Revisione di una serie: fotogramma per fotogramma, rallentatore, goniometro manuale, esportazione.
import { protocolById } from './measure.js';
import { evaluate } from './analysis.js';
import { drawPose } from './overlay.js';
import { frameContext } from './store.js';

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
      ${this.compact ? '' : '<dl class="rv-values"></dl>'}`;
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
    drawPose(c, frame, { W, H, aspect: this.aspect, mirror, view: this.set.view });
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
