// Messa in sella: due camere, registrazione dei giri di pedale, referto con regolazioni consigliate.
import { createPose } from './engine.js';
import { BikeAnalyzer, CATEGORIES, MEASURES, SIDE_KEYS, FRONT_KEYS, LIMITS, findings, sideFigure, frontFigure, findingsList, targetOf, stateOf } from './bici-fit.js';
import { simulate } from './bici-sim.js';
import { saveSession, getSession, allSessions, deleteSession } from './bici-store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (t) => new Date(t).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });
const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* non salvato */ } } };
const isPhone = !!window.LAB?.isPhone;
const VIEWS = ['side', 'front'];
const MM_KEYS = ['kops', 'hipRock', 'kneeTravel_L', 'kneeTravel_R', 'kneeOff_L', 'kneeOff_R'];

$('category').innerHTML = Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join('');
$('category').value = ls.get('bk_category', 'strada');
$('crank').value = ls.get('bk_crank', '172.5');
$('category').onchange = () => { ls.set('bk_category', $('category').value); for (const v of VIEWS) renderLive(bays[v]); };
$('crank').onchange = () => { ls.set('bk_crank', $('crank').value); for (const v of VIEWS) bays[v].an && (bays[v].an.crank = crank()); };
const crank = () => { const v = parseFloat($('crank').value); return Number.isFinite(v) && v > 100 && v < 220 ? v : 172.5; };
const viewOf = (k) => (k === 'side' ? 'side' : $('frontView').value);

