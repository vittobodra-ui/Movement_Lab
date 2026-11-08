import { RunAnalyzer, I, prepareFrame } from './corsa-metrics.js';
import { simulate, DEMO_PARAMS } from './corsa-sim.js';
import { createPose } from './engine.js';
import { pair, level, mark, sideWord, thresholds } from './asym.js';
import { saveSession } from './corsa-store.js';
import { renderArchive, renderReport, VIEW_NAMES } from './corsa-report.js';
import { wheelLimits } from './corsa-ruota.js';
import { runCueSvg, runCueText } from './corsa-cues.js';
import { inkFigure } from './corsa-ink.js';

const $ = (id) => document.getElementById(id);
const NOTE = (m, err = false) => { const s = $('status'); s.textContent = m; s.classList.toggle('err', err); };
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* preferenza non salvata */ } },
};
const num = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
const goal = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };

const VIEWS = ['side', 'front', 'rear'];
const BONES_CENTER = [[11, 12], [11, 23], [12, 24], [23, 24]];
const BONES_L = [[11, 13], [13, 15], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31]];
const BONES_R = [[12, 14], [14, 16], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]];
const RING = 20, KEY_W = 640, ANALYSIS_SIZE = 640, SLOW_FPS = 15, MIN_LIVE_STEPS = 5;
const LIMITS = thresholds();

const SIDE_ROWS = [
  { k: 'cadence', label: 'Cadenza', unit: 'passi/min', d: 0, hero: true },
  { k: 'contact', label: 'Tempo di contatto', unit: 'ms', d: 0, tol: true },
  { k: 'flight', label: 'Tempo di volo', unit: 'ms', d: 0, tol: true },
  { k: 'overstride', label: 'Tallone avanti al bacino', unit: '% gamba', d: 0, limit: 'g_over' },
  { k: 'shank', label: 'Tibia al contatto', unit: '°', d: 0 },
  { k: 'kneeIC', label: 'Ginocchio al contatto', unit: '°', d: 0 },
  { k: 'kneeStance', label: 'Flessione massima in appoggio', unit: '°', d: 0 },
  { k: 'trunk', label: 'Inclinazione del tronco', unit: '°', d: 0 },
  { k: 'oscillation', label: 'Oscillazione verticale', unit: '% gamba', d: 0 },
];
const FRONT_ROWS = [
  { k: 'cadence', label: 'Cadenza', unit: 'passi/min', d: 0 },
  { k: 'drop', label: 'Caduta del bacino', unit: '°', d: 1, dual: true, limit: 'g_drop' },
  { k: 'valgus', label: 'Valgo del ginocchio', unit: '°', d: 1, dual: true, limit: 'g_valgus' },
  { k: 'lateral', label: 'Piede dalla linea mediana', unit: '% gamba', d: 0, dual: true },
  { k: 'stepWidth', label: 'Larghezza del passo', unit: '% gamba', d: 0, derived: true },
  { k: 'crossover', label: 'Passi che incrociano', unit: '%', d: 0, derived: true },
  { k: 'asymmetry', label: 'Asimmetria tempo del passo', unit: '%', d: 1, derived: true },
];

const views = {};
let session = null, cameras = [], demoActive = false, demoRaf = 0, calib = null, baselineTilt = null;
let metronome = null;

function buildBays() {
  $('bays').innerHTML = VIEWS.map((v) => {
    const rows = v === 'side' ? SIDE_ROWS : FRONT_ROWS;
    return `<section class="bay" data-view="${v}">
      <div class="bay-head"><h2>${VIEW_NAMES[v]}</h2><span class="state" id="state_${v}">Nessuna sorgente</span></div>
      <div class="stage"><video id="vid_${v}" muted playsinline hidden></video><canvas id="ovl_${v}"></canvas>
        <div class="placeholder" id="ph_${v}">Scegli una webcam o un file video qui sotto</div><span class="tag" id="tag_${v}" hidden>Simulazione</span></div>
      <div class="src-row"><select id="src_${v}" aria-label="Sorgente per ${VIEW_NAMES[v]}"></select>
        <label class="mirror"><input type="checkbox" id="mir_${v}"> Specchiata</label></div>
      <input type="file" id="file_${v}" accept="video/*" hidden>
      <div class="readout">${rows.map((r) => `<div class="row ${r.hero ? 'hero' : ''}" id="row_${v}_${r.k}"><span>${r.label}</span><span class="val" id="val_${v}_${r.k}">–</span>${r.dual || r.k === 'asymmetry' ? `<span class="asymline" id="asym_${v}_${r.k}"></span>` : ''}</div>`).join('')}</div>
    </section>`;
  }).join('');
  for (const v of VIEWS) {
    views[v] = {
      name: v, kind: 'none', video: $(`vid_${v}`), canvas: $(`ovl_${v}`), analyzer: null, pose: null, poseKind: null,
      ring: [], ringAt: 0, lastLm: null, stream: null, rvfcOn: false, lastTs: 0, errors: 0, ended: false, sourceName: '', keyframes: {}, keyTimes: {},
      calibTilts: [],
    };
    resetAnalyzer(views[v]);
    $(`src_${v}`).onchange = (e) => chooseSource(views[v], e.target.value);
    $(`file_${v}`).onchange = (e) => { if (e.target.files[0]) useFile(views[v], e.target.files[0]); };
    $(`mir_${v}`).onchange = (e) => { views[v].analyzer.mirror = e.target.checked; };
  }
  fillSourceMenus();
}

