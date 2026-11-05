import { BalanceBoard } from './stabilometria-board.js';
import { SimBoard } from './stabilometria-sim.js';
import { copOf, rotate, analyzeTrial, manualPlacement, guidedPlacement, footLoads, median } from './stabilometria-signal.js';
import { liveFigure } from './stabilometria-figure.js';
import { renderReport, renderArchive, it, esc } from './stabilometria-report.js';
import { saveExam, allExams } from './stabilometria-store.js';
import { thresholds, level, mark, loadPair, stabiloFlags, flagLine } from './asym.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HID = !!navigator.hid;
const KINDS = [
  { kind: 'eo', label: 'Occhi aperti', hint: 'Sguardo su un punto davanti a sé', scale: 1 },
  { kind: 'ec', label: 'Occhi chiusi', hint: 'Con avviso a voce', scale: 1.5, closed: true },
  { kind: 'eoF', label: 'Occhi aperti su cuscino', hint: 'Cuscino sopra la pedana', scale: 1.8 },
  { kind: 'ecF', label: 'Occhi chiusi su cuscino', hint: 'Resta accanto al cliente', scale: 2.6, closed: true },
  { kind: 'slL', label: 'Solo piede sinistro', hint: 'Il destro sollevato', scale: 2.4, single: 'L' },
  { kind: 'slR', label: 'Solo piede destro', hint: 'Il sinistro sollevato', scale: 2.4, single: 'R' },
];

let board = null, exam = null, busy = false, last = null, smooth = null, rotated = false, capture = null, trail = [], needsDraw = false, tareDone = false;

/* ---------- pedana ---------- */
function pill(msg, cls = '') { const p = $('pill'); p.textContent = msg; p.className = `pill ${cls}`; }
function logLine(m) { const li = document.createElement('li'); li.textContent = m; $('log').append(li); }
function bindBoard(b) {
  b.on('log', logLine);
  b.on('sample', onSample);
  b.on('battery', (bars) => updatePill());
  b.on('connect', () => { updatePill(); refreshButtons(); $('boardInfo').textContent = b.simulated ? 'Pedana simulata: i dati vengono da un cliente virtuale.' : 'Pedana collegata. A pedana vuota, premi “Azzera a vuoto”.'; });
  b.on('disconnect', () => { pill('Pedana scollegata', 'err'); $('boardInfo').textContent = 'La pedana si è scollegata. Riaccendila con il tasto frontale e premi “Collega la pedana”.'; if (capture) abortTest('La pedana si è scollegata: la prova non è stata salvata.'); refreshButtons(); });
}
function updatePill() {
  if (!board?.connected) return pill('Pedana non collegata');
  const bat = board.battery == null ? '' : `, batterie ${board.battery}/4`;
  pill(`${board.simulated ? 'Simulazione' : 'Pedana collegata'}${bat}${board.battery === 0 ? ': sostituiscile' : ''}`, board.battery === 0 ? 'err' : 'ok');
}
async function connect() {
  $('log').innerHTML = '';
  if (!HID) return;
  await board?.close?.();
  board = new BalanceBoard(); bindBoard(board); tareDone = false;
  try { const ok = await board.request(); if (!ok) { logLine('Nessun dispositivo scelto.'); return; } }
  catch (e) {
    logLine(e.message);
    if (e.name === 'NotFoundError') return;
    pill('Collegamento non riuscito', 'err');
    $('boardInfo').textContent = `${e.message} Controlla che la pedana sia accesa e abbinata, poi riprova. In “Dettagli del collegamento” vedi dove si è fermato.`;
    $('log').closest('details').open = true;
  }
  refreshButtons();
}
async function useSim() {
  $('log').innerHTML = '';
  await board?.close?.();
  board = new SimBoard(); bindBoard(board); tareDone = false;
  await board.request();
  exam = exam && exam.tests.length ? exam : newExam(); exam.simulated = true;
  refreshButtons();
}
function simPhase(p) { if (board?.simulated) board.phase = p; }
function refreshButtons() {
  const on = !!board?.connected;
  $('tareBtn').disabled = !on || busy; $('rotBtn').disabled = !on || busy; $('findBtn').disabled = !on || busy;
  $('connect').disabled = !HID || busy; $('simBtn').disabled = busy;
  $('tests').querySelectorAll('button').forEach((b) => { b.disabled = !on || busy; });
  $('reportBtn').disabled = !exam?.tests?.length || busy; $('newBtn').hidden = !exam?.tests?.length; $('stopBtn').hidden = !capture;
}