/* ---------- conto alla rovescia ---------- */
let countdown = ls.get('bk_cd', '3');
const setCd = (v) => { countdown = String(v); ls.set('bk_cd', countdown); document.querySelectorAll('[data-cd]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cd === countdown))); };
document.querySelectorAll('[data-cd]').forEach((b) => { b.onclick = () => setCd(b.dataset.cd); }); setCd(countdown);

/* ---------- postazioni ---------- */
const bays = {};
for (const k of VIEWS) {
  bays[k] = { k, video: $(`vid_${k}`), canvas: $(`cv_${k}`), kind: 'none', loop: 0, an: null, trail: [] };
  $(`mir_${k}`).onchange = (e) => { bays[k].mirror = e.target.checked; };
  $(`src_${k}`).onchange = (e) => chooseSource(bays[k], e.target.value);
  $(`file_${k}`).onchange = (e) => { const f = e.target.files[0]; if (f) useFile(bays[k], f); e.target.value = ''; };
}
$('frontView').onchange = () => { const b = bays.front; if (b.kind !== 'none') newAnalyzer(b, false); };
function newAnalyzer(b, recording) {
  const aspect = b.kind === 'demo' ? 16 / 9 : (b.video.videoWidth && b.video.videoHeight ? b.video.videoWidth / b.video.videoHeight : 16 / 9);
  b.an = new BikeAnalyzer({ view: viewOf(b.k), aspect, crank: crank(), recording });
  b.an.onCycle = () => renderLive(b);
  b.trail = [];
}
async function fillSources() {
  let cams = [];
  try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch { /* nessun elenco */ }
  for (const k of VIEWS) {
    const sel = $(`src_${k}`), cur = sel.value;
    sel.innerHTML = `<option value="">Nessuna</option>${cams.map((c, i) => `<option value="cam:${c.deviceId}">${esc(c.label || `Camera ${i + 1}`)}</option>`).join('')}<option value="file">File video…</option><option value="demo">Ciclista simulato</option>`;
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }
}
function stopSource(b) {
  b.loop++; cancelAnimationFrame(b.raf);
  b.stream?.getTracks().forEach((t) => t.stop()); b.stream = null;
  b.video.pause(); b.video.srcObject = null; b.video.onended = null;
  if (b.url) { URL.revokeObjectURL(b.url); b.url = null; b.video.removeAttribute('src'); b.video.load(); }
  b.kind = 'none'; b.an = null; b.file = null;
  b.canvas.getContext('2d').clearRect(0, 0, b.canvas.width, b.canvas.height);
  $(`ph_${b.k}`).hidden = false; $(`state_${b.k}`).textContent = b.k === 'side' ? 'Nessuna sorgente' : 'Facoltativa';
  $(`live_${b.k}`).innerHTML = '';
  refreshGo();
}
async function chooseSource(b, v) {
  if (v === 'file') { $(`file_${b.k}`).click(); $(`src_${b.k}`).value = b.kind === 'file' ? 'file' : ''; return; }
  stopSource(b);
  if (!v) return;
  if (v === 'demo') return useDemo(b);
  if (v.startsWith('cam:')) return useCamera(b, v.slice(4));
}
async function ensurePose(b) {
  if (b.pose) return true;
  msg('Preparo il riconoscimento: la prima volta può richiedere fino a 20 secondi.');
  try { b.pose = await createPose(isPhone ? 'lite' : 'full'); msg(''); return true; }
  catch (e) { console.error(e); msg('Riconoscimento non caricato. Controlla la connessione a Internet e riprova.', true); return false; }
}
async function useCamera(b, deviceId) {
  try {
    b.stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } }, audio: false });
  } catch (e) { msg(`Camera non disponibile: ${e.message}`, true); $(`src_${b.k}`).value = ''; return; }
  b.video.srcObject = b.stream; await b.video.play().catch(() => {});
  b.kind = 'camera'; await afterSource(b); fillSources();
}
async function useFile(b, file) {
  stopSource(b);
  b.file = file; b.url = URL.createObjectURL(file); b.video.src = b.url; b.video.loop = false;
  await new Promise((r) => { b.video.onloadeddata = r; });
  b.kind = 'file'; $(`src_${b.k}`).value = 'file';
  b.video.onended = () => { if (recording) stopRecording(); };
  await afterSource(b);
  msg('Video caricato: premi “Avvia la registrazione” per analizzarlo dall’inizio.');
}
function useDemo(b) {
  b.kind = 'demo'; b.canvas.width = 1280; b.canvas.height = 720;
  $(`ph_${b.k}`).hidden = true; newAnalyzer(b, false);
  const start = performance.now(), id = ++b.loop;
  const tick = (now) => {
    if (id !== b.loop) return;
    const t = now - start, raw = simulate(viewOf(b.k), t, window.__bikeParams ?? {}, 16 / 9);
    const c = b.canvas.getContext('2d'); c.fillStyle = '#0d1b2b'; c.fillRect(0, 0, 1280, 720);
    process(b, raw, t);
    b.raf = requestAnimationFrame(tick);
  };
  b.raf = requestAnimationFrame(tick);
  $(`state_${b.k}`).textContent = 'Simulazione'; refreshGo();
}
async function afterSource(b) {
  if (!(await ensurePose(b))) return;
  const v = b.video; b.canvas.width = v.videoWidth || 1280; b.canvas.height = v.videoHeight || 720;
  $(`ph_${b.k}`).hidden = true; newAnalyzer(b, false);
  const off = document.createElement('canvas'), id = ++b.loop;
  const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)); off.width = Math.round(v.videoWidth * scale); off.height = Math.round(v.videoHeight * scale);
  let last = 0;
  const cb = (now, meta) => {
    if (id !== b.loop) return;
    const c = b.canvas.getContext('2d');
    if (b.mirror) { c.save(); c.translate(b.canvas.width, 0); c.scale(-1, 1); c.drawImage(v, 0, 0, b.canvas.width, b.canvas.height); c.restore(); } else c.drawImage(v, 0, 0, b.canvas.width, b.canvas.height);
    const oc = off.getContext('2d');
    if (b.mirror) { oc.save(); oc.translate(off.width, 0); oc.scale(-1, 1); oc.drawImage(v, 0, 0, off.width, off.height); oc.restore(); } else oc.drawImage(v, 0, 0, off.width, off.height);
    const t = b.kind === 'file' ? meta.mediaTime * 1000 : now;
    let raw = null; const ts = Math.max(last + 1, Math.round(now)); last = ts;
    try { raw = b.pose.detect(off, ts); } catch (e) { console.error(e); }
    process(b, raw, t);
    v.requestVideoFrameCallback(cb);
  };
  v.requestVideoFrameCallback(cb);
  $(`state_${b.k}`).textContent = b.kind === 'file' ? 'File video' : 'Camera';
  refreshGo();
}