function fillSourceMenus() {
  const seen = {};
  const opts = cameras.map((c, i) => {
    const base = c.label || `Webcam ${i + 1}`;
    seen[base] = (seen[base] ?? 0) + 1;
    return `<option value="cam:${c.deviceId}">${base.replace(/</g, '&lt;')}${seen[base] > 1 ? ` (${seen[base]})` : ''}</option>`;
  }).join('');
  for (const v of VIEWS) {
    const el = $(`src_${v}`), cur = el.value;
    el.innerHTML = `<option value="">Nessuna sorgente</option>${cameras.length ? opts : '<option value="enable">Attiva le webcam…</option>'}<option value="file">File video…</option>`;
    if ([...el.options].some((o) => o.value === cur)) el.value = cur;
  }
}

function resetAnalyzer(st) {
  const aspect = st.kind === 'demo' ? 16 / 9 : (st.video.videoWidth && st.video.videoHeight ? st.video.videoWidth / st.video.videoHeight : 16 / 9);
  st.analyzer = new RunAnalyzer({ view: st.name, aspect, mirror: $(`mir_${st.name}`).checked, baselineTilt, onEvent: (ev) => onEvent(st, ev) });
  st.keyframes = {}; st.keyTimes = {}; st.ended = false;
}

async function enableCameras() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
    cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    fillSourceMenus();
    NOTE(cameras.length ? `${cameras.length} webcam trovate. Assegna ognuna a una vista.` : 'Nessuna webcam trovata. Collegala e ricarica la pagina.', !cameras.length);
  } catch (e) {
    NOTE(e.name === 'NotAllowedError' ? 'Accesso alle webcam negato. Consentilo dall’icona accanto all’indirizzo, poi ricarica la pagina.' : `Webcam non disponibili: ${e.message}`, true);
  }
}

function stopSource(st) {
  st.stream?.getTracks().forEach((t) => t.stop());
  st.stream = null;
  st.video.pause(); st.video.srcObject = null;
  if (st.fileUrl) { URL.revokeObjectURL(st.fileUrl); st.fileUrl = null; st.video.removeAttribute('src'); st.video.load(); }
  st.video.hidden = true;
  st.kind = 'none'; st.sourceName = '';
  st.canvas.getContext('2d').clearRect(0, 0, st.canvas.width, st.canvas.height);
  $(`ph_${st.name}`).hidden = false; $(`tag_${st.name}`).hidden = true;
  $(`state_${st.name}`).textContent = 'Nessuna sorgente'; $(`state_${st.name}`).classList.remove('warn');
  refreshButtons();
}

async function chooseSource(st, value) {
  if (demoActive) stopDemo();
  if (value === 'enable') { $(`src_${st.name}`).value = ''; await enableCameras(); return; }
  if (value === 'file') { $(`file_${st.name}`).value = ''; $(`file_${st.name}`).click(); return; }
  stopSource(st);
  if (!value) return;
  const deviceId = value.slice(4);
  try {
    st.stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } } });
  } catch (e) {
    $(`src_${st.name}`).value = '';
    const usb = e.name === 'NotReadableError' || e.name === 'AbortError';
    NOTE(usb ? 'Questa webcam non si avvia insieme alle altre. Collegala a una presa USB su un altro lato del PC.' : `Webcam non avviata: ${e.message}`, true);
    return;
  }
  st.kind = 'camera';
  st.sourceName = st.stream.getVideoTracks()[0]?.label ?? '';
  st.video.srcObject = st.stream;
  await startVideo(st);
}

async function useFile(st, file) {
  if (demoActive) stopDemo();
  stopSource(st);
  st.kind = 'file'; st.sourceName = file.name;
  st.fileUrl = URL.createObjectURL(file);
  st.video.src = st.fileUrl;
  st.video.playbackRate = parseFloat($('g_rate').value);
  const el = $(`src_${st.name}`);
  el.querySelector('option[data-file]')?.remove();
  const o = new Option(file.name, 'loaded'); o.dataset.file = '1'; el.add(o); el.value = 'loaded';
  await new Promise((res) => { st.video.onloadedmetadata = res; st.video.onerror = res; });
  if (st.video.error) { NOTE('Questo formato video non si apre nel browser. Convertilo in MP4 (H.264).', true); stopSource(st); return; }
  await startVideo(st);
  st.video.pause();
  $(`state_${st.name}`).textContent = 'Pronto: parte con la sessione';
}

async function startVideo(st) {
  st.video.hidden = false;
  $(`ph_${st.name}`).hidden = true;
  if (st.kind === 'camera') await st.video.play();
  await ensurePose(st);
  resetAnalyzer(st);
  sizeCanvas(st);
  allocRing(st);
  if (!st.rvfcOn) { st.rvfcOn = true; st.video.requestVideoFrameCallback((n, m) => onVideoFrame(st, n, m)); }
  refreshButtons();
}

async function ensurePose(st) {
  const kind = $('g_model').value;
  if (st.pose && st.poseKind === kind) return;
  try {
    st.pose?.close?.();
    NOTE('Carico il riconoscimento della posa…');
    st.pose = await createPose(kind);
    st.poseKind = kind;
    NOTE(st.pose.delegate === 'CPU' ? 'Riconoscimento attivo sul processore: i fotogrammi analizzati saranno pochi. Controlla la scheda grafica.' : 'Riconoscimento attivo.', st.pose.delegate === 'CPU');
  } catch (e) {
    st.pose = null;
    NOTE('Riconoscimento non caricato. Al primo avvio serve Internet: controlla la connessione e riavvia il programma.', true);
    console.error(e);
  }
}

