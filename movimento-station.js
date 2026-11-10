// Una postazione di ripresa: sorgente video, riconoscimento, disegno, serie registrata.
import { SetAnalyzer, pathPoint, median } from './movimento-analysis.js';
import { CamXf } from './movimento-camxf.js';
import { inkFigure } from './movimento-ink.js';
import { drawPose, drawAlerts } from './movimento-overlay.js';
import { LiveFeedback } from './movimento-feedback.js';
import { createPose } from './engine.js';
import { simulate } from './movimento-sim.js';
import { packFrames } from './movimento-store.js';

const ANALYSIS_SIZE = 640, KEY_W = 640, TRAIL_MS = 4000;

export class Station {
  constructor({ canvas, video, settings, onFrame, onRep, onMessage, onEnded, onRepFeedback }) {
    Object.assign(this, { canvas, video, settings, onFrame, onRep, onMessage, onEnded, onRepFeedback });
    this.kind = 'none'; this.state = 'idle';
    this.off = document.createElement('canvas');
    this.offC = this.off.getContext('2d');
    this.lastTs = 0; this.loop = 0; this.mirror = false; this.baseTilt = null; this.errors = 0; this.goal = null; this.goalHit = false;
    this.peakCand = {}; this.keys = {}; this.snaps = []; this.trail = [];
    this.xf = new CamXf();
  }

  configure(protocol, view, sideMode = 'auto') {
    Object.assign(this, { protocol, view, sideMode });
    this.baseTilt = null; // la camera si è spostata: la calibrazione va rifatta
    this.newAnalyzer(false);
  }
  get aspect() { const v = this.video; if (this.kind === 'demo') return this.demoAspect; if (!v.videoWidth || !v.videoHeight) return 16 / 9; const [w, h] = this.xf.size(v); return w / h; }
  // Rotazione e zoom: attivi solo con camera o file.
  get xfOn() { return this.kind !== 'demo' && this.xf.active; }
  srcSize() { const v = this.video; return this.xf.active ? this.xf.size(v) : [v.videoWidth || 1280, v.videoHeight || 720]; }
  setXf(o, final = true) {
    this.xf.set(o);
    this.video.style.visibility = this.xfOn ? 'hidden' : '';
    if (this.kind === 'demo' || !this.video.videoWidth) return;
    const [w, h] = this.srcSize(); this.setSize(w, h);
    if (this.analyzer) this.analyzer.aspect = this.aspect;
    if (final && this.state !== 'recording') { this.baseTilt = null; this.allocKeys(); this.newAnalyzer(false); }
    if (this.video.paused) {
      // Video fermo: ridisegna subito l'anteprima con la nuova inquadratura.
      const src = this.xfOn ? this.xf.draw(this.video) : this.video, c = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height;
      c.save(); if (this.mirror) { c.translate(W, 0); c.scale(-1, 1); } c.drawImage(src, 0, 0, W, H); c.restore();
    }
  }
  newAnalyzer(recording) {
    if (!this.protocol) return;
    this.analyzer = new SetAnalyzer({
      protocol: this.protocol, view: this.view, aspect: this.aspect, sideMode: this.sideMode, baseTilt: this.baseTilt, recording,
      onRep: (r, a) => this.handleRep(r, a),
      onPeak: (id, side, v, t, frame) => this.handlePeak(side, frame, t),
      onRepPreview: (r, a) => this.repFeedback(r, a),
    });
    this.trail = [];
    this.feedback = new LiveFeedback(this.protocol, this.view);
  }

  async ensurePose() {
    const kind = this.settings().model;
    if (this.pose && this.poseKind === kind) return true;
    this.onMessage?.('Preparo il riconoscimento: la prima volta può richiedere fino a 20 secondi e la pagina può fermarsi per un momento.', false, true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      this.pose?.close?.();
      this.pose = await createPose(kind); this.poseKind = kind;
      this.onMessage?.(this.pose.delegate === 'CPU' ? 'Il riconoscimento usa il processore: i fotogrammi analizzati saranno pochi.' : '', this.pose.delegate === 'CPU');
      return true;
    } catch (e) {
      console.error(e); this.pose = null;
      this.onMessage?.('Riconoscimento non caricato. Controlla la connessione a Internet e riapri la ripresa.', true);
      return false;
    }
  }

