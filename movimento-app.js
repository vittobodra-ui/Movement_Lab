import { PROTOCOLS, protocolById, customProtocol, NAMES, VIEW_NAMES, defaultView, viewList } from './movimento-measure.js';
import { reanalyzePack } from './movimento-analysis.js';
import { setErrorsHtml } from './movimento-errori.js';
import { Station } from './movimento-station.js';
import { nearestPoint } from './movimento-overlay.js';
import { Review } from './movimento-review.js';
import { renderReport, renderArchive, repsTable, bindCharts, download, it, setName, fmtDate } from './movimento-report.js';
import { saveSession, getSession, allSessions, putMedia, getMedia, deleteMedia, packFrames } from './movimento-store.js';
import { movimentoLive, movimentoSetFlags, flagLine, mark, sideWord } from './asym.js';

const PLATFORM = document.body.dataset.platform;
const isPhone = PLATFORM === 'mobile';
const $ = (id) => document.getElementById(id);
const NOTE = (m, err = false) => { const s = $('status'); s.textContent = m; s.classList.toggle('err', err); };
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* preferenza non salvata */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- impostazioni ---------- */
const DEFAULTS = { model: isPhone ? 'lite' : 'full', countdown: isPhone ? '5' : '3', duration: '0', rate: '1', record: true, keepVideo: true, sound: true, voice: false, trail: true, labels: false };
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(ls.get('am_settings', '{}')) }; } catch { /* valori predefiniti */ }
if (!['0', '3', '5'].includes(String(settings.countdown))) settings.countdown = '5';
$('s_model').innerHTML = isPhone
  ? '<option value="lite">Veloce</option><option value="full">Preciso, scalda di più</option>'
  : '<option value="lite">Veloce</option><option value="full">Preciso</option><option value="heavy">Massimo, solo con scheda grafica potente</option>';