function sizeCanvas(st) {
  const w = st.video.videoWidth || 1280, h = st.video.videoHeight || 720;
  if (st.canvas.width !== w) st.canvas.width = w;
  if (st.canvas.height !== h) st.canvas.height = h;
}
function allocRing(st) {
  const h = Math.round(KEY_W * (st.canvas.height / st.canvas.width));
  st.ring = Array.from({ length: RING }, () => { const c = document.createElement('canvas'); c.width = KEY_W; c.height = h; return { c, t: -1, lm: null }; });
}

function onVideoFrame(st, now, meta) {
  if (st.kind !== 'camera' && st.kind !== 'file') { st.rvfcOn = false; return; }
  st.video.requestVideoFrameCallback((n, m) => onVideoFrame(st, n, m));
  if (!st.pose) return;
  if (st.kind === 'file' && !session) return;
  const t = st.kind === 'file' ? meta.mediaTime * 1000 : (meta.captureTime ?? now);
  let lm = null;
  try {
    st.lastTs = Math.max(st.lastTs + 1, Math.round(performance.now()));
    lm = st.pose.detect(analysisFrame(st), st.lastTs);
    st.errors = 0;
  } catch (e) {
    if (++st.errors === 5) { NOTE(`Errore nel riconoscimento (${VIEW_NAMES[st.name]}): ${e.message}`, true); console.error(e); }
    return;
  }
  handleFrame(st, lm, t);
  if (session && !calib) stashFrame(st, st.video, lm, t);
}

// Il modello lavora comunque a bassa risoluzione: ridurre l'immagine prima accorcia i tempi di analisi.
function analysisFrame(st) {
  const vw = st.video.videoWidth, vh = st.video.videoHeight;
  const sc = Math.min(1, ANALYSIS_SIZE / Math.max(vw, vh));
  if (!vw || !vh || sc === 1) return st.video;
  const off = st.off ??= Object.assign(document.createElement('canvas'), { id: `off_${st.name}` }), w = Math.round(vw * sc), h = Math.round(vh * sc);
  if (off.width !== w) off.width = w;
  if (off.height !== h) off.height = h;
  (st.offC ??= off.getContext('2d')).drawImage(st.video, 0, 0, w, h);
  return off;
}

function handleFrame(st, lm, t) {
  st.analyzer.push(lm, t);
  st.lastLm = lm;
  drawOverlay(st, lm);
  if (calib && lm && st.name !== 'side') {
    const p = prepareFrame(lm, st.analyzer);
    if (p) {
      const dx = Math.abs(p[I.rHip].x - p[I.lHip].x);
      if (dx > 0.005) st.calibTilts.push(Math.atan2(p[I.rHip].y - p[I.lHip].y, dx) * 180 / Math.PI);
    }
  }
}

function drawSkeleton(ctx, st, lm, w, h) {
  const prepared = lm.map((l) => ({ x: ($(`mir_${st.name}`).checked ? 1 - l.x : l.x), y: l.y }));
  if (st.name !== 'side') {
    const dx = prepared[24].x - prepared[23].x;
    if (st.name === 'rear' ? dx < 0 : dx > 0) for (const [a, b] of [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) { const t = prepared[a]; prepared[a] = prepared[b]; prepared[b] = t; }
  }
  const P = prepared.map((p) => ({ x: ($(`mir_${st.name}`).checked ? 1 - p.x : p.x) * w, y: p.y * h }));
  const lw = Math.max(2.5, w / 280);
  const stroke = (bones, c) => { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); for (const [a, b] of bones) { ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); } ctx.stroke(); };
  stroke(BONES_CENTER, '#ffffff');
  const side = st.name === 'side';
  stroke(BONES_L, side ? '#e6edf3' : '#4d9df0');
  stroke(BONES_R, side ? '#e6edf3' : '#f58a55');
  ctx.fillStyle = '#ffffff';
  for (const i of [23, 24, 25, 26, 27, 28]) { ctx.beginPath(); ctx.arc(P[i].x, P[i].y, lw * 1.25, 0, 7); ctx.fill(); }
}

function drawOverlay(st, lm) {
  const ctx = st.canvas.getContext('2d'), w = st.canvas.width, h = st.canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (st.kind === 'demo') {
    ctx.fillStyle = '#0d1b2b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#30414f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, h * 0.86); ctx.lineTo(w, h * 0.86); ctx.stroke();
  }
  if (lm) drawSkeleton(ctx, st, lm, w, h);
}

function stashFrame(st, source, lm, t, inkLm = lm) {
  if (!st.ring.length) return;
  const f = st.ring[st.ringAt = (st.ringAt + 1) % RING];
  const c = f.c.getContext('2d');
  c.drawImage(source, 0, 0, f.c.width, f.c.height);
  f.t = t; f.lm = lm; f.ilm = inkLm;
}

