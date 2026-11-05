// Report stampabile e archivio.
import { ZONE_NAMES, rombergOf, FS, LOWPASS_HZ } from './signal.js';
import { plateFigure, swayFigure, timeFigure, bindTimeFigures } from './figure.js';
import { allExams, getExam, saveExam, deleteExam } from './store.js';
import { stabiloFlags, loadPair, pairPercent, singleLegPair, sectionHtml, thresholds, mark, sideWord, STABILO_KEYS } from '../asym.js';

export const it = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = (ms) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// Nelle stampe in grigio i colori si confondono: ogni prova ha anche un tratto diverso, in multipli dello spessore della linea.
export const TEST_COLORS = { eo: '#1b3a8c', ec: '#12a08b', eoF: '#7a4fd3', ecF: '#d0529f', slL: '#8a6a00', slR: '#6a7686' };
export const TEST_DASH = { eo: [], ec: [4, 2.5], eoF: [1, 2], ecF: [6, 2, 1, 2], slL: [8, 3], slR: [1, 3.5] };
const ROWS = [['Lunghezza del percorso', 'length', 'mm', 0], ['Velocità media', 'velocity', 'mm/s', 1], ['Velocità laterale', 'velX', 'mm/s', 1], ['Velocità avanti-dietro', 'velY', 'mm/s', 1], ['Area dell’ellisse al 95%', 'area', 'mm²', 0], ['Escursione laterale', 'rangeX', 'mm', 1], ['Escursione avanti-dietro', 'rangeY', 'mm', 1], ['Centro medio, laterale (+ destra)', 'meanX', 'mm', 1], ['Centro medio, avanti-dietro (+ avanti)', 'meanY', 'mm', 1], ['Peso medio', 'weight', 'kg', 1]];

function summary(exam, main, romberg) {
  const out = [], L = main?.m.loads;
  if (L) {
    const p = loadPair(L), flag = p?.level ? `<span class="asym lv${p.level}">${mark(p.level)}</span> ` : '';
    out.push(p.diff < 4 ? `<b>Carico simile</b> tra i due piedi: sinistro ${it(L.left)}%, destro ${it(L.right)}%.` : `${flag}<b>Carico maggiore a ${L.left > L.right ? 'sinistra' : 'destra'}:</b> sinistro ${it(L.left)}%, destro ${it(L.right)}%, differenza ${it(p.diff)} punti.`);
    out.push(`<b>Avanti e dietro:</b> avampiede ${it(L.fore)}%, retropiede ${it(L.rear)}%.`);
    out.push(`<b>Zona più caricata:</b> ${ZONE_NAMES[L.top]}, ${it(L.zones[L.top])}% del peso.`);
  }
  if (main) out.push(`<b>Centro di pressione medio:</b> ${it(Math.abs(main.m.meanX), 0)} mm a ${main.m.meanX < 0 ? 'sinistra' : 'destra'} e ${it(Math.abs(main.m.meanY), 0)} mm ${main.m.meanY < 0 ? 'indietro' : 'avanti'} rispetto al centro della pedana.`);
  if (romberg) out.push(`<b>Con gli occhi chiusi:</b> percorso ${it(romberg.length, 2)} volte, area ${it(romberg.area, 2)} volte rispetto agli occhi aperti.`);
  return out;
}
function diffCell(p) {
  if (!p) return '–';
  return p.level ? `<span class="asym lv${p.level}">${mark(p.level)} ${it(p.diff)}</span>` : it(p.diff);
}
function singleLegTable(tests) {
  const sl = singleLegPair(tests);
  if (!sl) return '';
  const path = pairPercent(sl.L.m.length, sl.R.m.length, 0, thresholds().sway), area = pairPercent(sl.L.m.area, sl.R.m.area, 0, null), vel = pairPercent(sl.L.m.velocity, sl.R.m.velocity, 0, null);
  const row = (label, unit, a, b, d, p, flagged) => `<tr><th scope="row">${label} <span class="u">${unit}</span></th><td class="n">${it(a, d)}</td><td class="n">${it(b, d)}</td><td class="n">${flagged && p?.level ? `<span class="asym lv${p.level}">${mark(p.level)} ${it(p.diff)}%</span><span class="asym-note">maggiore a ${sideWord(p.side)}</span>` : `${it(p?.diff)}%`}</td></tr>`;
  return `<section><h2>Confronto su un piede</h2><div class="tablewrap"><table class="metrics"><thead><tr><th>Misura</th><th class="n">Solo sinistro</th><th class="n">Solo destro</th><th class="n">Differenza</th></tr></thead><tbody>
    ${row('Lunghezza del percorso', 'mm', sl.L.m.length, sl.R.m.length, 0, path, true)}${row('Velocità media', 'mm/s', sl.L.m.velocity, sl.R.m.velocity, 1, vel, false)}${row('Area dell’ellisse al 95%', 'mm²', sl.L.m.area, sl.R.m.area, 0, area, false)}</tbody></table></div>
    <p class="fine">La differenza è in percentuale sulla media dei due piedi. Si segnala solo il percorso: l’area cambia molto da una prova all’altra.</p></section>`;
}
const delta = (a, b, d) => { if (a == null || b == null) return ''; const x = a - b; return ` <span class="delta">(${x > 0 ? '+' : ''}${it(x, d)})</span>`; };