for (const k of Object.keys(DEFAULTS)) {
  const el = $(`s_${k}`);
  if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k];
  el.addEventListener('change', () => { settings[k] = el.type === 'checkbox' ? el.checked : el.value; ls.set('am_settings', JSON.stringify(settings)); });
}
const getSettings = () => settings;
function setCountdown(v) {
  settings.countdown = String(v); ls.set('am_settings', JSON.stringify(settings));
  $('s_countdown').value = settings.countdown;
  document.querySelectorAll('[data-cd]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cd === settings.countdown)));
}
document.querySelectorAll('[data-cd]').forEach((b) => { b.onclick = () => setCountdown(b.dataset.cd); });
$('s_countdown').addEventListener('change', () => setCountdown($('s_countdown').value));
setCountdown(settings.countdown);

/* ---------- sessione ---------- */
let session = null;
const newSession = () => ({ id: Date.now(), createdAt: Date.now(), person: $('person').value.trim(), notes: $('notes').value.trim(), draft: true, sets: [] });
function renderHome() {
  $('ex-squat').innerHTML = PROTOCOLS.filter((p) => p.group === 'squat').map(row).join('');
  $('ex-arm').innerHTML = PROTOCOLS.filter((p) => p.group === 'arm').map(row).join('');
  $('ex-lift').innerHTML = PROTOCOLS.filter((p) => p.group === 'lift').map(row).join('');
  const box = $('doneSets'), sets = session?.sets ?? [];
  box.innerHTML = sets.length ? `<ul>${sets.map((s) => `<li><a href="#result/${session.id}/${s.id}">${esc(setName(s))}</a></li>`).join('')}</ul>
    <button id="toReport" class="primary">Crea il referto</button> <button id="newSess" class="quiet">Inizia una nuova sessione</button>` : '';
  if (sets.length) {
    $('toReport').onclick = async () => { const id = session.id; syncForm(); session.draft = false; await saveSession(session); session = null; window.LAB.fillFromClient(); $('notes').value = ''; location.hash = `#report/${id}`; };
    $('newSess').onclick = async (e) => {
      if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Conferma: la sessione attuale resta in archivio'; return; }
      session.draft = false; await saveSession(session); session = null; window.LAB.fillFromClient(); $('notes').value = ''; renderHome();
    };
  }
}
const row = (p) => `<li><a href="#capture/${p.id}"><b>${esc(p.name)}</b><span>${esc(p.hint)}</span></a></li>`;
function syncForm() { if (session) { session.person = $('person').value.trim(); session.notes = $('notes').value.trim(); } }
for (const id of ['person', 'notes']) $(id).addEventListener('change', () => { if (session) { syncForm(); saveSession(session).catch(() => {}); } });
const fillPeople = () => window.LAB.refreshPeople();

/* ---------- ripresa ---------- */
let protocol = null, bays = [], counting = null, audio = null, wakeLock = null, levelOn = false, durTimer = null, customPick = null;
function bayMarkup(k) {
  return `<div class="bay" data-k="${k}">
    <div class="stage"><video id="v${k}" muted playsinline></video><canvas id="c${k}"></canvas>
      <div class="hint" id="hint${k}" role="status"></div><div class="count" id="count${k}" hidden></div><div class="clock" id="clock${k}" hidden></div>
      <div class="${isPhone ? 'level' : 'fpsTag'}" id="tag${k}"></div></div>
    <div class="live">
      <div class="herolabel" id="hl${k}"></div>
      <div class="hero"><div class="main" id="hero${k}">–</div><div class="rep"><b id="reps${k}">0</b><span>ripetizioni</span></div></div>
      <div class="lastrep" id="last${k}"></div>
      <div class="asym-live" id="asym${k}"></div>
      <canvas class="strip" id="strip${k}"></canvas>
      <div class="rows" id="rows${k}"></div>
    </div>
    <div class="bay-tools">
      <label class="wview">Ripresa da <select id="view${k}"></select></label>
      <label class="wside" id="sideL${k}"><span id="sideT${k}">Lato</span> <select id="side${k}"></select></label>
      <label class="wsrc">Camera <select id="src${k}"></select></label>
      <label class="btn">File video<input id="file${k}" type="file" accept="video/*" hidden></label>
      <label class="wnum" id="loadL${k}">Carico kg <input id="load${k}" type="number" step="0.5" inputmode="decimal"></label>
      <details class="more"><summary>Altre opzioni</summary><div class="more-row">
        <label class="wnum">Obiettivo ° <input id="goal${k}" type="number" inputmode="numeric"></label>
        <label class="check"><input type="checkbox" id="mir${k}"> Specchia</label>
        <button id="demo${k}" aria-pressed="false">Simula</button>
      </div></details>
    </div>
  </div>`;
}
function setHint(k, msg, warn = false, keepMs = 0) {
  const h = $(`hint${k}`); if (!h) return;
  h.textContent = msg; h.classList.toggle('warn', warn);
  if (bays[k]) bays[k].hintUntil = keepMs ? performance.now() + keepMs : 0;
}
function fillExSel() {
  const g = (grp, label) => `<optgroup label="${label}">${PROTOCOLS.filter((p) => p.group === grp).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`;
  $('exSel').innerHTML = `${g('squat', 'Accosciate e arto inferiore')}${g('lift', 'Stacco, panca e trazioni')}${g('arm', 'Arti superiori')}<optgroup label="Altro"><option value="custom">Angolo personalizzato</option></optgroup>`;
  $('exSel').value = protocol.custom ? 'custom' : protocol.id;
  $('capName').hidden = !protocol.custom;
}
// Cambio di esercizio senza chiudere le camere: si riconfigura solo l'analisi.
async function switchProtocol(id) {
  if (id === 'custom' || protocol?.custom) { location.hash = `#capture/${id}`; return; }
  const p = protocolById(id); if (!p) return;
  protocol = p; customPick = null;
  const views = viewList(p);
  for (const b of bays) if (b) {
    b.view = b.k === 0 ? defaultView(p) : (views.find((v) => v !== bays[0].view) ?? views[0]);
    b.st.configure(protocol, b.view, 'auto');
    if (b.st.kind === 'demo') b.st.useDemo(isPhone ? 9 / 16 : 16 / 9);
    b.traceA = []; b.traceB = [];
    buildSegments(b); renderRows(b);
    const goal = ls.get(`am_goal_${protocol.id}`, ''); $(`goal${b.k}`).value = goal; b.st.goal = goal === '' ? null : parseFloat(goal);
    $(`loadL${b.k}`).hidden = !protocol.load;
  }
  fillExSel();
  history.replaceState(null, '', `#capture/${id}`);
  refreshGo();
}
$('exSel').onchange = (e) => switchProtocol(e.target.value);
let redo = null;
async function openCapture(pid, viewArg, redoArg) {
  closeCapture();
  const spec = pid === 'custom' ? null : protocolById(pid);
  if (pid !== 'custom' && !spec) { location.hash = '#home'; return; }
  protocol = spec ?? customProtocol(23, 25, 27, null);
  customPick = pid === 'custom' ? { a: [], mode: 'tre', done: false } : null;
  redo = null;
  if (redoArg?.startsWith('redo:')) { const [, sid, setId] = redoArg.split(':'); redo = { sid: Number(sid), setId: Number(setId) }; }
  $('capture').hidden = false;
  $('capture').classList.remove('tools-open');
  $('capName').textContent = protocol.name;
  fillExSel();
  $('bays').className = 'bays one';
  $('bays').innerHTML = bayMarkup(0);
  $('addCam').hidden = isPhone; $('addCam').textContent = 'Aggiungi seconda camera';
  $('go').disabled = true; $('go').textContent = 'Avvia la serie'; $('go').className = 'go';
  $('metro').hidden = !isPhone;
  bays = [];
  await initBay(0, protocol.views[viewArg] ? viewArg : defaultView(protocol), !redo);
  if (redo) await loadRedo(bays[0]);
  acquireWakeLock();
  if (isPhone) startLevel();
}
async function initBay(k, view, startCam = true) {
  const b = { k, view, state: 'idle', traceA: [], traceB: [], lastUi: 0, hintUntil: 0 };
  bays[k] = b;
  b.st = new Station({
    canvas: $(`c${k}`), video: $(`v${k}`), settings: getSettings,
    onFrame: (f, a) => onFrame(b, f, a),
    onRep: (r, a) => onRep(b, r, a),
    onMessage: (m, err, keep) => setHint(k, m, !!err, keep ? 30000 : (m ? 8000 : 0)),
    onEnded: () => { if (bays.every((x) => !x || x.st.kind !== 'camera')) finishSet(); },
  });
  b.st.configure(protocol, view, 'auto');
  buildSegments(b);
  const goal = ls.get(`am_goal_${protocol.id}`, '');
  $(`goal${k}`).value = goal; b.st.goal = goal === '' ? null : parseFloat(goal);
  $(`goal${k}`).onchange = (e) => { const v = e.target.value; ls.set(`am_goal_${protocol.id}`, v); b.st.goal = v === '' ? null : parseFloat(v); };
  $(`loadL${k}`).hidden = !protocol.load;
  $(`side${k}`).onchange = (e) => { b.st.sideMode = e.target.value; b.st.newAnalyzer(false); };
  $(`view${k}`).onchange = (e) => setView(b, e.target.value);
  $(`mir${k}`).onchange = (e) => { b.st.mirror = e.target.checked; };
  $(`file${k}`).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; setDemoPressed(k, false); await b.st.useFile(f); refreshGo(); e.target.value = ''; $(`src${k}`).value = 'file'; };
  $(`demo${k}`).onclick = () => toggleDemo(b);
  $(`src${k}`).onchange = (e) => chooseSource(b, e.target.value);
  $(`c${k}`).addEventListener('pointerdown', (e) => onStageTap(b, e));
  renderRows(b);
  await fillSources(k);
  if (startCam) await startDefaultSource(b);
}
// Il video di una serie salvata torna nella postazione: la nuova analisi sostituirà quella vecchia.
async function loadRedo(b) {
  const s = await getSession(redo.sid).catch(() => null), set = s?.sets?.find((x) => x.id === redo.setId);
  let media = set ? await getMedia(set.id).catch(() => null) : null;
  if (media && !media.blob && lastBlobs.has(set.id)) media = { ...media, ...lastBlobs.get(set.id) };
  if (!set || !media?.blob) { redo = null; setHint(b.k, 'Il video di questa serie non è in archivio: non si può rianalizzare.', true, 10000); await startDefaultSource(b); return; }
  redo.set = set;
  const ext = (media.mime ?? media.blob.type ?? '').includes('mp4') ? 'mp4' : 'webm';
  const file = media.blob instanceof File ? media.blob : new File([media.blob], `serie.${ext}`, { type: media.blob.type || media.mime || 'video/webm' });
  b.st.mirror = !!media.mirror; $(`mir${b.k}`).checked = b.st.mirror;
  if (set.sideMode && $(`side${b.k}`).querySelector(`option[value="${set.sideMode}"]`)) { $(`side${b.k}`).value = set.sideMode; b.st.sideMode = set.sideMode; }
  if (set.load) $(`load${b.k}`).value = set.load;
  await b.st.useFile(file); $(`src${b.k}`).value = 'file';
  $('go').textContent = 'Rianalizza il video';
  setHint(b.k, 'Video della serie caricato. Controlla esercizio, ripresa e lato, poi premi “Rianalizza il video”: il risultato sostituirà quello salvato.', false, 60000);
  refreshGo();
}
// Menu della vista e del lato: il lato serve solo di lato o con una gamba sola.
function buildSegments(b) {
  const k = b.k, sel = $(`view${k}`);
  sel.innerHTML = viewList(protocol).map((v) => `<option value="${v}">${protocol.viewLabels?.[v] ?? `${VIEW_NAMES[v]}${v === 'rear' ? ', da dietro' : v === 'front' ? ', da davanti' : ', di fianco'}`}</option>`).join('');
  sel.value = b.view;
  buildSideSel(b);
  updateFootButtons();
}
function buildSideSel(b) {
  const k = b.k, spec = protocol.views[b.view], wrap = $(`sideL${k}`), sel = $(`side${k}`), prev = sel.value;
  const uni = b.view !== 'side' && !!spec.legPick;
  wrap.hidden = !(b.view === 'side' || uni);
  $(`sideT${k}`).textContent = b.view === 'side' ? (protocol.group === 'arm' ? 'Braccio misurato' : 'Lato verso la camera') : 'Gamba di lavoro';
  if (protocol.family === 'slrdl' && b.view === 'side') $(`sideT${k}`).textContent = 'Gamba d’appoggio';
  const f = b.view === 'side' ? ['Automatico', 'Sinistro', 'Destro'] : ['Automatica', 'Sinistra', 'Destra'];
  sel.innerHTML = `<option value="auto">${f[0]}</option><option value="L">${f[1]}</option><option value="R">${f[2]}</option>`;
  sel.value = wrap.hidden ? 'auto' : ['auto', 'L', 'R'].includes(prev) ? prev : 'auto';
  b.st.sideMode = sel.value;
}
function setView(b, view) {
  b.view = view;
  buildSideSel(b);
  b.st.configure(protocol, b.view, $(`side${b.k}`).value);
  if (b.st.kind === 'demo') { b.st.useDemo(isPhone ? 9 / 16 : 16 / 9); }
  b.traceA = []; b.traceB = [];
  renderRows(b); updateFootButtons();
}
function updateFootButtons() {
  const anyFront = bays.some((b) => b && b.view !== 'side' && b.st.kind !== 'file');
  $('calib').hidden = !anyFront;
}
async function fillSources(k) {
  const sel = $(`src${k}`);
  let cams = [];
  try { cams = (await navigator.mediaDevices?.enumerateDevices() ?? []).filter((d) => d.kind === 'videoinput'); } catch { /* nessun elenco */ }
  const seen = {};
  const opts = cams.map((c, i) => { const base = c.label || `Camera ${i + 1}`; seen[base] = (seen[base] ?? 0) + 1; return `<option value="cam:${esc(c.deviceId)}">${esc(base)}${seen[base] > 1 ? ` (${seen[base]})` : ''}</option>`; }).join('');
  const cur = sel.value;
  sel.innerHTML = `${opts || '<option value="">Camera</option>'}${isPhone ? '<option value="flip">Cambia camera</option>' : ''}<option value="file" hidden>File video</option>`;
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}
async function startDefaultSource(b) {
  if (!navigator.mediaDevices?.getUserMedia) { setHint(b.k, 'La camera qui non è disponibile: apri l’app da un indirizzo sicuro con Chrome o Edge.', true); refreshGo(); return; }
  const opts = [...$(`src${b.k}`).options].filter((o) => o.value.startsWith('cam:'));
  const usedIds = bays.filter((x) => x && x !== b).map((x) => x.deviceId);
  const pick = opts.find((o) => !usedIds.includes(o.value.slice(4)));
  await useCamera(b, !isPhone && pick && pick.value !== 'cam:' ? pick.value.slice(4) : null);
}
async function useCamera(b, deviceId) {
  const ok = await b.st.useCamera(deviceId, b.facing ?? 'environment');
  if (ok) {
    b.deviceId = b.st.stream?.getVideoTracks()[0]?.getSettings().deviceId;
    await fillSources(b.k);
    const opt = [...$(`src${b.k}`).options].find((o) => o.value === `cam:${b.deviceId}`);
    if (opt) $(`src${b.k}`).value = opt.value;
    if (!isPhone && !$(`mir${b.k}`).dataset.touched) { /* la vista resta com'è: gli angoli non dipendono dallo specchio */ }
  }
  refreshGo();
}
async function chooseSource(b, value) {
  setDemoPressed(b.k, false);
  if (value === 'flip') { b.facing = b.facing === 'user' ? 'environment' : 'user'; b.st.mirror = b.facing === 'user'; $(`mir${b.k}`).checked = b.st.mirror; await useCamera(b, null); return; }
  if (value.startsWith('cam:')) await useCamera(b, value.slice(4));
}
function setDemoPressed(k, on) { $(`demo${k}`).setAttribute('aria-pressed', String(on)); }
function toggleDemo(b) {
  const on = $(`demo${b.k}`).getAttribute('aria-pressed') !== 'true';
  setDemoPressed(b.k, on);
  if (on) { b.st.useDemo(isPhone ? 9 / 16 : 16 / 9); setHint(b.k, 'Simulazione: soggetto virtuale con angoli noti.', false, 5000); refreshGo(); }
  else useCamera(b, b.deviceId ?? null);
}
function refreshGo() {
  const ready = bays.some((b) => b && b.st.kind !== 'none' && (b.st.kind === 'demo' || b.st.pose));
  if (!counting && !bays.some((b) => b?.st.state === 'recording')) $('go').disabled = !ready || (customPick && !customPick.done);
  updateFootButtons();
  if (customPick && !customPick.done) setHint(0, 'Tocca tre punti di repere: il secondo è il vertice dell’angolo.', false, 60000);
}
function onStageTap(b, e) {
  if (!customPick || customPick.done || !b.st.analyzer?.last) return;
  const c = b.st.canvas, r = c.getBoundingClientRect();
  const scale = Math.min(r.width / c.width, r.height / c.height);
  const x = (e.clientX - r.left - (r.width - c.width * scale) / 2) / scale, y = (e.clientY - r.top - (r.height - c.height * scale) / 2) / scale;
  const i = nearestPoint(b.st.analyzer.last, x, y, { W: c.width, H: c.height, aspect: b.st.analyzer.aspect, mirror: b.st.mirror });
  if (i < 0 || customPick.a.includes(i)) return;
  customPick.a.push(i); b.st.picked = customPick.a;
  if (customPick.a.length === 3) {
    const [p, q, s] = customPick.a;
    protocol = { ...customProtocol(p, q, s, null), name: `Angolo ${NAMES[p]}, ${NAMES[q]}, ${NAMES[s]}` };
    customPick.done = true;
    $('capName').textContent = protocol.name;
    b.st.configure(protocol, b.view, 'auto');
    renderRows(b);
    setHint(b.k, '', false); refreshGo();
  } else setHint(b.k, `Punto ${customPick.a.length}: ${NAMES[i]}. Tocca il prossimo.`, false, 60000);
}