// Tiene come immagine del referto il passo piu' vicino al valore tipico della sessione.
function onEvent(st, ev) {
  if (!session || !st.ring.length) return;
  const metric = st.name === 'side' ? 'overstride' : `drop_${ev.side}`;
  const v = ev.values[metric];
  if (!Number.isFinite(v)) return;
  const key = st.name === 'side' ? 'ic' : ev.side;
  const med = st.analyzer.live(metric, 60);
  const score = Math.abs(v - med);
  const prior = st.keyframes[key];
  if (prior && (score >= prior.score || ev.t - (st.keyTimes[key] ?? 0) < 1500)) return;
  let best = null;
  for (const f of st.ring) if (f.t >= 0 && (!best || Math.abs(f.t - ev.t) < Math.abs(best.t - ev.t))) best = f;
  if (!best) return;
  const out = document.createElement('canvas'); out.width = best.c.width; out.height = best.c.height;
  const c = out.getContext('2d');
  c.drawImage(best.c, 0, 0);
  if (best.lm) drawSkeleton(c, st, best.lm, out.width, out.height);
  st.keyTimes[key] = ev.t;
  let ink = null;
  if (best.ilm) try {
    const ar = out.width / out.height, P = best.ilm.map((l) => ({ x: l.x * ar, y: l.y, v: l.visibility ?? 1 }));
    ink = inkFigure(P, { aspect: ar, side: st.name === 'side', near: (best.ilm[25].z ?? 0) <= (best.ilm[26].z ?? 0) ? 'L' : 'R' });
  } catch { /* solo la foto */ }
  st.keyframes[key] = { score, src: out.toDataURL('image/jpeg', 0.72), ink, label: key === 'ic' ? 'Contatto iniziale, passo tipico' : `Appoggio ${key === 'L' ? 'sinistro' : 'destro'}, passo tipico` };
}

/* ---------- letture ---------- */
function renderReadouts() {
  for (const v of VIEWS) {
    const st = views[v], a = st.analyzer;
    const rows = v === 'side' ? SIDE_ROWS : FRONT_ROWS;
    const derived = a.derived(40);
    for (const r of rows) {
      const el = $(`val_${v}_${r.k}`), row = $(`row_${v}_${r.k}`);
      let over = false;
      if (r.dual) {
        const l = a.live(`${r.k}_L`), rv = a.live(`${r.k}_R`);
        el.innerHTML = `<span class="lv">${num(l, r.d)}</span><span class="rv">${num(rv, r.d)}</span> <small>${r.unit}</small>`;
        const lim = r.limit ? goal(r.limit) : null;
        over = lim != null && (l > lim || rv > lim);
        renderAsym(v, r, a, l, rv);
      } else {
        const val = r.derived ? derived[r.k] : a.live(r.k);
        const tol = r.tol && Number.isFinite(a.eventToleranceMs) && val != null ? ` <small>±${Math.ceil(a.eventToleranceMs)}</small>` : '';
        el.innerHTML = `${num(val, r.d)}${tol} <small>${r.unit}</small>`;
        if (r.k === 'asymmetry') renderAsymTime(v, a, val);
        if (r.k === 'cadence' && val != null) {
          const lo = goal('g_cadMin'), hi = goal('g_cadMax');
          over = (lo != null && val < lo) || (hi != null && val > hi);
        } else if (r.limit && val != null) { const lim = goal(r.limit); over = lim != null && val > lim; }
      }
      row.classList.toggle('over', over);
    }
    if (st.kind !== 'none') {
      const q = a.quality, s = $(`state_${v}`), running = session || st.kind === 'camera' || st.kind === 'demo';
      if (running && (a.total > 0)) {
        const lost = q < 0.7, slow = !lost && a.total > 30 && a.fps > 0 && a.fps < SLOW_FPS;
        s.textContent = lost ? `Corpo riconosciuto nel ${Math.round(q * 100)}%: controlla inquadratura e luce` : slow ? `Analisi lenta, ${Math.round(a.fps)} fps: tempi di contatto poco affidabili. Usa meno camere, “Veloce” o un video registrato` : `${Math.round(a.fps)} fps, corpo ${Math.round(q * 100)}%`;
        s.classList.toggle('warn', lost || slow);
      }
    }
  }
  renderRunner();
}
// Dal vivo si confrontano le mediane degli ultimi passi di ciascun lato, mai i valori istantanei.
function livePair(a, key, d, limit) {
  if (a.values(`${key}_L`, 10).length < MIN_LIVE_STEPS || a.values(`${key}_R`, 10).length < MIN_LIVE_STEPS) return null;
  return pair(a.live(`${key}_L`), a.live(`${key}_R`), d, limit);
}
function renderAsym(v, r, a) {
  const el = $(`asym_${v}_${r.k}`);
  const p = r.k === 'lateral' ? null : livePair(a, r.k, r.d, LIMITS.smallAngle);
  el.innerHTML = p?.level ? `<span class="asym lv${p.level}">${mark(p.level)} differenza ${num(p.diff, r.d)}${r.unit}, maggiore a ${sideWord(p.side)}</span>` : '';
}
function renderAsymTime(v, a, val) {
  const el = $(`asym_${v}_asymmetry`);
  const enough = a.values('stepTime_L', 10).length >= MIN_LIVE_STEPS && a.values('stepTime_R', 10).length >= MIN_LIVE_STEPS;
  const lv = enough ? level(Math.round(val * 10) / 10, LIMITS.percent) : 0;
  const longer = a.live('stepTime_L') > a.live('stepTime_R') ? 'L' : 'R';
  el.innerHTML = lv ? `<span class="asym lv${lv}">${mark(lv)} passo più lungo a ${sideWord(longer)}</span>` : '';
}
const bestCadence = () => {
  for (const v of ['side', 'rear', 'front']) { const c = views[v].analyzer.live('cadence'); if (c != null) return c; }
  return null;
};
const frontal = (key) => {
  for (const v of ['rear', 'front']) { const c = views[v].analyzer.live(key); if (c != null) return c; }
  return null;
};
function renderRunner() {
  if ($('runner').hidden) return;
  const c = bestCadence();
  $('rCad').textContent = num(c);
  const lo = goal('g_cadMin'), hi = goal('g_cadMax');
  const off = c != null && ((lo != null && c < lo) || (hi != null && c > hi));
  $('rCad').classList.toggle('off', off);
  $('rCadHint').textContent = c == null ? '' : off ? (lo != null && c < lo ? '▲ aumenta il ritmo' : '▼ riduci il ritmo') : '';
  $('rDropL').textContent = num(frontal('drop_L'), 1); $('rDropR').textContent = num(frontal('drop_R'), 1);
  $('rValL').textContent = num(frontal('valgus_L'), 1); $('rValR').textContent = num(frontal('valgus_R'), 1);
  $('rOver').textContent = num(views.side.analyzer.live('overstride'));
  const fa = [views.rear, views.front].find((s) => s.analyzer.events.length)?.analyzer;
  const lvOf = (key) => { const p = fa ? livePair(fa, key, 1, LIMITS.smallAngle) : null; return p ? mark(p.level) : ''; };
  $('rDropA').textContent = lvOf('drop'); $('rValA').textContent = lvOf('valgus');
  const items = runnerFaults(c, lo);
  const has = (k) => items.some((i) => i.key.startsWith(k));
  $('rmDrop').classList.toggle('off', has('drop')); $('rmVal').classList.toggle('off', has('valgus')); $('rmOver').classList.toggle('off', has('over'));
  // Al corridore bastano due indicazioni alla volta, le più importanti.
  const PRIO = ['over', 'valgus', 'drop', 'trunk', 'cad', 'osc', 'cross'], rank = (i) => PRIO.findIndex((p) => i.key.startsWith(p));
  const top = [...items].sort((a, b) => rank(a) - rank(b)).slice(0, 2);
  const html = top.map((i) => `<li>${i.cue}</li>`).join('') + (items.length > 2 ? `<li class="more">e altre ${items.length - 2}</li>` : '');
  if ($('rAlerts').innerHTML !== html) $('rAlerts').innerHTML = html;
  $('runner').classList.toggle('alert', items.length > 0);
  runnerItems = [...items].sort((a, b) => rank(a) - rank(b));
  renderRunnerCue(top);
}