/* ---------- elaborazione e disegno ---------- */
const BONES = (s) => { const o = s === 'L' ? 0 : 1; return [[11 + o, 13 + o], [13 + o, 15 + o], [11 + o, 23 + o], [23 + o, 25 + o], [25 + o, 27 + o], [27 + o, 31 + o], [27 + o, 29 + o], [29 + o, 31 + o]]; };
const PARTS = (s) => { const o = s === 'L' ? 0 : 1; return { knee: [[23 + o, 25 + o], [25 + o, 27 + o]], trunk: [[11 + o, 23 + o]], arm: [[11 + o, 13 + o], [13 + o, 15 + o]] }; };
function process(b, raw, t) {
  if (!b.an) return;
  const f = b.an.push(raw, t);
  if (recording && recStart == null) return;
  if (f) draw(b, f);
  if (now() - (b.lastUi ?? 0) > 400) { b.lastUi = now(); state(b); }
}
const now = () => performance.now();
function state(b) {
  const a = b.an, q = a.qualityNow;
  $(`state_${b.k}`).textContent = `${b.kind === 'demo' ? 'Simulazione, ' : ''}${Math.round(a.fps)} fps, corpo ${Math.round(q * 100)}%, ${a.cycles.length} giri${recording ? ' registrati' : ''}`;
  $(`state_${b.k}`).classList.toggle('warn', a.total > 30 && q < 0.6);
}
function draw(b, f) {
  const c = b.canvas.getContext('2d'), W = b.canvas.width, H = b.canvas.height, asp = b.an.aspect, s = Math.min(W, H) / 720;
  const M = (p) => ({ x: (p.x / asp) * W, y: p.y * H });
  const line = (segs, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); for (const [a, bb] of segs) { if (f.P[a].v < 0.3 || f.P[bb].v < 0.3) continue; const A = M(f.P[a]), B = M(f.P[bb]); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); } c.stroke(); };
  if (b.k === 'side') {
    const near = f.near, far = near === 'L' ? 'R' : 'L';
    b.trail.push({ ...f.spindle, t: f.t }); while (b.trail.length && b.trail[0].t < f.t - 1500) b.trail.shift();
    c.strokeStyle = 'rgba(255,225,77,.85)'; c.lineWidth = 3 * s; c.beginPath(); b.trail.forEach((p, i) => { const q = M(p); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); c.stroke();
    line(BONES(far), 'rgba(223,233,241,.35)', 3 * s); line(BONES(near), '#ffffff', 4 * s);
    const live = b.an.live(), cat = $('category').value, red = [];
    if (live) {
      const P = PARTS(near);
      if (stateOf('kneeExt', live.kneeExt, cat) !== 'ok') red.push(...P.knee);
      if (stateOf('trunk', live.trunk, cat) !== 'ok') red.push(...P.trunk);
      if (stateOf('shoulder', live.shoulder, cat) !== 'ok' || stateOf('elbow', live.elbow, cat) !== 'ok') red.push(...P.arm);
    }
    if (red.length) { line(red, 'rgba(0,0,0,.55)', 14 * s); line(red, '#ff2d4a', 8 * s); }
    const v = f.values, o = near === 'L' ? 0 : 1;
    const tag = (i, txt) => { const q = M(f.P[i]); c.font = `700 ${Math.round(24 * s)}px Bahnschrift, Barlow, Segoe UI, sans-serif`; const w = c.measureText(txt).width; c.fillStyle = 'rgba(13,27,43,.8)'; c.fillRect(q.x + 12 * s, q.y - 14 * s, w + 10 * s, 28 * s); c.fillStyle = '#ffe14d'; c.fillText(txt, q.x + 17 * s, q.y + 8 * s); };
    if (v.knee != null) tag(25 + o, `${fmt(v.knee)}°`);
    if (v.hip != null) tag(23 + o, `${fmt(v.hip)}°`);
    if (v.elbow != null) tag(13 + o, `${fmt(v.elbow)}°`);
  } else {
    line([[11, 12], [23, 24], [11, 23], [12, 24]], '#ffffff', 3 * s);
    line(BONES('L'), '#79b2f3', 4 * s); line(BONES('R'), '#f09468', 4 * s);
    const live = b.an.live();
    if (live) for (const sd of ['L', 'R']) if ((live[`kneeTravel_${sd}`] ?? 0) > LIMITS.kneeTravel) { const p = PARTS(sd).knee; line(p, 'rgba(0,0,0,.55)', 14 * s); line(p, '#ff2d4a', 8 * s); }
  }
}
// Valori dell'ultimo giro, con il riferimento per il tipo di bici.
function renderLive(b) {
  const box = $(`live_${b.k}`); if (!b?.an || !box) return;
  const live = b.an.live(), cat = $('category').value, keys = b.k === 'side' ? SIDE_KEYS : FRONT_KEYS;
  box.innerHTML = keys.map((k) => {
    const m = MEASURES[k], v = live?.[k], t = targetOf(k, cat), st = stateOf(k, v, cat);
    return `<div class="row${st === 'low' || st === 'high' ? ' off' : ''}"><span>${esc(m.label)}${t ? ` <small>rif. ${t[0]}-${t[1]}</small>` : ''}</span><b>${fmt(v, m.d)} <small>${m.unit}</small></b></div>`;
  }).join('');
}