/* Letture in diretta */
function renderRows(b) {
  const spec = protocol.views[b.view];
  const seen = new Set(), rows = [];
  for (const m of spec.metrics) {
    if (m.id === spec.primary || m.id === spec.second) continue;
    const base = m.id.replace(/_[LR]$/, '');
    if (seen.has(base)) continue;
    seen.add(base);
    rows.push(`<div class="row"><span>${esc(m.label)}</span><b id="m${b.k}_${base}">–</b></div>`);
  }
  $(`rows${b.k}`).innerHTML = rows.join('');
  $(`hl${b.k}`).textContent = spec.metrics.find((m) => m.id === spec.primary)?.label ?? '';
  $(`hero${b.k}`).className = spec.second ? 'main two' : 'main';
  $(`reps${b.k}`).textContent = '0'; $(`last${b.k}`).textContent = ''; $(`asym${b.k}`).textContent = '';
}
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : it(v, d));
function onFrame(b, f, a) {
  const now = performance.now(), spec = a.spec;
  if (f) {
    const A = f.values[spec.primary], B = spec.second ? f.values[spec.second] : null;
    b.traceA.push([f.t, A]); if (spec.second) b.traceB.push([f.t, B]);
    while (b.traceA.length && b.traceA[0][0] < f.t - 12000) b.traceA.shift();
    while (b.traceB.length && b.traceB[0][0] < f.t - 12000) b.traceB.shift();
  }
  if (now - b.lastUi < 110) return;
  b.lastUi = now;
  const k = b.k, hero = $(`hero${k}`);
  if (f) {
    hero.innerHTML = spec.second
      ? `<div class="lv">${fmt(f.values[spec.primary])}°<small>sinistra</small></div><div class="rv">${fmt(f.values[spec.second])}°<small>destra</small></div>`
      : `${fmt(f.values[spec.primary])}°`;
    hero.classList.toggle('hit', b.st.goalHit);
    for (const m of spec.metrics) {
      if (m.id === spec.primary || m.id === spec.second) continue;
      const base = m.id.replace(/_[LR]$/, ''), el = $(`m${k}_${base}`); if (!el) continue;
      if (/_[LR]$/.test(m.id)) el.innerHTML = `<span class="lv">${fmt(f.values[`${base}_L`], m.d)}</span><span class="rv">${fmt(f.values[`${base}_R`], m.d)}</span> <small>${esc(m.unit)}</small>`;
      else el.innerHTML = `${fmt(f.values[m.id], m.d)} <small>${esc(m.unit)}</small>`;
    }
  }
  drawStrip(b, spec);
  const q = a.qualityNow, tag = $(`tag${k}`);
  if (!isPhone) tag.textContent = `${Math.round(a.fps)} fps${a.near && b.view === 'side' ? `, lato ${a.near === 'L' ? 'sinistro' : 'destro'}` : ''}`;
  if (now >= b.hintUntil) {
    if (a.total > 20 && q < 0.6) setHint(k, 'Non vedo bene il corpo: controlla inquadratura e luce.', true);
    else if (a.viewWarn) setHint(k, a.viewWarn, true);
    else if (a.fps > 0 && a.fps < 10 && a.total > 30) setHint(k, `Analisi lenta, ${Math.round(a.fps)} fps: scegli “Veloce” nelle impostazioni o usa un video già registrato.`, true);
    else setHint(k, customPick && !customPick.done ? 'Tocca tre punti di repere: il secondo è il vertice dell’angolo.' : '');
  }
}
function drawStrip(b, spec) {
  const c = $(`strip${b.k}`); if (!c || !c.clientWidth) return;
  const dpr = devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
  if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  const series = spec.second ? [[b.traceA, '#79b2f3'], [b.traceB, '#f09468']] : [[b.traceA, '#ffe14d']];
  const vals = series.flatMap(([s]) => s.map((p) => p[1]).filter((v) => v != null));
  if (vals.length < 3) return;
  const goal = b.st.goal;
  let lo = Math.min(...vals), hi = Math.max(...vals); if (goal != null) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  const pad = Math.max((hi - lo) * 0.12, 5); lo -= pad; hi += pad;
  const end = b.traceA.at(-1)?.[0] ?? 0, X = (t) => W - ((end - t) / 12000) * W, Y = (v) => H - ((v - lo) / (hi - lo)) * H;
  if (goal != null) { x.strokeStyle = '#8df0a8'; x.setLineDash([5, 5]); x.beginPath(); x.moveTo(0, Y(goal)); x.lineTo(W, Y(goal)); x.stroke(); x.setLineDash([]); }
  x.lineWidth = 2; x.lineJoin = 'round';
  for (const [s, col] of series) {
    x.strokeStyle = col; x.beginPath(); let pen = false;
    for (const [t, v] of s) { if (v == null) { pen = false; continue; } if (pen) x.lineTo(X(t), Y(v)); else { x.moveTo(X(t), Y(v)); pen = true; } }
    x.stroke();
  }
}
// Confronto tra i lati dalle ripetizioni fatte finora: dal vivo i valori istantanei oscillano troppo.
function renderAsymLive(b, a) {
  const el = $(`asym${b.k}`), p = movimentoLive(a.reps, a.spec);
  if (!el || !p) return;
  const txt = `${it(p.diff, p.d)}${p.unit === '°' ? '°' : ` ${p.unit}`}`;
  el.innerHTML = p.level ? `<span class="asym lv${p.level}">${mark(p.level)} Differenza ${txt}, maggiore a ${sideWord(p.side)}</span>` : `Differenza tra i lati ${txt}`;
}
function onRep(b, r, a) {
  const k = b.k, total = a.reps.length;
  renderAsymLive(b, a);
  $(`reps${k}`).textContent = String(total);
  const phase = [r.down != null ? `andata ${it(r.down / 1000, 1)} s` : null, r.up != null ? `ritorno ${it(r.up / 1000, 1)} s` : null].filter(Boolean).join(', ');
  const sp = a.spec, usesDriver = sp.perSide || sp.driver === sp.primary;
  const main = usesDriver ? `${it(r.peakValue)}°` : (sp.second ? `${fmt(r.at?.[sp.primary])}° e ${fmt(r.at?.[sp.second])}°` : `${fmt(r.at?.[sp.primary])}°`);
  $(`last${k}`).textContent = `Ultima${r.side ? ` ${r.side === 'L' ? 'sinistra' : 'destra'}` : ''}: ${main}${phase ? `, ${phase}` : ''}`;
  const sign = sp.driverSign ?? 1, hit = b.st.goal != null && (usesDriver ? [r.peakValue] : [r.at?.[sp.primary], r.at?.[sp.second]]).some((v) => v != null && v * sign >= b.st.goal * sign);
  if (k === 0 || !bays[0]) {
    if (settings.sound) beep(hit ? 1320 : 880, 110);
    if (settings.voice && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(String(total)); u.lang = 'it-IT'; u.rate = 1.2; speechSynthesis.cancel(); speechSynthesis.speak(u); }
  }
}