/* ---------- dati dal vivo ---------- */
function onSample(s0) {
  const s = rotated ? rotate(s0) : s0;
  s.t = s0.t;
  last = s;
  if (capture) capture.samples.push({ t: s.t, tl: s.tl, tr: s.tr, bl: s.bl, br: s.br });
  const c = copOf(s);
  if (c && c.total > 8) {
    smooth = smooth ? { x: smooth.x + (c.x - smooth.x) * 0.12, y: smooth.y + (c.y - smooth.y) * 0.12, total: smooth.total + (c.total - smooth.total) * 0.06 } : { ...c };
    trail.push([smooth.x, smooth.y, s.t]);
    while (trail.length && trail[0][2] < s.t - 6000) trail.shift();
  } else { smooth = null; trail = []; }
  needsDraw = true;
}
// Il peso si sposta di continuo: dal vivo si segnala la media dell'ultimo secondo circa, non l'istante.
const LIMITS = thresholds();
let asymEma = null;
function updateLiveAsym(L) {
  const single = !!capture?.single, on = L && (capture ? !capture.silent && !single : !busy);
  const lm = $('lMark'), rm = $('rMark');
  if (!on) { asymEma = null; lm.textContent = ''; rm.textContent = ''; lm.className = ''; rm.className = ''; return; }
  const d = L.left - L.right;
  asymEma = asymEma == null ? d : asymEma + (d - asymEma) * 0.03;
  const lv = level(Math.round(Math.abs(asymEma)), LIMITS.load);
  const paint = (el, show) => { el.textContent = show ? mark(lv) : ''; el.className = show ? `asym lv${lv}` : ''; };
  paint(lm, lv > 0 && asymEma > 0); paint(rm, lv > 0 && asymEma < 0);
}
function draw() {
  requestAnimationFrame(draw);
  if (!needsDraw || $('esame').hidden) return;
  needsDraw = false;
  const s = last;
  for (const k of ['tl', 'tr', 'bl', 'br']) { const t = document.querySelector(`#s_${k} text`); if (t && s) t.textContent = it(s[k], 1); }
  const dot = $('dot'), tr = $('trail');
  if (!smooth) {
    if (dot) dot.style.display = 'none'; if (tr) tr.setAttribute('points', '');
    $('weight').textContent = s ? it(Math.max(0, s.tl + s.tr + s.bl + s.br), 1) : '–';
    for (const id of ['lPct', 'rPct', 'fPct', 'bPct']) $(id).textContent = '–';
    updateLiveAsym(null);
    for (const id of ['lBar', 'rBar', 'fBar', 'bBar']) $(id).style.width = '50%';
    return;
  }
  dot.style.display = ''; dot.setAttribute('transform', `translate(${smooth.x.toFixed(1)} ${(-smooth.y).toFixed(1)})`);
  tr.setAttribute('points', trail.filter((_, i) => i % 3 === 0).map((p) => `${p[0].toFixed(1)},${(-p[1]).toFixed(1)}`).join(' '));
  $('weight').textContent = it(smooth.total, 1);
  const L = footLoads(smooth, currentPlacement());
  $('lPct').textContent = `${it(L.left)}%`; $('rPct').textContent = `${it(L.right)}%`; $('fPct').textContent = `${it(L.fore)}%`; $('bPct').textContent = `${it(L.rear)}%`;
  updateLiveAsym(L);
  $('lBar').style.width = `${L.left}%`; $('rBar').style.width = `${L.right}%`; $('bBar').style.width = `${L.rear}%`; $('fBar').style.width = `${L.fore}%`;
}
const numberVal = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) && v > 0 ? v : d; };
let guided = null;
function currentPlacement() { return guided ?? manualPlacement(numberVal('stance', 20), numberVal('footLen', 26)); }
function drawPlate() { $('plate').innerHTML = liveFigure(currentPlacement()); }
for (const id of ['stance', 'footLen']) $(id).addEventListener('input', () => { guided = null; $('placeInfo').textContent = 'Da misure inserite: piedi centrati sulla pedana. Per una stima migliore, usa “Trova i piedi”.'; drawPlate(); });

/* ---------- suoni e messaggi ---------- */
let audio = null;
function beep(freq = 880, ms = 150) { try { audio ??= new AudioContext(); audio.resume?.(); const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime; o.frequency.value = freq; g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000); o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + ms / 1000 + 0.02); } catch { /* audio non disponibile */ } }
function say(text) { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(text); u.lang = 'it-IT'; speechSynthesis.cancel(); speechSynthesis.speak(u); }
function overlay(big, small = '') { $('overlay').hidden = false; $('ovBig').textContent = big; $('ovSmall').textContent = small; }
const hideOverlay = () => { $('overlay').hidden = true; };
const weightNow = () => { const c = last && copOf(last); return c ? c.total : 0; };
async function countdown(n, text, small) { for (let i = n; i > 0; i--) { if (cancelFlag) return false; overlay(String(i), small ?? text); if (i <= 3) beep(660, 90); await sleep(1000); } return !cancelFlag; }
let cancelFlag = false;