/* ---------- avvisi per il corridore: stesse soglie della ruota della corsa ---------- */
const LEG = { L: [[23, 25], [25, 27], [27, 31]], R: [[24, 26], [26, 28], [28, 32]] };
const TRUNK = [[11, 23], [12, 24], [11, 12]], PELVIS = [[23, 24]];
function runnerFaults(cad, cadMin) {
  const T = wheelLimits(), s = views.side.analyzer, out = [];
  const lim = (id, d) => goal(id) ?? d;
  const over = s.live('overstride'), osc = s.live('oscillation'), tr = s.live('trunk');
  if (over != null && over > lim('g_over', T.overstride)) out.push({ key: 'over', cue: 'Passo più corto: piede sotto il corpo', view: 'side', segs: [...LEG.L, ...LEG.R] });
  if (osc != null && osc > T.oscillation) out.push({ key: 'osc', cue: 'Meno rimbalzo, corri più radente', view: 'side', segs: TRUNK });
  if (tr != null && tr > T.trunkForward) out.push({ key: 'trunk', cue: 'Busto più dritto', view: 'side', segs: TRUNK });
  else if (tr != null && tr < T.trunkBack) out.push({ key: 'trunk', cue: 'Busto appena in avanti, non indietro', view: 'side', segs: TRUNK });
  if (cad != null && cadMin != null && cad < cadMin) out.push({ key: 'cad', cue: 'Passi più rapidi', view: 'any', segs: [] });
  for (const sd of ['L', 'R']) {
    const v = frontal(`valgus_${sd}`), d = frontal(`drop_${sd}`);
    if (v != null && v > lim('g_valgus', T.valgus)) out.push({ key: `valgus_${sd}`, cue: `Ginocchio ${sd === 'L' ? 'sinistro' : 'destro'} in fuori`, view: 'front', segs: LEG[sd].slice(0, 2) });
    if (d != null && d > lim('g_drop', 6)) out.push({ key: `drop_${sd}`, cue: `Bacino in piano sull’appoggio ${sd === 'L' ? 'sinistro' : 'destro'}`, view: 'front', segs: PELVIS });
  }
  const cross = ['rear', 'front'].map((v) => views[v].analyzer.events.length ? views[v].analyzer.derived(40).crossover : null).find((x) => x != null);
  if (cross != null && cross > 25) out.push({ key: 'cross', cue: 'Piedi meno incrociati', view: 'front', segs: [[27, 31], [28, 32]] });
  return out;
}
// Video del corridore a specchio, ingrandito su di lui, con lo scheletro e in rosso le parti da correggere.
// Disegnato a ogni fotogramma dello schermo: la figura si muove fluida anche tra un riconoscimento e l'altro.
let runnerItems = [], runnerRaf = 0, runnerCueKey = '';
const runnerMirror = () => $('rMirror').getAttribute('aria-pressed') === 'true';
function runnerView(items) {
  const first = items.find((i) => i.view !== 'any')?.view;
  const order = first === 'front' && (views.rear.lastLm || views.front.lastLm) ? ['rear', 'front', 'side'] : ['side', 'rear', 'front'];
  return order.find((k) => views[k].lastLm);
}
function drawRunnerFig() {
  const cv = $('rFig'), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  const dpr = devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#0d1b2b'; c.fillRect(0, 0, W, H);
  const items = runnerItems, v = runnerView(items);
  if (!v) { c.fillStyle = '#a9b8c5'; c.font = '18px Bahnschrift, Barlow, Segoe UI, sans-serif'; c.fillText('Il video compare quando una camera vede il corridore', 12, H / 2); return; }
  const st = views[v], mir = runnerMirror();
  // Destra e sinistra come le vede l'analisi, poi i punti in coordinate dell'immagine.
  const raw = st.lastLm.map((l) => ({ x: l.x, y: l.y }));
  if (v !== 'side') {
    const chk = $(`mir_${v}`).checked, dx = (chk ? -1 : 1) * (raw[24].x - raw[23].x);
    if (v === 'rear' ? dx < 0 : dx > 0) for (const [a, b] of [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) { const t = raw[a]; raw[a] = raw[b]; raw[b] = t; }
  }
  // Movimento ammorbidito tra un riconoscimento e il successivo.
  if (!st.dispLm || st.dispView !== v || st.dispLm.length !== raw.length) { st.dispLm = raw.map((p) => ({ ...p })); st.dispView = v; }
  for (let i = 0; i < raw.length; i++) { st.dispLm[i].x += (raw[i].x - st.dispLm[i].x) * 0.45; st.dispLm[i].y += (raw[i].y - st.dispLm[i].y) * 0.45; }
  const P = st.dispLm, vid = st.kind !== 'demo' && st.video.videoWidth ? st.video : null;
  const sw = vid ? vid.videoWidth : 1280, sh = vid ? vid.videoHeight : 720;
  // Riquadro attorno al corridore, che si sposta lentamente.
  const idx = [0, 11, 12, 15, 16, 23, 24, 27, 28, 31, 32];
  const xs = idx.map((i) => P[i].x * sw), ys = idx.map((i) => P[i].y * sh);
  let bh = (Math.max(...ys) - Math.min(...ys)) * 1.35, bw = (Math.max(...xs) - Math.min(...xs)) * 1.5;
  bh = Math.max(bh, bw * H / W, sh * 0.35); bw = bh * W / H;
  const want = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, h: bh };
  const box = st.dispBox ??= want;
  box.x += (want.x - box.x) * 0.08; box.y += (want.y - box.y) * 0.08; box.h += (want.h - box.h) * 0.05;
  const bH = box.h, bW = bH * W / H, sx = box.x - bW / 2, sy = box.y - bH / 2, s = H / bH;
  const M = (p) => { const x = (p.x * sw - sx) * s; return { x: mir ? W - x : x, y: (p.y * sh - sy) * s }; };
  if (vid) {
    c.save(); if (mir) { c.translate(W, 0); c.scale(-1, 1); }
    c.drawImage(vid, sx, sy, bW, bH, 0, 0, W, H); c.restore();
    c.fillStyle = 'rgba(13,27,43,.25)'; c.fillRect(0, 0, W, H);
  } else {
    const g = M({ x: 0, y: 0.86 }).y; c.strokeStyle = '#30414f'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, g); c.lineTo(W, g); c.stroke();
  }
  const lw = Math.max(4, H / 90);
  const line = (segs, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); for (const [a, b] of segs) { const A = M(P[a]), B = M(P[b]); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); } c.stroke(); };
  const all = [...BONES_CENTER, ...BONES_L, ...BONES_R];
  line(all, 'rgba(0,0,0,.45)', lw * 1.8); line(all, '#e6edf3', lw);
  c.fillStyle = '#e6edf3';
  for (const i of [23, 24, 25, 26, 27, 28]) { const q = M(P[i]); c.beginPath(); c.arc(q.x, q.y, lw * 0.9, 0, 7); c.fill(); }
  const hd = M(P[0]), shc = M({ x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 }), hr = Math.max(lw * 2, Math.hypot(hd.x - shc.x, hd.y - shc.y) * 0.45);
  c.lineWidth = lw * 0.9; c.strokeStyle = '#e6edf3'; c.beginPath(); c.arc(hd.x, hd.y, hr, 0, 7); c.stroke();
  const red = items.filter((i) => i.view === 'any' || (i.view === 'side') === (v === 'side')).flatMap((i) => i.segs);
  if (red.length) {
    const pulse = 1 + 0.2 * Math.sin(performance.now() / 160);
    line(red, 'rgba(0,0,0,.7)', lw * 3.2 * pulse); line(red, '#ff2d4a', lw * 2.2 * pulse);
  }
  c.fillStyle = 'rgba(13,27,43,.7)'; c.fillRect(0, H - 30, W, 30);
  c.fillStyle = '#e6edf3'; c.font = '15px Bahnschrift, Barlow, Segoe UI, sans-serif'; c.fillText(`${VIEW_NAMES[v]}${mir ? ', a specchio' : ''}`, 10, H - 10);
}
function renderRunnerCue(top) {
  const it = top[0], key = it ? `${it.key}|${runnerMirror()}` : '';
  if (key === runnerCueKey) return;
  runnerCueKey = key;
  $('rCue').innerHTML = it ? `<h3>Come correggere</h3>${runCueSvg(it.key, { mirror: runnerMirror(), side: it.key.endsWith('_R') ? 'R' : 'L' })}<p>${runCueText(it.key)}</p>` : '';
  $('rCue').hidden = !it;
}
function runnerLoop() {
  if ($('runner').hidden) { runnerRaf = 0; return; }
  drawRunnerFig();
  runnerRaf = requestAnimationFrame(runnerLoop);
}
function openRunner() { $('runner').hidden = false; runnerCueKey = '~'; if (!runnerRaf) runnerRaf = requestAnimationFrame(runnerLoop); }
function closeRunner() { $('runner').hidden = true; if (runnerRaf) cancelAnimationFrame(runnerRaf); runnerRaf = 0; }