/* ---------- registrazione ---------- */
let recording = false, recStart = null, recTimer = 0, cdTimer = 0, simulated = false;
function refreshGo() {
  $('go').disabled = bays.side.kind === 'none';
  $('go').textContent = recording ? 'Ferma e analizza' : 'Avvia la registrazione';
  $('demo').textContent = bays.side.kind === 'demo' ? 'Ferma la simulazione' : 'Prova con un ciclista simulato';
}
function msg(t, warn = false) { $('msg').textContent = t; $('msg').classList.toggle('warn', warn); }
$('demo').onclick = () => {
  if (bays.side.kind === 'demo') { for (const k of VIEWS) { stopSource(bays[k]); $(`src_${k}`).value = ''; } }
  else for (const k of VIEWS) { stopSource(bays[k]); $(`src_${k}`).value = 'demo'; useDemo(bays[k]); }
  refreshGo();
};
$('go').onclick = () => { if (recording) stopRecording(); else startRecording(); };
function startRecording() {
  const live = VIEWS.map((k) => bays[k]).filter((b) => b.kind !== 'none');
  recording = true; recStart = null; refreshGo();
  let n = Number(countdown);
  const begin = () => {
    clearInterval(cdTimer); msg('Registrazione in corso: pedala alla cadenza abituale.');
    for (const b of live) {
      newAnalyzer(b, true);
      if (b.kind === 'file') { b.video.currentTime = 0; b.video.play(); }
    }
    simulated = live.some((b) => b.kind === 'demo');
    recStart = now();
    const dur = Number($('duration').value) * 1000;
    recTimer = setInterval(() => { const left = Math.max(0, dur - (now() - recStart)); msg(`Registrazione: ${Math.ceil(left / 1000)} s`); if (left <= 0) stopRecording(); }, 250);
  };
  if (n > 0 && !live.every((b) => b.kind === 'file')) { msg(`Si parte tra ${n}…`); cdTimer = setInterval(() => { n--; if (n <= 0) begin(); else msg(`Si parte tra ${n}…`); }, 1000); }
  else begin();
}
async function stopRecording() {
  clearInterval(recTimer); clearInterval(cdTimer);
  if (!recording) return;
  recording = false; const started = recStart != null; recStart = null; refreshGo();
  if (!started) { msg(''); return; }
  const views = {};
  for (const k of VIEWS) {
    const b = bays[k]; if (b.kind === 'none' || !b.an) continue;
    if (b.kind === 'file') b.video.pause();
    const s = b.an.summary(); newAnalyzer(b, false);
    if (s.cycles >= 3) views[k] = s;
  }
  if (!views.side) { msg('Analisi non salvata: servono almeno 3 giri di pedale riconosciuti nella vista laterale. Controlla inquadratura e luce.', true); return; }
  const c = window.LAB?.client?.() ?? {};
  const doc = {
    id: Date.now(), kind: 'bici', createdAt: Date.now(), person: $('person').value.trim(), birth: $('birth').value || c.birth || '', height: $('height').value || c.height || '',
    bike: $('bike').value.trim(), category: $('category').value, crank: crank(), note: $('note').value.trim(), simulated, views,
  };
  await saveSession(doc);
  msg(''); $('note').value = '';
  location.hash = `#report/${doc.id}`;
}