/* ---------- azzeramento ---------- */
async function tare() {
  busy = true; refreshButtons();
  overlay('Pedana vuota', 'Nessuno sopra: misuro per 2 secondi.');
  simPhase('empty');
  const saved = board.tare; board.tare = { tl: 0, tr: 0, bl: 0, br: 0 };
  await sleep(300);
  capture = { samples: [], silent: true }; await sleep(2000); const smp = capture.samples; capture = null;
  const pick = (k) => median(smp.map((s) => s[k]));
  const vals = { tl: pick('tl'), tr: pick('tr'), bl: pick('bl'), br: pick('br') };
  const tot = vals.tl + vals.tr + vals.bl + vals.br;
  if (!smp.length || Math.abs(tot) > 8) {
    board.tare = saved; hideOverlay();
    $('boardInfo').textContent = smp.length ? `Sulla pedana risultano ${it(tot, 1)} kg: falla scendere e riprova.` : 'Non arrivano dati dalla pedana: riprova o ricollegala.';
  } else {
    board.tare = rotated ? { tl: vals.br, tr: vals.bl, bl: vals.tr, br: vals.tl } : vals; tareDone = true;
    $('boardInfo').textContent = 'Pedana azzerata. Fai salire il cliente.';
    overlay('Fatto', 'Fai salire il cliente.'); beep(990, 180); await sleep(700); hideOverlay();
  }
  simPhase('stand'); busy = false; refreshButtons();
}

/* ---------- ricerca dei piedi ---------- */
async function holdMedian(ms) {
  capture = { samples: [], silent: true }; await sleep(ms); const smp = capture.samples; capture = null;
  const pts = smp.map(copOf).filter((c) => c && c.total > 8);
  if (pts.length < 10) return null;
  const tail = pts.slice(Math.floor(pts.length * 0.4));
  return { x: median(tail.map((p) => p.x)), y: median(tail.map((p) => p.y)), total: median(tail.map((p) => p.total)) };
}
async function findFeet() {
  if (board?.simulated && board.phase === 'empty') { board.phase = 'stand'; await sleep(500); }
  if (weightNow() < 15) { $('placeInfo').textContent = 'Il cliente deve essere sulla pedana, con i piedi già in posizione.'; return; }
  busy = true; cancelFlag = false; refreshButtons();
  const steps = [
    { key: 'leftFoot', phase: 'liftR', big: 'Alza il piede destro', small: 'Resta in equilibrio sul sinistro, senza spostarlo.', voice: 'Alza il piede destro' },
    { key: 'rightFoot', phase: 'liftL', big: 'Alza il piede sinistro', small: 'Riappoggia il destro nello stesso punto e alza il sinistro.', voice: 'Rimetti giù il destro, e alza il sinistro' },
    { key: 'toes', phase: 'toes', big: 'Peso sulle punte', small: 'Due piedi a terra. Sposta il peso in avanti senza staccare i talloni.', voice: 'Due piedi a terra. Peso sulle punte' },
    { key: 'heels', phase: 'heels', big: 'Peso sui talloni', small: 'Sposta il peso indietro senza staccare le punte.', voice: 'Peso sui talloni' },
  ];
  const got = {};
  for (const st of steps) {
    say(st.voice); overlay(st.big, st.small); simPhase(st.phase); beep(800, 120);
    await sleep(2500);
    const m = await holdMedian(2500);
    if (!m) { fail('Non ho riconosciuto il cliente sulla pedana.'); return; }
    got[st.key] = m;
  }
  simPhase('stand'); say('Riposo'); beep(990, 200);
  function fail(msg) { hideOverlay(); simPhase('stand'); busy = false; $('placeInfo').textContent = `${msg} Puoi riprovare o usare le misure inserite.`; refreshButtons(); }
  let { leftFoot, rightFoot, toes, heels } = got;
  let flipped = false;
  if (leftFoot.x > rightFoot.x) { // pedana girata: si corregge da sola
    flipped = true; rotated = !rotated; $('rotBtn').setAttribute('aria-pressed', String(rotated));
    const f = (p) => ({ ...p, x: -p.x, y: -p.y });
    leftFoot = f(leftFoot); rightFoot = f(rightFoot); toes = f(toes); heels = f(heels);
  }
  if (rightFoot.x - leftFoot.x < 80) { fail('I due appoggi risultano troppo vicini: il peso non si è spostato abbastanza.'); return; }
  if (toes.y - heels.y < 40) { fail('Punte e talloni risultano troppo vicini: il peso non si è spostato abbastanza.'); return; }
  guided = guidedPlacement({ leftFoot, rightFoot, toes, heels, footCm: numberVal('footLen', 26) });
  $('placeInfo').textContent = `Piedi trovati: ${it((guided.xR - guided.xL) / 10, 1)} cm tra i centri.${flipped ? ' La pedana era girata: ho corretto il verso.' : ''} Se il cliente sposta i piedi, ripeti.`;
  hideOverlay(); drawPlate(); trail = []; busy = false; refreshButtons();
}