  stopSource() {
    this.loop++;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    const v = this.video; v.pause(); v.srcObject = null; v.onended = null;
    if (this.fileUrl) { URL.revokeObjectURL(this.fileUrl); this.fileUrl = null; this.file = null; v.removeAttribute('src'); v.load(); }
    this.kind = 'none'; this.state = 'idle';
    const c = this.canvas.getContext('2d'); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  async useCamera(deviceId, facing = 'environment') {
    this.stopSource();
    const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } };
    if (deviceId) video.deviceId = { exact: deviceId }; else video.facingMode = { ideal: facing };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      const msg = e.name === 'NotAllowedError' ? 'Accesso alla camera negato. Consentilo dall’icona accanto all’indirizzo, poi riapri la ripresa.'
        : e.name === 'NotFoundError' ? 'Nessuna camera trovata. Puoi caricare un file video o provare la simulazione.'
          : 'La camera è usata da un’altra app oppure non si avvia. Chiudi le altre app e riprova.';
      this.onMessage?.(msg, true);
      return false;
    }
    this.kind = 'camera'; this.sourceName = this.stream.getVideoTracks()[0]?.label ?? '';
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    await this.afterSource();
    return true;
  }
  async useFile(file) {
    this.stopSource();
    this.kind = 'file'; this.file = file; this.sourceName = file.name; this.fileUrl = URL.createObjectURL(file);
    const v = this.video; v.src = this.fileUrl; v.loop = false;
    await new Promise((res) => { v.onloadeddata = res; v.onerror = res; });
    if (v.error) { this.onMessage?.('Questo video non si apre nel browser. Prova un file MP4 con codifica H.264.', true); this.stopSource(); return false; }
    await this.afterSource();
    // Mostra il primo fotogramma già analizzato
    if (this.pose) { v.currentTime = 0; await new Promise((r) => { v.onseeked = r; setTimeout(r, 800); }); this.processVideo(0); }
    return true;
  }
  useDemo(aspect = 16 / 9) {
    this.stopSource();
    this.kind = 'demo'; this.demoAspect = aspect; this.sourceName = '';
    this.setSize(aspect >= 1 ? 1280 : 720, aspect >= 1 ? 720 : 1280);
    this.newAnalyzer(false); this.allocKeys();
    const start = performance.now(), id = ++this.loop;
    let last = -100;
    const tick = (now) => {
      if (id !== this.loop) return;
      const t = now - start;
      if (t - last >= 32) { last = t; this.process(this.blank(), t, simulate(this.protocol.sim ?? 'squat', this.view, t, {}, aspect)); }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  blank() {
    const c = this.offC; c.fillStyle = '#0d1b2b'; c.fillRect(0, 0, this.off.width, this.off.height);
    return this.off;
  }

  setSize(w, h) {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    const sc = ANALYSIS_SIZE / Math.max(w, h), ow = Math.round(w * sc), oh = Math.round(h * sc);
    if (this.off.width !== ow) this.off.width = ow;
    if (this.off.height !== oh) this.off.height = oh;
  }
  allocKeys() {
    const h = Math.round(KEY_W * this.canvas.height / this.canvas.width);
    const mk = () => { const c = document.createElement('canvas'); c.width = KEY_W; c.height = h; return c; };
    this.peakCand = { any: { c: mk() }, L: { c: mk() }, R: { c: mk() } };
    this.keys = {}; this.snaps = [];
  }
  async afterSource() {
    const v = this.video;
    if (!v.videoWidth) await new Promise((r) => { const check = () => (v.videoWidth ? r() : setTimeout(check, 50)); check(); setTimeout(r, 3000); });
    this.video.style.visibility = this.xfOn ? 'hidden' : '';
    this.setSize(...this.srcSize());
    this.newAnalyzer(false); this.allocKeys();
    const ok = await this.ensurePose();
    if (!ok) return;
    const id = ++this.loop;
    const cb = (now, meta) => {
      if (id !== this.loop) return;
      v.requestVideoFrameCallback(cb);
      if (this.kind === 'file' && this.state !== 'recording') return;
      this.processVideo(this.kind === 'file' ? meta.mediaTime * 1000 : (meta.captureTime ?? now));
    };
    v.requestVideoFrameCallback(cb);
    v.onresize = () => { if (v.videoWidth) { this.setSize(...this.srcSize()); if (this.analyzer) this.analyzer.aspect = this.aspect; if (this.state !== 'recording') { this.allocKeys(); this.newAnalyzer(false); } } };
  }

  processVideo(t) {
    if (!this.pose) return;
    const v = this.xfOn ? this.xf.draw(this.video) : this.video;
    this.offC.drawImage(v, 0, 0, this.off.width, this.off.height);
    let raw = null;
    try {
      this.lastTs = Math.max(this.lastTs + 1, Math.round(performance.now()));
      raw = this.pose.detect(this.off, this.lastTs);
      this.errors = 0;
    } catch (e) {
      if (++this.errors === 5) { this.onMessage?.(`Errore nel riconoscimento: ${e.message}`, true); console.error(e); }
      return;
    }
    this.process(v, t, raw);
  }

  process(source, t, raw) {
    const a = this.analyzer; if (!a) return;
    this.currentSource = source;
    const frame = a.push(raw, t);
    const c = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height;
    if (this.mirror) { c.save(); c.translate(W, 0); c.scale(-1, 1); c.drawImage(source, 0, 0, W, H); c.restore(); }
    else c.drawImage(source, 0, 0, W, H);
    if (frame) {
      const set = this.settings();
      if (set.trail && this.protocol.path) {
        const pp = pathPoint(this.protocol.path, frame.P, frame.work);
        if (pp) { this.trail.push({ ...pp, t }); while (this.trail.length && this.trail[0].t < t - TRAIL_MS) this.trail.shift(); }
      }
      this.goalHit = this.isGoalHit(frame);
      drawPose(c, frame, { W, H, aspect: a.aspect, mirror: this.mirror, view: this.view, labels: set.labels, path: set.trail ? this.trail : null, picked: this.picked, goalHit: this.goalHit });
      const fb = this.feedback?.update(frame);
      if (fb && set.alerts !== false) drawAlerts(c, frame, fb.segs, { W, H, aspect: a.aspect, mirror: this.mirror });
      if (this.state === 'recording') this.firstFrameKey(frame);
    }
    this.onFrame?.(frame, a, this);
  }
  isGoalHit(frame) {
    if (this.goal == null) return false;
    const spec = this.analyzer.spec, sign = spec.driverSign ?? 1;
    return [spec.primary, spec.second].filter(Boolean).some((id) => frame.values[id] != null && frame.values[id] * sign >= this.goal * sign);
  }

  // Immagini per il referto
  firstFrameKey(frame) {
    if (this.keys.start) return;
    const q = this.analyzer.qualityNow;
    if (q < 0.5) return;
    this.keys.start = { src: this.compose(this.sourceForKey(), frame), ink: this.ink(frame), label: this.analyzer.spec.startName ?? 'Inizio', score: 0 };
  }
  sourceForKey() { return this.off; }
  handlePeak(side, frame, t) {
    if (this.state !== 'recording' || !frame) return;
    const cand = this.peakCand[side ?? 'any'];
    if (!cand) return;
    cand.c.getContext('2d').drawImage(this.off, 0, 0, cand.c.width, cand.c.height);
    cand.frame = frame; cand.t = t;
  }
  repFeedback(rep, a) {
    const last = this.feedback?.onRep(rep, { work: a.work, near: a.near, dir: a.dir });
    if (last) this.onRepFeedback?.(last, this);
  }
  handleRep(rep, a) {
    this.repFeedback(rep, a);
    this.onRep?.(rep, a, this);
    const key = rep.side ?? 'any', cand = this.peakCand[key];
    if (!cand?.frame) return;
    const peers = a.reps.filter((r) => r.side === rep.side).map((r) => r.peakValue), med = median(peers);
    const score = Math.abs(rep.peakValue - med);
    const prior = this.keys[key];
    if (!prior || score <= prior.score) {
      const label = `${a.spec.peakName ?? 'Picco'}${rep.side ? `, ${rep.side === 'L' ? 'sinistra' : 'destra'}` : ''}, ripetizione tipica`;
      this.keys[key] = { score, src: this.compose(cand.c, cand.frame), ink: this.ink(cand.frame), label };
    }
  }
  ink(frame) {
    try { return inkFigure(frame.P, { aspect: this.analyzer.aspect, mirror: this.mirror, side: this.view === 'side', near: frame.near }); } catch { return null; }
  }
  compose(src, frame) {
    const out = document.createElement('canvas'); out.width = KEY_W; out.height = Math.round(KEY_W * this.canvas.height / this.canvas.width);
    const c = out.getContext('2d');
    if (this.mirror) { c.save(); c.translate(out.width, 0); c.scale(-1, 1); c.drawImage(src, 0, 0, out.width, out.height); c.restore(); } else c.drawImage(src, 0, 0, out.width, out.height);
    drawPose(c, frame, { W: out.width, H: out.height, aspect: this.analyzer.aspect, mirror: this.mirror, view: this.view });
    return out.toDataURL('image/jpeg', 0.72);
  }
  snapshot() {
    const f = this.analyzer?.last;
    if (!f) return null;
    const t = this.analyzer.fpsT.at(-1) - (this.analyzer.frames[0]?.t ?? this.analyzer.fpsT.at(-1));
    const main = this.analyzer.spec.primary, v = f.values[main];
    const snap = { src: this.compose(this.off, f), ink: this.ink(f), label: `Misura fissata${v != null ? `: ${Math.round(v)}°` : ''}`, values: { ...f.values }, atS: Math.max(0, t / 1000) };
    this.snaps.push(snap);
    return snap;
  }

  // Serie
  startSet() {
    this.newAnalyzer(true);
    this.keys = {}; this.snaps = []; for (const k of Object.values(this.peakCand)) { k.frame = null; }
    this.state = 'recording'; this.startPerf = performance.now();
    this.recBlob = null; this.recT0 = null; this.chunks = [];
    if ((this.kind === 'camera' || (this.kind === 'file' && this.xfOn)) && this.settings().record && window.MediaRecorder) {
      const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      try {
        // Con rotazione o zoom si registra l'immagine già girata, così il riesame coincide con l'analisi.
        const stream = this.xfOn && this.xf.canvas.captureStream ? this.xf.canvas.captureStream(30) : this.stream;
        this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
        this.rec.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
        this.rec.onstart = () => { this.recT0 = performance.now(); };
        this.rec.start(1000);
      } catch (e) { console.warn(e); this.rec = null; }
    }
    if (this.kind === 'file') {
      const v = this.video;
      v.currentTime = 0; v.playbackRate = this.xfOn ? 1 : parseFloat(this.settings().rate) || 1;
      v.onended = () => this.onEnded?.(this);
      v.play().catch(() => this.onMessage?.('Il video non parte: riprova.', true));
    }
  }
  async stopSet() {
    if (this.state !== 'recording') return null;
    this.state = 'idle';
    if (this.kind === 'file') this.video.pause();
    const a = this.analyzer, recStopped = this.rec && this.rec.state !== 'inactive'
      ? new Promise((r) => { this.rec.onstop = r; this.rec.stop(); }) : Promise.resolve();
    await recStopped;
    const summary = a.summary();
    let blob = null, videoOffset = 0, mime = null;
    if (this.chunks.length) { blob = new Blob(this.chunks, { type: this.rec.mimeType }); videoOffset = this.kind === 'camera' ? this.recT0 ?? this.startPerf : 0; mime = this.rec.mimeType; }
    else if (this.kind === 'file') { blob = this.file; videoOffset = 0; mime = this.file.type; }
    this.rec = null;
    const keyframes = [];
    if (this.keys.start) keyframes.push({ src: this.keys.start.src, ink: this.keys.start.ink ?? null, label: this.keys.start.label });
    for (const k of ['any', 'L', 'R']) if (this.keys[k]) keyframes.push({ src: this.keys[k].src, ink: this.keys[k].ink ?? null, label: this.keys[k].label });
    for (const s of this.snaps) keyframes.push({ src: s.src, ink: s.ink ?? null, label: s.label, values: s.values });
    const out = { summary, keyframes, pack: packFrames(a.frames), blob, mime, videoOffset, aspect: a.aspect, sourceName: this.kind === 'demo' ? '' : this.sourceName, simulated: this.kind === 'demo', mirror: this.mirror, kind: this.kind };
    this.newAnalyzer(false);
    return out;
  }

  // Calibrazione in piedi per le viste frontale e posteriore
  async calibrate(ms = 3000, onTick) {
    const a = this.analyzer, tilts = [], start = performance.now();
    const prev = this.onFrame;
    this.onFrame = (f, an, st) => { prev?.(f, an, st); if (f && f.P[23].v > 0.4 && f.P[24].v > 0.4) { const dx = Math.abs(f.P[24].x - f.P[23].x); if (dx > 0.005) tilts.push(Math.atan2(f.P[24].y - f.P[23].y, dx) * 180 / Math.PI); } };
    while (performance.now() - start < ms) { onTick?.(Math.ceil((ms - (performance.now() - start)) / 1000)); await new Promise((r) => setTimeout(r, 200)); }
    this.onFrame = prev;
    if (tilts.length < 6) return null;
    this.baseTilt = median(tilts); a.baseTilt = this.baseTilt;
    return this.baseTilt;
  }
}