/* ---------- referto ---------- */
const MARK = { low: '▼ sotto', high: '▲ sopra', ok: '✓', none: '' };
function table(doc, keys, values, spread) {
  const rows = keys.filter((k) => values[k] != null).map((k) => {
    const m = MEASURES[k], v = values[k], t = targetOf(k, doc.category), st = stateOf(k, v, doc.category), sp = spread?.[k];
    return `<tr class="${st === 'low' || st === 'high' ? 'flag' : ''}"><th scope="row">${esc(m.label)}${m.hint ? `<br><small>${esc(m.hint)}</small>` : ''}</th><td class="n">${fmt(v, m.d)} ${m.unit}${sp && fmt(sp[0], m.d) !== fmt(sp[1], m.d) ? `<br><small>da ${fmt(sp[0], m.d)} a ${fmt(sp[1], m.d)}</small>` : ''}</td><td class="n">${t ? `${t[0]} – ${t[1]} ${m.unit}` : '–'}</td><td class="st">${MARK[st]}</td></tr>`;
  }).join('');
  return `<table class="metrics bk-table"><thead><tr><th>Misura</th><th class="n">Valore</th><th class="n">Riferimento</th><th>Esito</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function renderReport(id) {
  const doc = await getSession(id), root = $('report');
  if (!doc) { root.innerHTML = '<p class="empty">Analisi non trovata.</p>'; return; }
  const fs = findings(doc), S = doc.views.side, F = doc.views.front;
  const sideFs = fs.filter((f) => !f.side && !['kneeAsym', 'pelvis'].includes(f.key));
  root.innerHTML = `<article class="report">
    <header class="rep-head"><div><div class="studio-line">${esc(window.LAB?.studio?.() ?? '')}</div><h1>${esc(doc.person || 'Messa in sella')}</h1>
      <p>${fmtDate(doc.createdAt)}${doc.bike ? ` · ${esc(doc.bike)}` : ''}</p></div>
      <div class="rep-actions no-print"><a class="btn" href="#archivio">Archivio</a><button id="print" class="primary">Stampa o salva PDF</button></div></header>
    ${doc.simulated ? '<p class="sim-banner">Analisi simulata: i dati vengono da un ciclista virtuale, non da una persona.</p>' : ''}
    <div class="bk-meta no-print"><label>Tipo di bici <select id="r_cat">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}"${k === doc.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Pedivella mm <input id="r_crank" type="number" step="0.5" value="${doc.crank}"></label>
      <label class="grow">Note <input id="r_note" value="${esc(doc.note ?? '')}"></label></div>
    <p class="print-only">Tipo di bici: ${esc(CATEGORIES[doc.category]?.name ?? '')} · Pedivella ${fmt(doc.crank, 1)} mm${doc.note ? ` · ${esc(doc.note)}` : ''}</p>
    <section class="mf"><h2>Cosa cambiare</h2>${findingsList(fs)}
      ${fs.length ? '<p class="fine">Fai una modifica alla volta, poi pedala qualche minuto e registra di nuovo per controllare.</p>' : ''}</section>
    <section class="bk-sec"><h2>Vista laterale <span class="u">${S.cycles} giri, cadenza ${fmt(S.values.cadence)} giri/min</span></h2>
      <div class="mf-grid"><figure class="mf-fig">${sideFigure(doc, sideFs)}<figcaption>Posizione al punto più basso del pedale, giro tipico. Gli angoli sono quelli misurati.</figcaption></figure>
      <div>${table(doc, SIDE_KEYS.filter((k) => k !== 'cadence'), S.values, S.spread)}</div></div></section>
    ${F ? `<section class="bk-sec"><h2>Vista ${F.view === 'rear' ? 'posteriore' : 'frontale'} <span class="u">${F.cycles} giri</span></h2>
      <div class="mf-grid"><figure class="mf-fig">${frontFigure(doc, fs)}<figcaption>Percorso di ciascun ginocchio in un giro, visto ${F.view === 'rear' ? 'da dietro' : 'da davanti'}. Tratteggio: verticale media del ginocchio. Un percorso stretto e dritto è il più efficiente.</figcaption></figure>
      <div>${table(doc, FRONT_KEYS.filter((k) => k !== 'cadence'), F.values, F.spread)}</div></div></section>` : ''}
    <section class="bk-sec"><h2>Come leggere</h2><p class="fine">I valori sono la mediana dei giri registrati; sotto è indicato l’intervallo in cui cade la metà centrale dei giri. Gli angoli si misurano sull’immagine e i millimetri sono stime basate sulla pedivella indicata. I riferimenti sono quelli usati comunemente nella messa in sella dinamica e cambiano con il tipo di bici: sono un punto di partenza, non una regola, e vanno adattati a fastidi, flessibilità e obiettivi della persona.</p></section>
  </article>`;
  $('print').onclick = () => print();
  const save = async (fn) => { fn(); await saveSession(doc); renderReport(doc.id); };
  $('r_cat').onchange = (e) => save(() => { doc.category = e.target.value; });
  $('r_note').onchange = (e) => save(() => { doc.note = e.target.value; });
  // I millimetri dipendono dalla pedivella: cambiandola si riscalano.
  $('r_crank').onchange = (e) => save(() => {
    const v = parseFloat(e.target.value); if (!(v > 100 && v < 220)) return;
    const r = v / doc.crank; doc.crank = v;
    for (const view of Object.values(doc.views)) {
      for (const k of MM_KEYS) if (view.values[k] != null) view.values[k] *= r;
      for (const k of MM_KEYS) if (view.spread?.[k]) view.spread[k] = view.spread[k].map((x) => x * r);
      if (view.saddleFor) for (const f of Object.keys(view.saddleFor)) view.saddleFor[f] *= r;
    }
  });
}
async function renderArchive() {
  const list = await allSessions(), root = $('archivio');
  root.innerHTML = `<h1>Archivio della messa in sella</h1>${list.length ? `<div class="tablewrap"><table class="metrics"><thead><tr><th>Persona</th><th>Data</th><th>Bici</th><th>Tipo</th><th></th></tr></thead><tbody>
    ${list.map((d) => `<tr><th scope="row"><a href="#report/${d.id}">${esc(d.person || 'Senza nome')}</a>${d.simulated ? ' <small>(simulata)</small>' : ''}</th><td>${fmtDate(d.createdAt)}</td><td>${esc(d.bike)}</td><td>${esc(CATEGORIES[d.category]?.name ?? '')}</td><td><button class="quiet" data-del="${d.id}">Elimina</button></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">Nessuna analisi salvata.</p>'}<p class="fine">Le analisi restano solo in questo browser. Per una copia usa “Esporta tutto” nella pagina iniziale di Movement Lab.</p>`;
  root.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Eliminare questa analisi?')) return; await deleteSession(b.dataset.del); renderArchive(); }; });
}

/* ---------- navigazione ---------- */
async function route() {
  const [page, a] = (location.hash.slice(1) || 'home').split('/');
  for (const id of ['home', 'report', 'archivio', 'guida']) $(id).hidden = id !== page;
  document.querySelectorAll('.subnav a').forEach((x) => x.toggleAttribute('aria-current', x.getAttribute('href') === `#${page}`));
  if (page === 'report') await renderReport(a);
  if (page === 'archivio') await renderArchive();
  if (!['home', 'report', 'archivio', 'guida'].includes(page)) location.hash = '#home';
}
addEventListener('hashchange', route);
window.LAB?.attach?.({ name: 'person', birth: 'birth', height: 'height', datalist: 'people', busy: () => recording });
await fillSources();
navigator.mediaDevices?.addEventListener?.('devicechange', fillSources);
refreshGo();
route();