/* ---------- prove ---------- */
function newExam() { return { id: Date.now(), createdAt: Date.now(), draft: true, client: {}, tests: [], placement: null, simulated: !!board?.simulated }; }
function syncClient() { if (exam) exam.client = { name: $('c_name').value.trim(), birth: $('c_birth').value, height: $('c_height').value }; }
for (const id of ['c_name', 'c_birth', 'c_height']) $(id).addEventListener('change', () => { if (exam?.tests.length) { syncClient(); saveExam(exam).catch(() => {}); } });
function abortTest(msg) { cancelFlag = true; capture = null; hideOverlay(); busy = false; if (msg) $('boardInfo').textContent = msg; if (board?.simulated) board.scale = 1; refreshButtons(); }
async function runTest(K) {
  simPhase(K.single === 'L' ? 'liftR' : K.single === 'R' ? 'liftL' : 'stand');
  await sleep(board?.simulated ? 300 : 0);
  if (weightNow() < 15) { $('boardInfo').textContent = 'Il cliente deve essere sulla pedana prima di avviare la prova.'; return; }
  busy = true; cancelFlag = false; refreshButtons(); $('stopBtn').hidden = false;
  const dur = parseInt($('dur').value, 10) * 1000;
  if (K.closed) say('Tra poco chiudi gli occhi. Resta fermo.'); else if (K.single) say(K.single === 'L' ? 'Resta sul piede sinistro' : 'Resta sul piede destro'); else say('Resta fermo e guarda davanti a te');
  const ok = await countdown(K.closed ? 5 : 4, K.label, K.closed ? 'Quando senti il segnale, chiudi gli occhi.' : K.single ? 'Resta su un piede, fermo.' : 'Resta fermo, sguardo davanti a te.');
  if (!ok) return;
  if (K.closed) say('Chiudi gli occhi');
  beep(1100, 280);
  if (board?.simulated) board.scale = K.scale;
  const start = performance.now(), refW = weightNow();
  capture = { samples: [], single: !!K.single };
  let below = 0, aborted = false;
  while (performance.now() - start < dur) {
    if (cancelFlag) return;
    const left = Math.ceil((dur - (performance.now() - start)) / 1000);
    overlay(String(left), K.label);
    $('overlay').classList.add('clear');
    const w = weightNow();
    below = w < refW * 0.45 ? below + 1 : 0;
    if (below >= 4) { aborted = true; break; }
    await sleep(200);
  }
  $('overlay').classList.remove('clear');
  const samples = capture?.samples ?? []; capture = null;
  if (board?.simulated) board.scale = 1;
  beep(800, 450);
  if (K.closed) say('Riapri gli occhi');
  hideOverlay(); busy = false;
  if (aborted) { $('boardInfo').textContent = 'Il cliente è sceso dalla pedana o ha perso l’appoggio: la prova non è stata salvata. Puoi ripeterla.'; refreshButtons(); return; }
  const placement = currentPlacement();
  const m = analyzeTrial(samples, { placement, singleLeg: !!K.single });
  if (!m) { $('boardInfo').textContent = 'Dati insufficienti: la prova non è stata salvata.'; refreshButtons(); return; }
  exam ??= newExam();
  syncClient();
  exam.placement = placement; exam.rotated = rotated; exam.simulated = !!board?.simulated || exam.simulated; exam.tare = tareDone; exam.batteryEnd = board?.battery;
  const n = exam.tests.filter((t) => t.kind === K.kind).length;
  exam.tests.push({ kind: K.kind, label: n ? `${K.label} (${n + 1})` : K.label, at: Date.now(), m });
  try { await saveExam(exam); } catch (e) { $('boardInfo').textContent = `Prova non salvata: ${e.message}`; }
  renderDone(); fillClients(); simPhase('stand'); refreshButtons();
}
function renderDone() {
  const box = $('done');
  if (!exam?.tests.length) { box.textContent = 'Le prove concluse compariranno qui.'; return; }
  box.innerHTML = `<table><thead><tr><th>Prova</th><th>Percorso, mm</th><th>Area, mm²</th><th>Sin / des %</th></tr></thead><tbody>${exam.tests.map((t) => `<tr><td>${esc(t.label)}</td><td>${it(t.m.length)}</td><td>${it(t.m.area)}</td><td>${t.m.loads ? (() => { const p = loadPair(t.m.loads), txt = `${it(t.m.loads.left)} / ${it(t.m.loads.right)}`; return p?.level ? `<span class="asym lv${p.level}">${mark(p.level)} ${txt}</span>` : txt; })() : '–'}</td></tr>`).join('')}</tbody></table>${(() => { const f = stabiloFlags(exam).filter((x) => x.key === 'sway'); return f.length ? `<ul class="asym-list">${f.map(flagLine).join('')}</ul>` : ''; })()}${exam.tests.flatMap((t) => t.m.warnings.map((w) => `<p class="note">${esc(t.label)}: ${esc(w)}</p>`)).join('')}`;
}
const fillClients = () => window.LAB.refreshPeople();