function drawRibbon(canvas) {
  const dpr = devicePixelRatio || 1;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  if (!cssW) return;
  if (canvas.width !== Math.round(cssW * dpr)) canvas.width = Math.round(cssW * dpr);
  if (canvas.height !== Math.round(cssH * dpr)) canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const src = [views.rear, views.front, views.side].find((s) => s.analyzer.events.length);
  if (!src) { ctx.fillStyle = '#a9b8c5'; ctx.font = '14px Bahnschrift, Barlow, Segoe UI, sans-serif'; ctx.fillText('Gli appoggi compaiono qui quando la persona corre', 12, cssH / 2 + 5); return; }
  const a = src.analyzer, evs = a.events.slice(-40);
  const end = a.frames.at(-1)?.t ?? 0, span = 8000;
  const X = (t) => cssW - (end - t) / span * cssW;
  const laneH = (cssH - 14) / 2;
  for (const e of evs) {
    const len = e.contact ?? e.duration, x = X(e.t), w = Math.max(3, len / span * cssW - 2);
    if (x + w < 0) continue;
    const lane = e.side === 'R' ? 1 : e.side === 'L' ? 0 : (a.events.indexOf(e) % 2);
    ctx.fillStyle = e.side === 'L' ? '#4d9df0' : e.side === 'R' ? '#f58a55' : '#c4d0d9';
    const y = 7 + lane * laneH;
    ctx.beginPath(); ctx.roundRect(x, y + 2, w, laneH - 4, 3); ctx.fill();
  }
}

