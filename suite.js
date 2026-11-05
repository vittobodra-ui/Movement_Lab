// Pagina principale, elenco clienti, scheda cliente e copia di sicurezza.
import { LAB } from './suitebar.js';
import { allAnalyses, clientList, unnamedAnalyses, normName, cleanName, getClient, exportAll, importAny, renameClient, deleteClient, MODULE_NAMES } from './data.js';
import * as A from './asym.js';
import { WHEEL_DEFAULTS, WHEEL_LIMIT_INFO, wheelLimits, saveWheelLimits } from './corsa-ruota.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const it = A.fmt;
const day = (ms) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const dayTime = (ms) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const LAST_BACKUP = 'lab_lastBackup';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* non salvato */ } };
const reportHref = (a) => `${a.mod}.html#report/${a.id}`;
const VIEW = { side: 'laterale', front: 'frontale', rear: 'posteriore' };

/* ---------- pagina principale ---------- */
async function renderHome() {
  const analyses = await allAnalyses();
  const clients = await clientList(analyses);
  const c = LAB.client();
  $('c_name').value = c.name ?? ''; $('c_birth').value = c.birth ?? ''; $('c_height').value = c.height ?? '';
  $('c_people').innerHTML = clients.map((x) => `<option value="${esc(x.name)}">`).join('');
  updateClientHint(clients);
  renderRecent(analyses);
  renderBackupState(analyses);
  renderLimits();
  renderWheelLimits();
  $('studioName').value = LAB.studio();
  renderChecks();
}
function updateClientHint(clients) {
  const name = cleanName($('c_name').value), key = normName(name);
  const found = clients.find((x) => x.key === key);
  const sheet = $('openSheet');
  sheet.hidden = !name; sheet.href = `#cliente/${encodeURIComponent(name)}`;
  const n = found ? found.counts.corsa + found.counts.movimento + found.counts.stabilometria : 0;
  $('clientHint').textContent = !name ? 'Il nome scelto qui compare già compilato in tutti i programmi.'
    : n ? `${found.name}: ${n === 1 ? 'una analisi salvata' : `${n} analisi salvate`}, l’ultima il ${day(found.last)}.` : `${name}: nessuna analisi salvata finora.`;
}
function analysisDetail(a) {
  if (a.mod === 'corsa') return [a.doc.speed ? `${a.doc.speed} km/h` : null, Object.keys(a.doc.views ?? {}).map((v) => VIEW[v]).join(', ')].filter(Boolean).join(', ');
  if (a.mod === 'movimento') return [...new Set(a.doc.sets.map((s) => s.name))].join(', ');
  return a.doc.tests.map((t) => t.label).join(', ');
}
const isSim = (a) => a.mod === 'movimento' ? a.doc.sets.some((s) => s.simulated) : !!a.doc.simulated;
function flagBadge(flags) {
  if (!flags.length) return '';
  const top = Math.max(...flags.map((f) => f.level));
  return `<span class="asym lv${top}" title="Asimmetrie segnalate">${A.mark(top)} ${flags.length}</span>`;
}
function renderRecent(analyses) {
  const rows = analyses.slice(0, 8);
  $('recent').innerHTML = rows.length ? `<table class="metrics"><thead><tr><th>Data</th><th>Cliente</th><th>Analisi</th><th class="n">Asimmetrie</th></tr></thead><tbody>${rows.map((a) => `<tr>
      <td class="nowrap">${day(a.at)}</td><th scope="row">${a.person ? `<a href="#cliente/${encodeURIComponent(a.person)}">${esc(a.person)}</a>` : '<span class="u">Non indicato</span>'}</th>
      <td><a href="${reportHref(a)}">${MODULE_NAMES[a.mod]}</a>${isSim(a) ? ' <span class="u">simulazione</span>' : ''}<br><span class="u">${esc(analysisDetail(a))}</span></td>
      <td class="n">${flagBadge(A.countFlags(a.mod, a.doc))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Le analisi salvate compariranno qui. Ogni programma ha una prova con dati simulati, utile per vedere come funziona.</p>';
}
function renderBackupState(analyses) {
  const last = Number(lsGet(LAST_BACKUP)) || 0, box = $('backupState');
  const old = analyses.length && (!last || Date.now() - last > 30 * 864e5);
  box.className = old ? 'warnline' : '';
  box.textContent = !analyses.length ? 'Non ci sono ancora analisi da salvare.'
    : !last ? `${analyses.length === 1 ? 'Una analisi' : `${analyses.length} analisi`} senza copia di sicurezza: salvala in un file e tienila anche fuori da questo PC.`
      : `Ultima copia: ${day(last)}.${old ? ' Conviene farne una nuova.' : ''}`;
}
function renderLimits() {
  const T = A.thresholds();
  $('limits').innerHTML = Object.keys(A.DEFAULTS).map((k) => { const I = A.LIMIT_INFO[k]; return `<label class="limit"><span><b>${I.label}</b><small>${I.detail}</small></span><span class="limit-in"><input type="number" min="0" step="any" inputmode="decimal" data-limit="${k}" value="${T[k] ?? ''}" aria-label="${I.label}, ${I.unit}"><i>${I.unit}</i></span></label>`; }).join('');
  $('limits').querySelectorAll('input').forEach((el) => { el.onchange = saveLimits; });
}
function renderWheelLimits() {
  const T = wheelLimits();
  $('wheelLimits').innerHTML = Object.keys(WHEEL_DEFAULTS).map((k) => { const I = WHEEL_LIMIT_INFO[k]; return `<label class="limit"><span><b>${I.label}</b><small>${I.detail}</small></span><span class="limit-in"><input type="number" step="any" inputmode="decimal" data-wl="${k}" value="${T[k] ?? ''}" aria-label="${I.label}, ${I.unit}"><i>${I.unit}</i></span></label>`; }).join('');
  $('wheelLimits').querySelectorAll('input').forEach((el) => { el.onchange = () => { const t = {}; $('wheelLimits').querySelectorAll('input').forEach((x) => { t[x.dataset.wl] = x.value; }); saveWheelLimits(t); }; });
}
function saveLimits() {
  const t = {}; $('limits').querySelectorAll('input').forEach((el) => { t[el.dataset.limit] = el.value; });
  A.saveThresholds(t);
  renderHomeLists();
}
async function renderHomeLists() { const list = await allAnalyses(); renderRecent(list); }

async function renderChecks() {
  const rows = [], add = (state, title, text) => rows.push(`<li class="${state}"><b>${state === 'ok' ? '✓' : '!'}</b><span>${title}<small>${text}</small></span></li>`);
  const brands = navigator.userAgentData?.brands?.map((b) => b.brand).join(' ') ?? navigator.userAgent;
  const chromium = /Chrome|Chromium|Edg/.test(brands);
  add(chromium || LAB.isIOS ? 'ok' : 'warn', 'Browser', LAB.isIOS ? 'Va bene per Corsa e per Accosciate e braccia.' : chromium ? 'Chrome o Edge: va bene.' : 'Apri il programma con Chrome o Edge: gli altri browser non hanno tutto ciò che serve.');
  let cams = null;
  try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length; } catch { /* non disponibili */ }
  add(cams ? 'ok' : 'warn', LAB.isPhone ? 'Fotocamera' : 'Webcam', cams == null ? 'Non disponibile in questa pagina.' : cams ? (LAB.isPhone ? 'Trovata. Il browser chiede il permesso al primo uso.' : `${cams === 1 ? 'Una webcam trovata' : `${cams} webcam trovate`}.`) : 'Nessuna trovata. Puoi comunque analizzare file video.');
  const head = async (p) => { try { return (await fetch(p, { method: 'HEAD' })).ok; } catch { return false; } };
  const offline = LAB.isWeb ? false : (await Promise.all(['vendor/vision_bundle.mjs', 'vendor/wasm/vision_wasm_internal.wasm', 'vendor/pose_landmarker_full.task', 'vendor/pose_landmarker_lite.task'].map(head))).every(Boolean);
  let cached = false;
  if (LAB.isWeb) { try { cached = (await (await caches.open('lab-engine-0.10.14')).keys()).length >= 3; } catch { /* cache non disponibile */ } }
  if (LAB.isWeb) add('ok', 'Riconoscimento della posa', cached ? 'Già scaricato: funziona anche senza Internet.' : 'Si scarica alla prima ripresa, qualche decina di MB: la prima volta serve Internet.');
  else add(offline ? 'ok' : 'warn', 'Riconoscimento della posa', offline ? 'Installato: funziona anche senza Internet.' : 'File non ancora scaricati: serve Internet. Riavvia il programma con la rete attiva per installarli.');
  if (navigator.hid) {
    let authorized = false;
    try { authorized = (await navigator.hid.getDevices()).some((d) => d.vendorId === 0x057e); } catch { /* elenco non disponibile */ }
    add('ok', 'Balance Board', authorized ? 'Già autorizzata in questo browser.' : 'Il browser può collegarla. La prima volta usa “Abbina Balance Board” nella cartella del programma.');
  } else add('warn', 'Balance Board', LAB.isPhone ? 'Da qui non si collega: l’esame si fa da PC o tablet Windows. Puoi vedere i report importati.' : 'Questo browser non può collegarla: serve Chrome o Edge su Windows.');
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
    const e = await navigator.storage?.estimate?.();
    if (e?.usage != null) add('ok', 'Spazio per l’archivio', `In uso ${it(e.usage / 1e6)} MB${e.quota ? ` su circa ${it(e.quota / 1e9)} GB disponibili` : ''}.`);
  } catch { /* dato non disponibile */ }
  $('checks').innerHTML = rows.join('');
}