/* ---------- comandi ---------- */
$('tests').innerHTML = KINDS.map((K, i) => `<li><span>${K.label}<small>${K.hint}</small></span><button data-k="${i}" disabled>Avvia</button></li>`).join('');
$('tests').querySelectorAll('button').forEach((b) => { b.onclick = () => runTest(KINDS[Number(b.dataset.k)]); });
$('connect').onclick = connect;
$('simBtn').onclick = useSim;
$('tareBtn').onclick = tare;
$('findBtn').onclick = findFeet;
$('rotBtn').onclick = (e) => { rotated = !rotated; e.currentTarget.setAttribute('aria-pressed', String(rotated)); trail = []; smooth = null; };
$('stopBtn').onclick = () => abortTest('Prova interrotta: non è stata salvata.');
$('reportBtn').onclick = async () => { syncClient(); exam.draft = false; await saveExam(exam); const id = exam.id; location.hash = `#report/${id}`; };
$('newBtn').onclick = async () => { if (exam) { exam.draft = false; await saveExam(exam).catch(() => {}); } exam = null; guided = null; window.LAB.fillFromClient(); $('placeInfo').textContent = 'Da misure inserite: piedi centrati sulla pedana. Per una stima migliore, usa “Trova i piedi”.'; drawPlate(); renderDone(); refreshButtons(); };

/* ---------- navigazione ---------- */
const PAGES = ['esame', 'report', 'archivio', 'guida'];
async function route() {
  const [page, a, b] = (location.hash.slice(1) || 'esame').split('/');
  const show = PAGES.includes(page) ? page : 'esame';
  for (const p of PAGES) $(p).hidden = p !== show;
  document.querySelectorAll('[data-nav]').forEach((x) => { if (x.dataset.nav === show) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  if (show === 'report') await renderReport($('report'), Number(a), b);
  if (show === 'archivio') await renderArchive($('archivio'));
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
(async () => {
  if (!HID) {
    const n = $('noHid'); n.hidden = false;
    n.innerHTML = 'Su questo browser la pedana non si può collegare. Per fare l’esame usa <b>Chrome o Edge su un PC o tablet Windows</b>. Qui puoi consultare i report salvati o provare il programma senza pedana.';
    $('connect').disabled = true;
    $('boardInfo').textContent = 'Il collegamento alla pedana non è disponibile su questo dispositivo.';
  }
  drawPlate(); draw(); refreshButtons();
  const drafts = (await allExams().catch(() => [])).filter((e) => e.draft && e.tests?.length);
  if (drafts[0]) { exam = drafts[0]; $('c_name').value = exam.client?.name ?? ''; $('c_birth').value = exam.client?.birth ?? ''; $('c_height').value = exam.client?.height ?? ''; renderDone(); refreshButtons(); }
  window.LAB.attach({
    name: 'c_name', birth: 'c_birth', height: 'c_height', datalist: 'clients', busy: () => busy || !!capture,
    draft: () => (exam?.tests?.length ? { person: exam.client?.name, close: async () => { exam.draft = false; await saveExam(exam).catch(() => {}); exam = null; guided = null; renderDone(); refreshButtons(); } } : null),
  });
  await route();
  // Se la pedana è già autorizzata e accesa, si ricollega da sola.
  if (HID && (await navigator.hid.getDevices()).some((d) => d.vendorId === 0x057e)) { const b = new BalanceBoard(); bindBoard(b); if (await b.reconnect()) { board = b; refreshButtons(); } else { $('log').innerHTML = ''; } }
})();