export async function renderReport(root, id, cmpId = null) {
  const exam = await getExam(id);
  if (!exam) { root.innerHTML = '<p class="empty">Questo esame non è più in archivio. <a href="#archivio">Apri l’archivio</a></p>'; return; }
  const others = (await allExams()).filter((o) => o.id !== exam.id && (o.client?.name || '') === (exam.client?.name || '') && o.tests?.length);
  const prev = cmpId ? await getExam(cmpId) : null;
  const tests = exam.tests.map((t) => ({ ...t, color: TEST_COLORS[t.kind] ?? '#55606e', dash: TEST_DASH[t.kind] ?? [] }));
  const eo = tests.filter((t) => t.kind === 'eo').at(-1), ec = tests.filter((t) => t.kind === 'ec').at(-1);
  const main = eo ?? tests.find((t) => t.m.loads) ?? tests[0];
  const romberg = eo && ec ? rombergOf(eo.m, ec.m) : null;
  const priorOf = (t) => prev?.tests?.filter((p) => p.kind === t.kind).at(-1)?.m;
  const studio = window.LAB.studio();
  const cols = tests.map((t) => `<th class="n"><i class="dot" style="background:${t.color}"></i>${esc(t.label)}</th>`).join('') + (romberg ? '<th class="n">Occhi chiusi su aperti</th>' : '');
  const metricRows = ROWS.map(([label, key, unit, d]) => `<tr><th scope="row">${label} <span class="u">${unit}</span></th>${tests.map((t) => `<td class="n">${it(t.m[key], d)}${delta(t.m[key], priorOf(t)?.[key], d)}</td>`).join('')}${romberg ? `<td class="n">${romberg[key] != null ? it(romberg[key], 2) : ''}</td>` : ''}</tr>`).join('');
  const loadTests = tests.filter((t) => t.m.loads);
  const loadRows = loadTests.map((t) => { const L = t.m.loads, P = priorOf(t)?.loads; return `<tr><th scope="row"><i class="dot" style="background:${t.color}"></i>${esc(t.label)}</th><td class="n">${it(L.left)}%${delta(L.left, P?.left, 0)}</td><td class="n">${it(L.right)}%${delta(L.right, P?.right, 0)}</td><td class="n">${diffCell(loadPair(L))}</td><td class="n">${it(L.fore)}%${delta(L.fore, P?.fore, 0)}</td><td class="n">${it(L.rear)}%${delta(L.rear, P?.rear, 0)}</td><td>${ZONE_NAMES[L.top]}</td></tr>`; }).join('');
  const warnings = tests.flatMap((t) => t.m.warnings.map((w) => `${t.label}: ${w}`));
  const placeText = exam.placement?.method === 'guided' ? 'Posizione dei piedi misurata con il cliente sulla pedana.' : `Posizione dei piedi dalle misure inserite: ${it(Math.abs(exam.placement?.xR - exam.placement?.xL) / 10)} cm tra i centri dei piedi, piede di ${it((exam.placement?.footLen ?? 0) / 10)} cm.`;
  root.innerHTML = `<div class="report">
    <div class="rep-actions no-print">
      <label>Nome dello studio, stampato sul report <input id="studio" value="${esc(studio)}"></label>
      <label>Confronta con <select id="cmp"><option value="">Nessun esame</option>${others.map((o) => `<option value="${o.id}" ${String(o.id) === String(cmpId) ? 'selected' : ''}>${fmtDate(o.createdAt)}</option>`).join('')}</select></label>
      <button id="print" class="primary">Stampa o salva PDF</button><button id="csv">Esporta CSV</button><a class="btn" href="#archivio">Archivio</a>
    </div>
    <header class="rep-head"><div class="studio-name" id="studioOut">${esc(studio)}</div><h1>Analisi stabilometrica</h1>
      <p><b>${esc(exam.client?.name || 'Cliente non indicato')}</b>${exam.client?.birth ? `, nato/a nel ${esc(exam.client.birth)}` : ''}${exam.client?.height ? `, ${esc(exam.client.height)} cm` : ''}, ${it(main?.m.weight, 1)} kg. ${fmtDate(exam.createdAt)}.</p></header>
    ${exam.simulated ? '<p class="sim-banner">Esame simulato: i dati vengono da un cliente virtuale, non da una persona.</p>' : ''}
    <section class="rep-top">
      <div><h2>Appoggio sui piedi</h2>${main?.m.loads ? plateFigure({ placement: exam.placement, loads: main.m.loads, cop: { x: main.m.meanX, y: main.m.meanY } }) : '<p class="fine">Per le zone serve una prova in appoggio su due piedi.</p>'}
        ${main?.m.loads ? `<p class="fine">Prova: ${esc(main.label)}. Più il colore è scuro, più la zona è caricata. La croce è il centro di pressione medio. <b>Zone stimate da 4 sensori agli angoli della pedana: non è una mappa di pressione del piede.</b></p>` : ''}</div>
      <div><h2>Oscillazione</h2>${swayFigure(tests)}</div>
    </section>
    ${sectionHtml(stabiloFlags(exam), STABILO_KEYS)}
    <section class="sum"><h2>In sintesi</h2><ul>${summary(exam, main, romberg).map((s) => `<li>${s}</li>`).join('')}</ul></section>
    ${warnings.length ? `<section class="warn"><h2>Da controllare</h2><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>` : ''}
    ${loadRows ? `<section><h2>Distribuzione del carico</h2><div class="tablewrap"><table class="metrics"><thead><tr><th>Prova</th><th class="n">Sinistro</th><th class="n">Destro</th><th class="n">Differenza, punti</th><th class="n">Avampiede</th><th class="n">Retropiede</th><th>Zona più caricata</th></tr></thead><tbody>${loadRows}</tbody></table></div></section>` : ''}
    ${singleLegTable(tests)}
    <section><h2>Parametri stabilometrici</h2><div class="tablewrap"><table class="metrics"><thead><tr><th>Misura</th>${cols}</tr></thead><tbody>${metricRows}</tbody></table></div>
      ${prev ? `<p class="fine">Tra parentesi la differenza rispetto all’esame del ${fmtDate(prev.createdAt)}.</p>` : ''}</section>
    <section class="times"><h2>Andamento nel tempo</h2>${tests.map(timeFigure).join('')}</section>
    <section><h2>Note</h2><div id="notes" class="notes" contenteditable="true" role="textbox" aria-label="Note dell’esame" data-empty="Scrivi qui le tue osservazioni">${esc(exam.notes ?? '')}</div></section>
    <section class="method"><h2>Come sono stati ottenuti i dati</h2>
      <p>Wii Balance Board con 4 sensori di carico. ${placeText} Durata delle prove: ${[...new Set(tests.map((t) => `${it(t.m.durationS)} s`))].join(', ')}. Dati ricevuti: circa ${it(main?.m.rateIn)} al secondo, riportati a ${FS} al secondo e filtrati a ${LOWPASS_HZ} Hz, sempre nello stesso modo.</p>
      <p>La pedana misura il peso totale e il centro di pressione. La ripartizione tra i piedi e tra avampiede e retropiede è una stima che dipende dalla posizione dei piedi, e le quattro zone combinano le due ripartizioni. Le misure sono utili per seguire la stessa persona nel tempo con lo stesso protocollo. La pedana non equivale a una piattaforma di laboratorio e questo report non costituisce una diagnosi.</p></section>
  </div>`;
  root.querySelector('#print').onclick = () => print();
  root.querySelector('#cmp').onchange = (e) => { location.hash = `#report/${exam.id}${e.target.value ? `/${e.target.value}` : ''}`; };
  root.querySelector('#studio').oninput = (e) => { root.querySelector('#studioOut').textContent = e.target.value; window.LAB.setStudio(e.target.value); };
  root.querySelector('#notes').onblur = async (e) => { exam.notes = e.target.innerText.trim(); await saveExam(exam); };
  root.querySelector('#csv').onclick = () => download(new Blob(['﻿', csvOf(exam)], { type: 'text/csv;charset=utf-8' }), `stabilometria-${(exam.client?.name || 'cliente').replace(/\s+/g, '-').toLowerCase()}-${new Date(exam.createdAt).toISOString().slice(0, 10)}.csv`);
  bindTimeFigures(root);
}
function csvOf(exam) {
  const rows = [`Prova;Misura;Valore;Unità`];
  for (const t of exam.tests) {
    for (const [label, key, unit, d] of ROWS) rows.push(`${t.label};${label};${it(t.m[key], d).replace(/\./g, '')};${unit}`);
    if (t.m.loads) { const L = t.m.loads; for (const [k, v] of [['Sinistro', L.left], ['Destro', L.right], ['Avampiede', L.fore], ['Retropiede', L.rear], ['Avampiede sinistro', L.zones.LF], ['Avampiede destro', L.zones.RF], ['Retropiede sinistro', L.zones.LR], ['Retropiede destro', L.zones.RR]]) rows.push(`${t.label};${k};${it(v, 1)};%`); }
    for (const [k, v] of Object.entries(t.m.corners)) rows.push(`${t.label};Sensore ${({ tl: 'avanti sinistra', tr: 'avanti destra', bl: 'dietro sinistra', br: 'dietro destra' })[k]};${it(v, 2)};kg`);
  }
  return rows.join('\r\n');
}
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
export async function renderArchive(root) {
  const list = (await allExams()).filter((e) => e.tests?.length);
  root.innerHTML = `<div class="archive"><header class="rep-head"><h1>Archivio</h1><div class="rep-actions"><a class="btn" href="../#backup">Copia di sicurezza</a></div></header>
    ${list.length ? `<div class="tablewrap"><table class="metrics"><thead><tr><th>Cliente</th><th>Data</th><th>Prove</th><th></th></tr></thead><tbody>${list.map((e) => `<tr><th scope="row"><a href="#report/${e.id}">${esc(e.client?.name || 'Non indicato')}</a>${e.simulated ? ' <span class="u">simulato</span>' : ''}</th><td>${fmtDate(e.createdAt)}</td><td>${e.tests.map((t) => esc(t.label)).join(', ')}</td><td class="n"><button class="quiet" data-del="${e.id}">Elimina</button></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">Gli esami salvati compariranno qui.</p>'}
    <p class="fine">Gli esami restano solo in questo browser su questo dispositivo. La copia di sicurezza si fa dalla pagina principale.</p></div>`;
  root.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (b.dataset.armed) { await deleteExam(b.dataset.del); renderArchive(root); return; } b.dataset.armed = '1'; b.textContent = 'Conferma eliminazione'; }; });
}