/* Serie */
function beep(freq = 880, ms = 140) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.frequency.value = freq; g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
  } catch { /* audio non disponibile */ }
}
function startSet() {
  beep(600, 30);
  const live = bays.filter((b) => b && b.st.kind !== 'none');
  const fileOnly = live.every((b) => b.st.kind === 'file');
  let n = fileOnly ? 0 : parseInt(settings.countdown, 10);
  if (!n) { record(); return; }
  $('go').textContent = 'Annulla'; $('go').className = '';
  for (const b of live) { const c = $(`count${b.k}`); c.hidden = false; c.textContent = n; }
  counting = setInterval(() => {
    n--;
    if (n > 0) { for (const b of live) $(`count${b.k}`).textContent = n; if (n <= 3) beep(660); return; }
    clearInterval(counting); counting = null;
    for (const b of live) $(`count${b.k}`).hidden = true;
    record();
  }, 1000);
}
function cancelCount() {
  clearInterval(counting); counting = null;
  for (const b of bays) if (b) $(`count${b.k}`).hidden = true;
  $('go').textContent = redo ? 'Rianalizza il video' : 'Avvia la serie'; $('go').className = 'go';
}
function record() {
  beep(1100, 260);
  const live = bays.filter((b) => b && b.st.kind !== 'none');
  const start = performance.now();
  for (const b of live) {
    b.traceA = []; b.traceB = [];
    b.st.startSet();
    $(`reps${b.k}`).textContent = '0'; $(`last${b.k}`).textContent = ''; $(`asym${b.k}`).textContent = '';
    $(`clock${b.k}`).hidden = false;
  }
  $('go').textContent = 'Termina e salva'; $('go').className = 'stop';
  const dur = live.some((b) => b.st.kind === 'file') ? 0 : parseInt(settings.duration, 10);
  durTimer = setInterval(() => {
    const s = Math.floor((performance.now() - start) / 1000);
    for (const b of live) $(`clock${b.k}`).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (dur && s >= dur) finishSet();
  }, 250);
}
let finishing = false;
async function finishSet() {
  if (finishing) return; finishing = true;
  clearInterval(durTimer);
  beep(800, 400);
  const go = $('go'); go.disabled = true; go.textContent = 'Salvo…';
  const live = bays.filter((b) => b && b.st.state === 'recording');
  const results = [];
  for (const b of live) { $(`clock${b.k}`).hidden = true; results.push({ b, out: await b.st.stopSet() }); }
  const useful = results.filter(({ out }) => out && (out.summary.reps.length || out.keyframes.length > 1 || out.summary.durationS > 2));
  go.disabled = false; go.textContent = 'Avvia la serie'; go.className = 'go'; finishing = false;
  if (!useful.length) { setHint(live[0]?.k ?? 0, 'Serie non salvata: non ho riconosciuto il corpo per abbastanza tempo. Controlla l’inquadratura e riprova.', true, 8000); return; }
  if (redo?.set) { await replaceRedo(useful[0]); return; }
  session ??= newSession(); syncForm();
  const ids = [];
  for (const { b, out } of useful) {
    const id = Date.now() + b.k;
    const set = {
      id, protocolId: protocol.id, customSpec: protocol.custom ? protocol.spec : undefined, name: protocol.name, view: b.view, sideMode: b.st.sideMode, load: $(`load${b.k}`).value, createdAt: Date.now(),
      summary: out.summary, keyframes: out.keyframes, simulated: out.simulated, aspect: out.aspect, sourceName: out.sourceName, hasVideo: !!out.blob,
    };
    session.sets.push(set); ids.push(id);
    try {
      await saveSession(session);
      const blob = settings.keepVideo && out.blob && out.blob.size < 400e6 ? out.blob : null;
      await putMedia({ setId: id, blob, pack: out.pack, videoOffset: out.videoOffset, mime: out.mime, mirror: out.mirror });
      if (!blob) lastBlobs.set(id, { blob: out.blob, videoOffset: out.videoOffset, mirror: out.mirror });
    } catch (e) { console.error(e); setHint(b.k, `Serie non salvata del tutto: ${e.message}. Lo spazio del dispositivo potrebbe essere esaurito.`, true, 8000); }
  }
  fillPeople();
  location.hash = `#result/${session.id}/${ids[0]}`;
}
const lastBlobs = new Map();
async function replaceRedo({ b, out }) {
  const s = await getSession(redo.sid), old = redo.set, idx = s?.sets?.findIndex((x) => x.id === old.id) ?? -1;
  if (idx < 0) { setHint(b.k, 'La serie originale non è più in archivio.', true, 8000); return; }
  const id = Date.now();
  const set = {
    ...old, id, protocolId: protocol.id, customSpec: protocol.custom ? protocol.spec : undefined, name: protocol.name, view: b.view, sideMode: b.st.sideMode, load: $(`load${b.k}`).value,
    summary: out.summary, keyframes: out.keyframes, simulated: false, aspect: out.aspect, hasVideo: true, edited: Date.now(), editNote: 'rianalizzata dal video',
  };
  s.sets[idx] = set;
  await saveSession(s);
  await putMedia({ setId: id, blob: out.blob, pack: out.pack, videoOffset: out.videoOffset, mime: out.mime, mirror: out.mirror });
  await deleteMedia(old.id);
  if (s.id === session?.id) session = s;
  redo = null;
  location.hash = `#result/${s.id}/${id}`;
}
function closeCapture() {
  clearInterval(counting); counting = null; clearInterval(durTimer);
  for (const b of bays) if (b) { b.st.stopSource(); b.st.pose?.close?.(); }
  bays = []; protocol = null; customPick = null; redo = null;
  $('capture').hidden = true; $('bays').innerHTML = '';
  stopMetronome(); releaseWakeLock(); stopLevel();
}
async function addSecondCamera() {
  if (bays[1]) {
    bays[1].st.stopSource(); bays[1].st.pose?.close?.(); bays.length = 1;
    $('bays').querySelector('[data-k="1"]').remove(); $('bays').className = 'bays one';
    $('addCam').textContent = 'Aggiungi seconda camera'; refreshGo(); return;
  }
  $('bays').className = 'bays two';
  $('bays').insertAdjacentHTML('beforeend', bayMarkup(1));
  $('addCam').textContent = 'Togli seconda camera';
  const views = viewList(protocol);
  await initBay(1, views.find((v) => v !== bays[0].view) ?? views[0]);
  setHint(1, 'Con due camere ognuna riceve circa metà dei fotogrammi analizzati.', false, 6000);
}