async function chooseClient() {
  const name = cleanName($('c_name').value);
  if (!name) { LAB.setClient({}); $('c_birth').value = ''; $('c_height').value = ''; updateClientHint(await clientList()); return; }
  // Cambiando persona non restano anno e altezza della precedente. Si fa subito, prima di leggere l'archivio:
  // la lettura può richiedere tempo e nel frattempo si può già scrivere nei campi successivi.
  const prev = LAB.client();
  if (normName(prev.name) !== normName(name)) {
    if ($('c_birth').value === String(prev.birth ?? '')) $('c_birth').value = '';
    if ($('c_height').value === String(prev.height ?? '')) $('c_height').value = '';
  }
  LAB.setClient({ name, birth: $('c_birth').value, height: $('c_height').value });
  const list = await clientList(), known = list.find((x) => x.key === normName(name));
  if (known && normName($('c_name').value) === known.key) {
    $('c_name').value = known.name;
    if (!$('c_birth').value) $('c_birth').value = known.birth ?? '';
    if (!$('c_height').value) $('c_height').value = known.height ?? '';
    LAB.setClient({ name: known.name, birth: $('c_birth').value, height: $('c_height').value });
  }
  updateClientHint(list);
}
function bindHome() {
  $('clientForm').onsubmit = (e) => { e.preventDefault(); chooseClient(); };
  $('c_name').addEventListener('change', chooseClient);
  $('c_birth').addEventListener('change', chooseClient);
  $('c_height').addEventListener('change', chooseClient);
  $('newClient').onclick = async () => { for (const id of ['c_name', 'c_birth', 'c_height']) $(id).value = ''; LAB.setClient({}); updateClientHint(await clientList()); $('c_name').focus(); };
  $('resetLimits').onclick = () => { A.saveThresholds({ ...A.DEFAULTS }); renderLimits(); renderHomeLists(); };
  $('resetWheelLimits').onclick = () => { saveWheelLimits({ ...WHEEL_DEFAULTS }); renderWheelLimits(); };
  $('studioName').addEventListener('input', (e) => LAB.setStudio(e.target.value));
  $('exportAll').onclick = doExport;
  $('importFile').onchange = doImport;
}
async function doExport(e) {
  const btn = e.currentTarget, msg = $('backupMsg');
  btn.disabled = true; msg.textContent = 'Preparo il file…';
  try {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `movement-lab-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    lsSet(LAST_BACKUP, String(Date.now()));
    msg.textContent = `File salvato nella cartella dei download (${it(blob.size / 1e6, 1)} MB).`;
    renderBackupState(await allAnalyses());
  } catch (err) { msg.textContent = `Copia non riuscita: ${err.message}`; }
  btn.disabled = false;
}
async function doImport(e) {
  const f = e.target.files[0], msg = $('backupMsg'); if (!f) return;
  msg.textContent = 'Importo…';
  try {
    const r = await importAny(JSON.parse(await f.text()));
    const parts = [r.corsa ? `${r.corsa} di corsa` : null, r.movimento ? `${r.movimento} di accosciate e braccia` : null, r.stabilometria ? `${r.stabilometria} di stabilometria` : null].filter(Boolean);
    msg.textContent = parts.length ? `Importate: ${parts.join(', ')}.` : 'Importati i dati dei clienti.';
    await renderHome();
  } catch { msg.textContent = 'Questo file non è una copia di Movement Lab né un archivio delle app precedenti.'; }
  e.target.value = '';
}

/* ---------- elenco clienti ---------- */
async function renderClients() {
  const root = $('clienti');
  const analyses = await allAnalyses(), clients = await clientList(analyses), unnamed = await unnamedAnalyses(analyses);
  const rowOf = (c) => {
    const last = {}; for (const a of c.analyses) last[a.mod] ??= a;
    const flags = Object.values(last).flatMap((a) => A.countFlags(a.mod, a.doc));
    return `<tr data-name="${esc(c.key)}"><th scope="row"><a href="#cliente/${encodeURIComponent(c.name)}">${esc(c.name)}</a></th><td class="n">${esc(c.birth) || '–'}</td><td class="n">${esc(c.height) || '–'}</td><td class="n">${c.counts.corsa || '–'}</td><td class="n">${c.counts.movimento || '–'}</td><td class="n">${c.counts.stabilometria || '–'}</td><td class="n nowrap">${c.last ? day(c.last) : '–'}</td><td class="n">${flagBadge(flags)}</td></tr>`;
  };
  root.innerHTML = `<div class="wide"><header class="rep-head"><h1>Clienti</h1><div class="rep-actions no-print"><label>Cerca <input id="clientSearch" type="search" autocomplete="off"></label></div></header>
    ${clients.length ? `<div class="tablewrap"><table class="metrics" id="clientTable"><thead><tr><th>Nome</th><th class="n">Nascita</th><th class="n">Altezza</th><th class="n">Corsa</th><th class="n">Accosciate e braccia</th><th class="n">Stabilometria</th><th class="n">Ultima analisi</th><th class="n">Asimmetrie</th></tr></thead><tbody>${clients.map(rowOf).join('')}</tbody></table></div>
      <p class="fine">La colonna Asimmetrie conta le segnalazioni nell’ultima analisi di ciascun programma.</p>` : '<p class="empty">Non ci sono ancora clienti. Scrivi un nome nella <a href="#home">pagina principale</a> e fai la prima analisi.</p>'}
    ${unnamed.length ? `<h2 class="sub">Analisi senza nome</h2><ul class="plain">${unnamed.map((a) => `<li><a href="${reportHref(a)}">${MODULE_NAMES[a.mod]}, ${dayTime(a.at)}</a>${isSim(a) ? ' <span class="u">simulazione</span>' : ''}</li>`).join('')}</ul>` : ''}</div>`;
  const search = root.querySelector('#clientSearch');
  if (search) search.oninput = () => { const q = normName(search.value); root.querySelectorAll('#clientTable tbody tr').forEach((r) => { r.hidden = q && !r.dataset.name.includes(q); }); };
}

/* ---------- scheda cliente ---------- */
const diffCell = (p, unit, d = 0) => (p ? (p.level ? `<span class="asym lv${p.level}">${A.mark(p.level)} ${it(p.diff, d)}${unit}</span><span class="asym-note">più ${p.side === 'L' ? 'a sinistra' : 'a destra'}</span>` : `${it(p.diff, d)}${unit}`) : '–');
function corsaTable(list) {
  const body = list.map((a) => {
    const V = a.doc.views ?? {}, side = V.side?.metrics, fr = (V.rear ?? V.front)?.metrics, val = (m, k) => m?.[k]?.mean;
    const drop = A.corsaPair(fr, 'drop', 1), valg = A.corsaPair(fr, 'valgus', 1), step = A.corsaPair(fr, 'stepTime', 1);
    return `<tr><th scope="row"><a href="${reportHref(a)}">${day(a.at)}</a>${a.doc.simulated ? '<br><span class="u">simulazione</span>' : ''}</th><td class="n">${esc(a.doc.speed) || '–'}</td><td class="n">${it(val(side ?? fr, 'cadence'))}</td><td class="n">${it(val(side, 'contact'))}</td><td class="n">${it(val(side, 'overstride'))}</td>
      <td class="n">${it(val(fr, 'drop_L'), 1)} / ${it(val(fr, 'drop_R'), 1)}</td><td class="n">${diffCell(drop, '°', 1)}</td><td class="n">${it(val(fr, 'valgus_L'), 1)} / ${it(val(fr, 'valgus_R'), 1)}</td><td class="n">${diffCell(valg, '°', 1)}</td><td class="n">${diffCell(step, '%', 1)}</td></tr>`;
  }).join('');
  return `<section class="sheet-sec"><h2>Corsa</h2><div class="tablewrap"><table class="metrics"><thead><tr><th>Data</th><th class="n">km/h</th><th class="n">Cadenza</th><th class="n">Contatto ms</th><th class="n">Tallone avanti % gamba</th><th class="n">Bacino sin / des °</th><th class="n">Differenza</th><th class="n">Valgo sin / des °</th><th class="n">Differenza</th><th class="n">Differenza nel tempo del passo</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}
function primaryOf(set) {
  const M = set.summary?.metrics ?? {}, keys = Object.keys(set.summary?.trace ?? {}).filter((k) => M[k]);
  if (keys.length >= 2 && keys[0].endsWith('_L')) {
    const l = M[keys[0]], r = M[keys[1]], p = A.movimentoPair(l, r, keys[0].slice(0, -2));
    return { label: l.label, value: `${it(l.peakMean, l.d)} / ${it(r.peakMean, r.d)}${l.unit === '°' ? '°' : ` ${esc(l.unit)}`} <span class="u">sin / des</span>`, diff: diffCell(p, l.unit === '°' ? '°' : ` ${esc(l.unit)}`, l.d ?? 0) };
  }
  const id = keys[0], m = M[id];
  if (!m) return { label: '', value: '–', diff: '' };
  return { label: m.label, value: m.peakMean == null ? '–' : `${it(m.peakMean, m.d)}${m.unit === '°' ? '°' : ` ${esc(m.unit)}`}`, diff: '' };
}
function movimentoTable(list) {
  const rows = [];
  for (const a of list) {
    for (const set of a.doc.sets) {
      const P = primaryOf(set), near = ['flex', 'ext', 'rot', 'elbow', 'wrist'].includes(set.protocolId) ? set.summary?.near : set.summary?.work;
      rows.push(`<tr><th scope="row"><a href="${reportHref(a)}">${day(set.createdAt ?? a.at)}</a>${set.simulated ? '<br><span class="u">simulazione</span>' : ''}</th><td>${esc(set.name)}<br><span class="u">vista ${VIEW[set.view] ?? ''}${set.view === 'side' && near ? `, lato ${near === 'L' ? 'sinistro' : 'destro'}` : ''}${set.load ? `, ${esc(set.load)} kg` : ''}</span></td><td class="n">${set.summary?.reps?.length ?? 0}</td><td>${esc(P.label)}</td><td class="n">${P.value}</td><td class="n">${P.diff}</td></tr>`);
    }
    for (const r of A.movimentoCross(a.doc)) {
      const setL = a.doc.sets.find((s) => s.id === r.setL);
      if (Object.keys(setL?.summary?.trace ?? {})[0] !== r.metric) continue;
      const u = r.unit === '°' ? '°' : ` ${esc(r.unit)}`;
      rows.push(`<tr class="cross-row"><th scope="row"><a href="${reportHref(a)}">${day(a.at)}</a></th><td>${esc(r.title)}<br><span class="u">una serie per lato</span></td><td class="n"></td><td>${esc(r.label)}</td><td class="n">${it(r.a, r.d)} / ${it(r.b, r.d)}${u} <span class="u">sin / des</span></td><td class="n">${diffCell(r, u, r.d)}</td></tr>`);
    }
  }
  return `<section class="sheet-sec"><h2>Accosciate e braccia</h2><div class="tablewrap"><table class="metrics"><thead><tr><th>Data</th><th>Esercizio</th><th class="n">Rip.</th><th>Misura al punto massimo</th><th class="n">Valore</th><th class="n">Differenza</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
}
function stabiloTable(list) {
  const rows = list.flatMap((a) => {
    const lines = a.doc.tests.map((t) => {
      const L = t.m.loads, p = A.loadPair(L);
      return `<tr><th scope="row"><a href="${reportHref(a)}">${day(a.at)}</a>${a.doc.simulated ? '<br><span class="u">simulazione</span>' : ''}</th><td>${esc(t.label)}</td><td class="n">${L ? `${it(L.left)}% / ${it(L.right)}%` : '–'}</td><td class="n">${L ? diffCell(p, ' punti') : '–'}</td><td class="n">${L ? `${it(L.fore)}% / ${it(L.rear)}%` : '–'}</td><td class="n">${it(t.m.length)}</td><td class="n">${it(t.m.area)}</td></tr>`;
    });
    const sl = A.singleLegPair(a.doc.tests);
    if (sl) { const p = A.pairPercent(sl.L.m.length, sl.R.m.length, 0, A.thresholds().sway); lines.push(`<tr class="cross-row"><th scope="row"><a href="${reportHref(a)}">${day(a.at)}</a></th><td>Percorso su un piede, sinistro e destro</td><td class="n" colspan="2">${diffCell(p, '%')}</td><td></td><td class="n">${it(sl.L.m.length)} / ${it(sl.R.m.length)}</td><td></td></tr>`); }
    return lines;
  });
  return `<section class="sheet-sec"><h2>Stabilometria</h2><div class="tablewrap"><table class="metrics"><thead><tr><th>Data</th><th>Prova</th><th class="n">Carico sin / des</th><th class="n">Differenza</th><th class="n">Avampiede / retropiede</th><th class="n">Percorso mm</th><th class="n">Area mm²</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
}
async function renderSheet(rawName) {
  const root = $('cliente');
  const name = decodeURIComponent(rawName ?? ''), key = normName(name);
  const analyses = await allAnalyses(), all = await clientList(analyses), c = all.find((x) => x.key === key);
  if (!c) { root.innerHTML = `<p class="empty">Nessun dato per ${esc(name)}. <a href="#clienti">Apri l’elenco dei clienti</a></p>`; return; }
  const byMod = (m) => c.analyses.filter((a) => a.mod === m);
  const latest = {}; for (const a of c.analyses) latest[a.mod] ??= a;
  const flags = Object.values(latest).flatMap((a) => A.countFlags(a.mod, a.doc).map((f) => ({ ...f, label: `${MODULE_NAMES[a.mod]}, ${day(a.at)}. ${f.label}` })));
  const usedKeys = [...new Set(Object.keys(latest).flatMap((m) => (m === 'corsa' ? A.CORSA_KEYS : m === 'movimento' ? A.MOVIMENTO_KEYS : A.STABILO_KEYS)))];
  const facts = [c.birth ? `Nato/a nel ${esc(c.birth)}` : null, c.height ? `${esc(c.height)} cm` : null].filter(Boolean).join(', ');
  const isCurrent = normName(LAB.client().name) === key;
  root.innerHTML = `<div class="wide report-sheet">
    <div class="rep-actions no-print sheet-actions">
      <button id="printSheet" class="primary">Stampa o salva PDF</button>
      <button id="useClient" ${isCurrent ? 'disabled' : ''}>${isCurrent ? 'È il cliente attuale' : 'Usa come cliente attuale'}</button>
      <button id="renameBtn">Correggi il nome</button>
      <form id="renameForm" hidden><label>Nuovo nome <input id="renameInput" value="${esc(c.name)}" autocomplete="off"></label><button class="primary">Salva</button></form>
      <button id="deleteBtn" class="quiet">Elimina tutti i dati del cliente</button>
    </div>
    <header class="rep-head"><div><div class="studio-line">${esc(LAB.studio())}</div><h1>${esc(c.name)}</h1><p>${facts ? `${facts}. ` : ''}Scheda stampata il ${day(Date.now())}.</p></div></header>
    ${c.analyses.length ? A.sectionHtml(flags, usedKeys, { title: 'Asimmetrie nelle ultime analisi', emptyText: 'Nessuna differenza oltre le soglie nell’ultima analisi di ciascun programma.' }) : ''}
    ${byMod('corsa').length ? corsaTable(byMod('corsa')) : ''}
    ${byMod('movimento').length ? movimentoTable(byMod('movimento')) : ''}
    ${byMod('stabilometria').length ? stabiloTable(byMod('stabilometria')) : ''}
    ${c.analyses.length ? '<p class="fine disclaimer">Stime da video 2D e da pedana con 4 sensori, utili per seguire la stessa persona nel tempo con lo stesso protocollo. Non sono misure di laboratorio e non costituiscono una diagnosi. Ogni data apre il report completo.</p>' : '<p class="empty">Nessuna analisi salvata per questo cliente.</p>'}
  </div>`;
  root.querySelector('#printSheet').onclick = () => print();
  root.querySelector('#useClient').onclick = () => { LAB.setClient({ name: c.name, birth: c.birth, height: c.height }); renderSheet(rawName); };
  root.querySelector('#renameBtn').onclick = (e) => { e.currentTarget.hidden = true; const f = root.querySelector('#renameForm'); f.hidden = false; root.querySelector('#renameInput').select(); };
  root.querySelector('#renameForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = cleanName(root.querySelector('#renameInput').value); if (!v) return;
    await renameClient(c.name, v);
    if (isCurrent) LAB.setClient({ name: v, birth: c.birth, height: c.height });
    location.hash = `#cliente/${encodeURIComponent(v)}`;
  };
  root.querySelector('#deleteBtn').onclick = async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = !c.analyses.length ? `Conferma: elimina ${c.name}` : `Conferma: elimina ${c.analyses.length === 1 ? 'una analisi' : `${c.analyses.length} analisi`} di ${c.name}`; return; }
    await deleteClient(c.name);
    if (isCurrent) LAB.setClient({});
    location.hash = '#clienti';
  };
}

/* ---------- navigazione ---------- */
const PAGES = ['home', 'clienti', 'cliente', 'aiuto'];
async function route() {
  const [page, arg] = (location.hash.slice(1) || 'home').split('/');
  const anchor = page === 'backup' || page === 'soglie' ? page : null;
  const show = PAGES.includes(page) ? page : 'home';
  for (const p of PAGES) $(p).hidden = p !== show;
  document.title = show === 'cliente' && arg ? `${decodeURIComponent(arg)}, Movement Lab` : 'Movement Lab';
  document.querySelectorAll('.labbar nav a').forEach((a) => { if (a.hash === `#${show}` || (a.hash === '#clienti' && show === 'cliente')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (show === 'home') await renderHome();
  if (show === 'clienti') await renderClients();
  if (show === 'cliente') await renderSheet(arg);
  if (anchor) $(anchor).scrollIntoView(); else scrollTo(0, 0);
}
bindHome();
addEventListener('hashchange', route);
route();