/* ---------- simulazione ---------- */
function startDemo() {
  for (const v of VIEWS) { stopSource(views[v]); $(`src_${v}`).value = ''; }
  demoActive = true;
  $('demo').textContent = 'Ferma la simulazione';
  for (const v of VIEWS) {
    const st = views[v];
    st.kind = 'demo'; st.canvas.width = 1280; st.canvas.height = 720;
    $(`ph_${v}`).hidden = true; $(`tag_${v}`).hidden = false;
    resetAnalyzer(st); allocRing(st);
  }
  const start = performance.now();
  const tick = (now) => {
    if (!demoActive) return;
    const t = now - start;
    for (const v of VIEWS) {
      const st = views[v];
      if (t - (st.lastDemo ?? -100) < 16) continue;
      st.lastDemo = t;
      const lm = simulate(v, t, DEMO_PARAMS);
      handleFrame(st, lm, t);
      if (session && !calib) stashFrame(st, st.canvas, null, t, lm);
    }
    demoRaf = requestAnimationFrame(tick);
  };
  demoRaf = requestAnimationFrame(tick);
  refreshButtons();
  NOTE('Simulazione: corridore virtuale con valori noti, utile per provare il programma.');
}
function stopDemo() {
  demoActive = false; cancelAnimationFrame(demoRaf);
  $('demo').textContent = 'Prova con dati simulati';
  for (const v of VIEWS) { stopSource(views[v]); resetAnalyzer(views[v]); views[v].lastDemo = undefined; }
  NOTE('');
}

/* ---------- sessione ---------- */
const active = () => VIEWS.map((v) => views[v]).filter((s) => s.kind !== 'none');
function refreshButtons() {
  const n = active().length;
  $('start').disabled = !session && n === 0;
  $('calibrate').disabled = !!session || !active().some((s) => s.name !== 'side' && s.kind !== 'file');
}

function startSession() {
  for (const st of active()) {
    st.ringAt = 0; st.ring.forEach((f) => { f.t = -1; });
    resetAnalyzer(st);
    if (st.kind === 'file') {
      st.video.currentTime = 0; st.video.playbackRate = parseFloat($('g_rate').value);
      st.video.onended = () => { st.ended = true; if (session && active().every((s) => s.kind !== 'file' || s.ended) && !active().some((s) => s.kind === 'camera' || s.kind === 'demo')) finishSession(); };
    }
  }
  session = { startedAt: Date.now(), startPerf: performance.now(), simulated: demoActive };
  document.body.classList.add('running');
  for (const st of active()) if (st.kind === 'file') st.video.play();
  const b = $('start'); b.textContent = 'Termina e salva'; b.className = 'stop';
  $('clock').hidden = false;
  refreshButtons();
}

async function finishSession() {
  const s = session; session = null;
  document.body.classList.remove('running');
  const b = $('start'); b.textContent = 'Avvia sessione'; b.className = 'primary';
  $('clock').hidden = true;
  for (const st of active()) if (st.kind === 'file') st.video.pause();
  const doc = {
    id: Date.now(), createdAt: s.startedAt, durationS: (performance.now() - s.startPerf) / 1000, simulated: s.simulated, calibrated: baselineTilt != null,
    person: $('person').value.trim(), birth: window.LAB.client().name === $('person').value.trim() ? (window.LAB.client().birth || null) : null, heightCm: parseFloat($('height').value) || null, speed: $('speed').value, incline: $('incline').value, shoes: $('shoes').value.trim(), notes: $('notes').value.trim(),
    views: {},
  };
  for (const st of active()) {
    const a = st.analyzer;
    if (!a.events.length) continue;
    doc.views[st.name] = {
      ...a.summary(), fps: a.fps, quality: a.sessionQuality, sourceName: st.kind === 'demo' ? '' : st.sourceName,
      keyframes: Object.values(st.keyframes).map(({ label, src, ink }) => ({ label, src, ink })),
    };
  }
  refreshButtons();
  try {
    await saveSession(doc);
    fillPeople();
    location.hash = `#report/${doc.id}`;
  } catch (e) {
    NOTE(`Sessione non salvata: ${e.message}. Lo spazio del browser potrebbe essere esaurito.`, true);
  }
}