/* Calibrazione, misura fissata, metronomo, schermo, livella */
$('calib').onclick = async () => {
  const targets = bays.filter((b) => b && b.view !== 'side' && b.st.kind !== 'none');
  $('calib').disabled = true;
  const res = await Promise.all(targets.map((b) => b.st.calibrate(3000, (s) => setHint(b.k, `Il soggetto resta fermo in piedi: ${s}…`, false, 3000))));
  targets.forEach((b, i) => {
    if (res[i] == null) setHint(b.k, 'Calibrazione non riuscita: corpo non riconosciuto. Controlla l’inquadratura e riprova.', true, 6000);
    else { setHint(b.k, `Calibrazione eseguita: bacino a riposo ${it(res[i], 1)}°.`, false, 5000); beep(990, 200); }
  });
  $('calib').disabled = false;
};
$('snap').onclick = () => {
  for (const b of bays) if (b && b.st.kind !== 'none') {
    if (b.st.state !== 'recording') { setHint(b.k, 'La misura fissata si salva dentro una serie: avvia la serie, poi premi “Fissa misura”.', false, 5000); continue; }
    const s = b.st.snapshot(); if (s) { setHint(b.k, s.label, false, 2500); beep(1200, 80); }
  }
};
let metronome = null;
function stopMetronome() { if (!metronome) return; clearTimeout(metronome.timer); metronome = null; $('metro').setAttribute('aria-pressed', 'false'); $('metro').textContent = 'Metronomo'; }
$('metro').onclick = () => {
  if (metronome) { stopMetronome(); return; }
  audio ??= new AudioContext(); audio.resume?.();
  const per = 2.0; // secondi per fase: tempo di andata e ritorno guidato
  metronome = { next: audio.currentTime + 0.05 };
  $('metro').setAttribute('aria-pressed', 'true'); $('metro').textContent = `Ogni ${it(per)} s`;
  const loop = () => { if (!metronome) return; while (metronome.next < audio.currentTime + 0.2) { const o = audio.createOscillator(), g = audio.createGain(), t = metronome.next; o.frequency.value = 1000; g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.06); metronome.next += per; } metronome.timer = setTimeout(loop, 60); };
  loop();
};
async function acquireWakeLock() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* lo schermo può spegnersi */ } }
function releaseWakeLock() { wakeLock?.release?.().catch(() => {}); wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !bays.length) return;
  acquireWakeLock();
  for (const b of bays) if (b?.st.kind === 'camera' && b.st.stream?.getVideoTracks()[0]?.readyState === 'ended') {
    if (b.st.state === 'recording') { b.st.state = 'idle'; clearInterval(durTimer); $(`clock${b.k}`).hidden = true; $('go').textContent = 'Avvia la serie'; $('go').className = 'go'; setHint(b.k, 'Ripresa interrotta perché l’app è andata in secondo piano. Ripeti la serie.', true, 8000); }
    useCamera(b, b.deviceId ?? null);
  }
});
function onOrient(e) {
  const tag = $('tag0'); if (!tag) return;
  const ang = screen.orientation?.angle ?? 0;
  const roll = ang === 90 ? -e.beta : ang === 270 ? e.beta : e.gamma;
  if (roll == null) return;
  levelSeen = true; tag.onclick = null;
  const off = Math.abs(roll) > 2;
  tag.textContent = `Livella ${it(roll, 1)}°${off ? '' : ', in bolla'}`; tag.classList.toggle('off', off);
}
let levelSeen = false;
function startLevel() {
  if (levelOn || !('DeviceOrientationEvent' in window)) return;
  levelOn = true; levelSeen = false;
  addEventListener('deviceorientation', onOrient);
  // Su iPhone la livella chiede il permesso con un tocco; su Android parte da sola.
  if (typeof DeviceOrientationEvent.requestPermission === 'function') setTimeout(() => {
    const tag = $('tag0'); if (levelSeen || !tag) return;
    tag.textContent = 'Attiva livella';
    tag.onclick = () => DeviceOrientationEvent.requestPermission().catch(() => {});
  }, 900);
}
function stopLevel() { removeEventListener('deviceorientation', onOrient); levelOn = false; }
$('go').onclick = () => { if (bays.some((b) => b?.st.state === 'recording')) finishSet(); else if (counting) cancelCount(); else startSet(); };
$('addCam').onclick = addSecondCamera;
$('toolsBtn').onclick = (e) => { const c = $('capture').classList.toggle('tools-open'); e.target.setAttribute('aria-expanded', String(c)); };

/* ---------- risultato e revisione ---------- */
let openReviews = [];
function closeReviews() { openReviews.forEach((r) => r.destroy()); openReviews = []; }
async function renderResult(sid, setId) {
  const root = $('result'), s = await getSession(sid), set = s?.sets?.find((k) => String(k.id) === String(setId));
  if (!set) { root.innerHTML = '<p class="empty">Questa serie non è più in archivio. <a href="#archivio">Apri l’archivio</a></p>'; return; }
  let media = await getMedia(set.id).catch(() => null);
  if (media && !media.blob && lastBlobs.has(set.id)) media = { ...media, ...lastBlobs.get(set.id) };
  const proto = protocolById(set.protocolId, set.customSpec), spec = proto.views[set.view];
  const sm = set.summary, reps = sm.reps ?? [];
  const peers = (await allSessions()).flatMap((o) => (o.sets ?? []).map((k) => ({ o, k }))).filter(({ k }) => k.id !== set.id && k.protocolId === set.protocolId && k.view === set.view && k.protocolId !== 'custom');
  const others = s.sets.filter((k) => k.id !== set.id);
  root.innerHTML = `<div class="result">
    <header class="rep-head"><div><h1>${esc(setName(set))}</h1><p>${esc(s.person || 'Persona non indicata')}, ${fmtDate(set.createdAt)}${set.simulated ? ', simulazione' : ''}</p></div>
      <div class="rep-actions"><a class="btn" href="#capture/${esc(set.protocolId === 'custom' ? 'custom' : set.protocolId)}">Ripeti l’esercizio</a><a class="btn" href="#home">Altro esercizio</a><a class="btn" href="#report/${s.id}">Referto</a></div></header>
    ${sm.viewWarn ? `<p class="note">${esc(sm.viewWarn)}</p>` : ''}
    ${proto.estimate ? '<p class="note">Stima: questa misura è meno affidabile delle altre.</p>' : ''}
    <div class="res-grid">
      <div class="review" id="rv"></div>
      <div>
        <p class="fine">${reps.length} ripetizioni, ${it(sm.durationS)} s, ${it(sm.fps)} fps, corpo riconosciuto nel ${it(sm.quality * 100)}% dei fotogrammi.</p>
        ${(() => { const f = movimentoSetFlags(set); return f.length ? `<ul class="asym-list">${f.map(flagLine).join('')}</ul>` : ''; })()}
        ${repsTable(sm, spec)}
        <div class="res-actions">
          <button id="dlVideo" ${media?.blob ? '' : 'disabled'}>Salva video con i gradi</button>
          <button id="dlCsv" ${media?.pack ? '' : 'disabled'}>Esporta CSV</button>
          ${peers.length ? `<label>Confronta con <select id="cmpSel"><option value="">Scegli una serie</option>${peers.slice(0, 40).map(({ o, k }) => `<option value="${o.id}:${k.id}">${esc(o.person || 'Senza nome')}, ${fmtDate(k.createdAt)}</option>`).join('')}</select></label>` : ''}
          <button id="delSet" class="quiet">Elimina la serie</button>
        </div>
        ${others.length ? `<p class="fine">Altre serie della sessione: ${others.map((k) => `<a href="#result/${s.id}/${k.id}">${esc(setName(k))}</a>`).join(', ')}.</p>` : ''}
        <label>Nota sulla serie <input id="setNote" value="${esc(set.note ?? '')}"></label>
        ${editPanel(set, media)}
        ${set.keyframes?.length ? `<div class="keys">${set.keyframes.map((k) => `<figure><img src="${k.src}" alt="${esc(k.label)}"><figcaption>${esc(k.label)}</figcaption></figure>`).join('')}</div>` : ''}
      </div>
    </div>
    ${setErrorsHtml(set, { title: 'Cosa abbiamo visto in questa serie' })}</div>`;
  const rv = new Review(root.querySelector('#rv'), {
    set, media,
    onMessage: (m, err) => NOTE(m, err),
    onSave: async (k) => { set.keyframes = [...(set.keyframes ?? []), k]; await saveSession(s); NOTE('Fotogramma salvato nel referto.'); if (s.id === session?.id) session = s; const grid = root.querySelector('.keys'); if (grid) grid.insertAdjacentHTML('beforeend', `<figure><img src="${k.src}" alt="${esc(k.label)}"><figcaption>${esc(k.label)}</figcaption></figure>`); },
  });
  openReviews.push(rv);
  bindCharts(root);
  const base = setName(set).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
  $('dlCsv').onclick = () => download(new Blob(['﻿', rv.csv()], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
  $('dlVideo').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Creo il video…';
    await rv.exportVideo((blob, ext) => download(blob, `${base}.${ext}`));
    e.target.disabled = false; e.target.textContent = 'Salva video con i gradi';
  };
  if ($('cmpSel')) $('cmpSel').onchange = (e) => { if (e.target.value) location.hash = `#compare/${s.id}:${set.id}/${e.target.value}`; };
  $('setNote').onchange = async (e) => { set.note = e.target.value; await saveSession(s); if (s.id === session?.id) session = s; };
  bindEdit(s, set, media);
  $('delSet').onclick = async (e) => {
    if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Conferma eliminazione'; return; }
    s.sets = s.sets.filter((k) => k.id !== set.id); await saveSession(s); await deleteMedia(set.id);
    if (s.id === session?.id) session = s;
    location.hash = s.sets.length ? `#report/${s.id}` : '#home';
  };
  if (s.id === session?.id) session = s;
}
/* Modifica di una serie salvata */
function editPanel(set, media) {
  if (set.protocolId === 'custom') return '';
  const opts = (grp, label) => `<optgroup label="${label}">${PROTOCOLS.filter((p) => p.group === grp).map((p) => `<option value="${p.id}"${p.id === set.protocolId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`;
  return `<details class="edit-set" id="editSet"><summary>Modifica la serie e ricalcola</summary>
    <p class="fine">Se in ripresa era scelto l’esercizio, la vista o il lato sbagliato, correggilo qui. “Ricalcola” rifà misure e ripetizioni dai punti salvati, in un attimo. “Rianalizza il video” riconosce di nuovo il corpo dal video, per esempio con il riconoscimento più preciso.</p>
    <div class="edit-row">
      <label>Esercizio <select id="edEx">${opts('squat', 'Accosciate e arto inferiore')}${opts('lift', 'Stacco, panca e trazioni')}${opts('arm', 'Arti superiori')}</select></label>
      <label>Ripresa da <select id="edView"></select></label>
      <label id="edSideL">Lato <select id="edSide"><option value="auto">Automatico</option><option value="L">Sinistro</option><option value="R">Destro</option></select></label>
      <label>Carico kg <input id="edLoad" type="number" step="0.5" value="${esc(set.load ?? '')}"></label>
    </div>
    <div class="edit-actions"><button id="edCalc" class="primary"${media?.pack?.n ? '' : ' disabled'}>Ricalcola dai punti salvati</button>
      <button id="edRedo"${media?.blob ? '' : ' disabled'}>Rianalizza il video</button></div>
    ${media?.pack?.n ? '' : '<p class="fine">I punti di questa serie non sono in archivio.</p>'}${media?.blob ? '' : '<p class="fine">Il video di questa serie non è stato conservato: si può solo ricalcolare dai punti.</p>'}
    ${set.edited ? `<p class="edited">Modificata il ${fmtDate(set.edited)}${set.editNote ? `, ${esc(set.editNote)}` : ''}.</p>` : ''}</details>`;
}
function bindEdit(s, set, media) {
  if (!$('editSet')) return;
  const fillViews = () => {
    const p = protocolById($('edEx').value), cur = $('edView').value || set.view;
    $('edView').innerHTML = viewList(p).map((v) => `<option value="${v}">${VIEW_NAMES[v]}</option>`).join('');
    $('edView').value = p.views[cur] ? cur : defaultView(p);
    const uni = $('edView').value !== 'side' && !!p.views[$('edView').value].legPick;
    $('edSideL').hidden = !($('edView').value === 'side' || uni);
  };
  $('edView').innerHTML = `<option value="${set.view}">${VIEW_NAMES[set.view]}</option>`;
  $('edSide').value = ['L', 'R'].includes(set.sideMode) ? set.sideMode : 'auto';
  fillViews();
  $('edEx').onchange = fillViews; $('edView').onchange = fillViews;
  $('edCalc').onclick = async (e) => {
    const p = protocolById($('edEx').value), view = $('edView').value, sideMode = $('edSideL').hidden ? 'auto' : $('edSide').value;
    e.target.disabled = true; e.target.textContent = 'Ricalcolo…';
    try {
      const a = reanalyzePack(media.pack, { protocol: p, view, sideMode, aspect: set.aspect ?? 16 / 9, baseTilt: set.summary?.baseTilt ?? null });
      const summary = a.summary();
      Object.assign(set, { protocolId: p.id, name: p.name, view, sideMode, load: $('edLoad').value, summary, edited: Date.now(), editNote: 'ricalcolata dai punti salvati' });
      const stored = await getMedia(set.id).catch(() => null);
      await putMedia({ ...(stored ?? { setId: set.id, blob: null, videoOffset: media.videoOffset, mime: media.mime, mirror: media.mirror }), pack: packFrames(a.frames) });
      await saveSession(s); if (s.id === session?.id) session = s;
      await renderResult(s.id, set.id);
      NOTE(`Serie ricalcolata: ${summary.reps.length} ripetizioni, vista ${VIEW_NAMES[view].toLowerCase()}.`);
    } catch (err) { console.error(err); NOTE(`Ricalcolo non riuscito: ${err.message}`, true); e.target.disabled = false; e.target.textContent = 'Ricalcola dai punti salvati'; }
  };
  $('edRedo').onclick = () => { location.hash = `#capture/${$('edEx').value}/${$('edView').value}/redo:${s.id}:${set.id}`; };
}
async function renderCompare(a, b) {
  const root = $('compare');
  const load = async (ref) => { const [sid, setId] = ref.split(':'); const s = await getSession(sid), set = s?.sets?.find((k) => String(k.id) === setId); return set ? { s, set, media: await getMedia(set.id).catch(() => null) } : null; };
  const A = await load(a), B = await load(b);
  if (!A || !B) { root.innerHTML = '<p class="empty">Una delle serie non è più in archivio.</p>'; return; }
  const col = (x, id) => `<div><h2>${esc(x.s.person || 'Senza nome')}</h2><p class="fine">${fmtDate(x.set.createdAt)}${x.set.load ? `, ${esc(x.set.load)} kg` : ''}</p><div class="review" id="${id}"></div></div>`;
  const repsOf = (x) => (x.set.summary.reps ?? []).length;
  const n = Math.min(repsOf(A), repsOf(B));
  root.innerHTML = `<div class="result"><header class="rep-head"><h1>${esc(setName(A.set))}, confronto</h1><div class="rep-actions">
      ${n ? `<label>Allinea al picco della ripetizione <select id="cmpRep">${Array.from({ length: n }, (_, i) => `<option value="${i}">${i + 1}</option>`).join('')}</select></label><button id="cmpGo" class="primary">Allinea</button>` : ''}
      <button id="cmpPlay">Riproduci insieme</button><a class="btn" href="#result/${A.s.id}/${A.set.id}">Torna alla serie</a></div></header>
    <div class="cmp-grid">${col(A, 'rvA')}${col(B, 'rvB')}</div></div>`;
  const ra = new Review(root.querySelector('#rvA'), { set: A.set, media: A.media, compact: true, onMessage: NOTE });
  const rb = new Review(root.querySelector('#rvB'), { set: B.set, media: B.media, compact: true, onMessage: NOTE });
  openReviews.push(ra, rb);
  if ($('cmpGo')) $('cmpGo').onclick = () => { const i = Number($('cmpRep').value); ra.goRep(i); rb.goRep(i); };
  $('cmpPlay').onclick = () => { if (ra.playing || rb.playing) { ra.pause(); rb.pause(); } else { ra.play(); rb.play(); } };
}

/* ---------- navigazione ---------- */
async function route() {
  const [page, a, b, c] = (location.hash.slice(1) || 'home').split('/');
  closeCapture(); closeReviews();
  const known = ['home', 'archivio', 'report', 'guida', 'result', 'compare'];
  const showing = page === 'capture' ? 'home' : known.includes(page) ? page : 'home';
  for (const p of known) $(p).hidden = p !== showing;
  document.querySelectorAll('[data-nav]').forEach((x) => { if (x.dataset.nav === showing) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  NOTE(isSecureContext ? '' : 'Per usare la camera apri l’app da un indirizzo sicuro (https).', !isSecureContext);
  if (showing === 'home') { if (session) { const fresh = await getSession(session.id).catch(() => null); if (fresh) session = fresh; } renderHome(); }
  if (showing === 'archivio') renderArchive($('archivio'));
  if (showing === 'report') renderReport($('report'), Number(a), b);
  if (showing === 'result') renderResult(a, b);
  if (showing === 'compare') renderCompare(a, b);
  if (page === 'capture') await openCapture(a, b, c);
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
(async () => {
  const drafts = (await allSessions().catch(() => [])).filter((s) => s.draft && s.sets?.length);
  if (drafts[0]) { session = drafts[0]; $('person').value = session.person ?? ''; $('notes').value = session.notes ?? ''; }
  window.LAB.attach({
    name: 'person', datalist: 'people', busy: () => bays.some((b) => b?.st.state === 'recording'),
    draft: () => (session?.sets?.length ? { person: session.person, close: async () => { session.draft = false; await saveSession(session); session = null; $('notes').value = ''; renderHome(); } } : null),
  });
  await route();
})();