function calibrate() {
  if (calib) return;
  const targets = active().filter((s) => s.name !== 'side');
  targets.forEach((s) => { s.calibTilts = []; });
  calib = true;
  let left = 3;
  NOTE(`Calibrazione: la persona resta ferma in piedi, ${left} secondi…`);
  const id = setInterval(() => {
    left--;
    if (left > 0) { NOTE(`Calibrazione: la persona resta ferma in piedi, ${left} secondi…`); return; }
    clearInterval(id); calib = null;
    const tilts = targets.flatMap((s) => s.calibTilts);
    if (tilts.length < 10) { NOTE('Calibrazione non riuscita: corpo non riconosciuto. Controlla l’inquadratura e riprova.', true); return; }
    const sorted = [...tilts].sort((a, b) => a - b);
    baselineTilt = sorted[Math.floor(sorted.length / 2)];
    for (const v of VIEWS) views[v].analyzer.baselineTilt = baselineTilt;
    NOTE(`Calibrazione eseguita: bacino a riposo ${num(baselineTilt, 1)}°.`);
  }, 1000);
}

/* ---------- metronomo ---------- */
function toggleMetronome() {
  const b = $('metro');
  if (metronome) { clearTimeout(metronome.timer); metronome.ctx.close(); metronome = null; b.setAttribute('aria-pressed', 'false'); b.textContent = 'Metronomo'; return; }
  const ctx = new AudioContext();
  metronome = { ctx, next: ctx.currentTime + 0.05 };
  b.setAttribute('aria-pressed', 'true');
  const loop = () => {
    const spm = goal('g_metro') || 170;
    b.textContent = `Metronomo ${spm}`;
    while (metronome.next < ctx.currentTime + 0.2) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 1100; g.gain.setValueAtTime(0.5, metronome.next); g.gain.exponentialRampToValueAtTime(0.001, metronome.next + 0.05);
      o.connect(g); g.connect(ctx.destination); o.start(metronome.next); o.stop(metronome.next + 0.06);
      metronome.next += 60 / spm;
    }
    metronome.timer = setTimeout(loop, 50);
  };
  loop();
}

/* ---------- navigazione ---------- */
function route() {
  const [page, id, cmp] = (location.hash.slice(1) || 'live').split('/');
  for (const p of ['live', 'archivio', 'report', 'guida']) $(p).hidden = p !== page;
  if (!['live', 'archivio', 'report', 'guida'].includes(page)) $('live').hidden = false;
  document.querySelectorAll('[data-nav]').forEach((a) => { if (a.dataset.nav === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (page === 'archivio') renderArchive($('archivio'));
  if (page === 'report') renderReport($('report'), Number(id), cmp);
  window.scrollTo(0, 0);
}
const fillPeople = () => window.LAB.refreshPeople();

/* ---------- avvio ---------- */
buildBays();
for (const id of ['g_cadMin', 'g_cadMax', 'g_metro', 'g_drop', 'g_valgus', 'g_over', 'g_model', 'g_rate']) {
  const el = $(id), saved = ls.get(`ac_${id}`, null);
  if (saved !== null) el.value = saved;
  el.addEventListener('change', async () => {
    ls.set(`ac_${id}`, el.value);
    if (id === 'g_model') for (const st of active()) if (st.kind !== 'demo') await ensurePose(st);
  });
}
$('start').onclick = () => (session ? finishSession() : startSession());
$('calibrate').onclick = calibrate;
$('demo').onclick = () => (demoActive ? stopDemo() : startDemo());
$('metro').onclick = toggleMetronome;
$('goalsBtn').onclick = (e) => { const g = $('goals'); g.hidden = !g.hidden; e.target.setAttribute('aria-expanded', String(!g.hidden)); };
$('sessionForm').onsubmit = (e) => e.preventDefault();
$('runnerBtn').onclick = () => { openRunner(); document.documentElement.requestFullscreen?.().catch(() => {}); };
$('runnerClose').onclick = () => { closeRunner(); if (document.fullscreenElement) document.exitFullscreen(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRunner(); });
try { if (localStorage.getItem('corsa_runner_mirror') === '0') $('rMirror').setAttribute('aria-pressed', 'false'); } catch {}
$('rMirror').onclick = () => {
  const on = !runnerMirror(); $('rMirror').setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('corsa_runner_mirror', on ? '1' : '0'); } catch {}
  runnerCueKey = '~';
};
addEventListener('hashchange', route);
window.LAB.attach({ name: 'person', height: 'height', datalist: 'people', busy: () => !!session });
route();
setInterval(renderReadouts, 250);
setInterval(() => { if (session) { const s = Math.floor((performance.now() - session.startPerf) / 1000); $('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }, 500);
const ribbonLoop = () => { if (!$('live').hidden) drawRibbon($('ribbon')); if (!$('runner').hidden) drawRibbon($('ribbon2')); requestAnimationFrame(ribbonLoop); };
ribbonLoop();
if (navigator.mediaDevices?.enumerateDevices) {
  navigator.mediaDevices.enumerateDevices().then((d) => { const c = d.filter((x) => x.kind === 'videoinput' && x.label); if (c.length) { cameras = c; fillSourceMenus(); } }).catch(() => {});
} else NOTE('Questo browser non può usare le webcam. Apri il programma con Chrome o Edge.', true);
