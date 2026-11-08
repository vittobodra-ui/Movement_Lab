// Referto di una sessione e archivio.
import { allSessions, getSession, deleteSession, saveSession } from './movimento-store.js';
import { VIEW_NAMES, protocolById } from './movimento-measure.js';
import { movimentoFlags, movimentoPair, movimentoSigned, movimentoCross, sectionHtml, mark, sideWord, MOVIMENTO_KEYS } from './asym.js';
import { setErrorsHtml } from './movimento-errori.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const it = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtDate = (ms) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const sec = (ms) => (ms == null ? '–' : it(ms / 1000, 1));
export const setName = (set) => `${set.name}, vista ${VIEW_NAMES[set.view].toLowerCase()}`;

function signedCell(id, m) {
  const s = movimentoSigned(id, m);
  if (!s?.level) return '';
  return `<span class="asym lv${s.level}">${mark(s.level)}</span>${s.text ? `<span class="asym-note">${esc(s.text)}</span>` : ''}`;
}
function crossTable(s) {
  const rows = movimentoCross(s);
  if (!rows.length) return '';
  const u = (r) => (r.unit === '°' ? '°' : ` ${esc(r.unit)}`);
  return `<section class="rep-set"><h2>Sinistra e destra, una serie per lato</h2><p class="fine">Lo stesso esercizio ripreso una volta per lato. Si confronta l’ultima serie di ciascun lato, al punto massimo.</p>
    <div class="tablewrap"><table class="metrics"><thead><tr><th>Esercizio</th><th>Misura</th><th class="n">Sinistra</th><th class="n">Destra</th><th class="n">Differenza</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><th scope="row">${esc(r.title)}</th><td>${esc(r.label)}</td><td class="n">${it(r.a, r.d)}${u(r)}</td><td class="n">${it(r.b, r.d)}${u(r)}</td><td class="n">${r.level ? `<span class="asym lv${r.level}">${mark(r.level)} ${it(r.diff, r.d)}${u(r)}</span><span class="asym-note">maggiore a ${sideWord(r.side)}</span>` : `${it(r.diff, r.d)}${u(r)}`}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function metricRows(summary, prior) {
  const M = summary.metrics, P = prior?.metrics, seen = new Set(), rows = [];
  const peakCell = (m) => (m && m.peakMean != null ? `${it(m.peakMean, m.d)} <span class="sd">± ${it(m.peakSd, m.d)}</span>` : '–');
  const range = (m) => (m ? `${it(m.min, m.d)} / ${it(m.max, m.d)}` : '–');
  const delta = (a, b, d) => (a?.peakMean != null && b?.peakMean != null ? `${a.peakMean - b.peakMean > 0 ? '+' : ''}${it(a.peakMean - b.peakMean, d)}` : '–');
  for (const [id, m] of Object.entries(M)) {
    if (seen.has(id)) continue;
    if (id.endsWith('_L') || id.endsWith('_R')) {
      const base = id.slice(0, -2), l = M[`${base}_L`], r = M[`${base}_R`];
      seen.add(`${base}_L`); seen.add(`${base}_R`);
      const pr = movimentoPair(l, r, base);
      const dTxt = pr ? `${it(pr.diff, m.d)}${m.unit === '°' ? '°' : ` ${esc(m.unit)}`}` : '–';
      const diff = pr?.level ? `<span class="asym lv${pr.level}">${mark(pr.level)} ${dTxt}</span><span class="asym-note">maggiore a ${sideWord(pr.side)}</span>` : dTxt;
      rows.push(`<tr><th scope="row">${esc(m.label)} <span class="u">${esc(m.unit)}</span></th><td class="n"><i class="sw l"></i>${peakCell(l)}</td><td class="n"><i class="sw r"></i>${peakCell(r)}</td><td class="n">${diff}</td>${P ? `<td class="n">${delta(l, P[`${base}_L`], m.d)} / ${delta(r, P[`${base}_R`], m.d)}</td>` : ''}</tr>`);
    } else {
      seen.add(id);
      rows.push(`<tr><th scope="row">${esc(m.label)} <span class="u">${esc(m.unit)}</span>${m.hint ? `<br><span class="u">${esc(m.hint)}</span>` : ''}</th><td class="n" colspan="2">${peakCell(m)} <span class="u">min/max ${range(m)}</span></td><td class="n">${signedCell(id, m)}</td>${P ? `<td class="n">${delta(m, P[id], m.d)}</td>` : ''}</tr>`);
    }
  }
  return `<div class="tablewrap"><table class="metrics"><thead><tr><th>Al punto massimo, media ± DS</th><th class="n" colspan="2">${Object.keys(M).some((k) => k.endsWith('_L')) ? 'Sinistra e destra' : 'Valore'}</th><th class="n">Differenza</th>${P ? '<th class="n">Rispetto al confronto</th>' : ''}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export function repsTable(summary, spec) {
  const reps = summary.reps ?? [];
  if (!reps.length) return '<p class="fine">Nessuna ripetizione completa: restano valori minimi e massimi.</p>';
  const metric = (id) => spec.metrics.find((m) => m.id === id);
  const usesDriver = spec.perSide || spec.driver === spec.primary;
  const primary = metric(spec.primary), driver = usesDriver ? primary : metric(spec.driver);
  const unit = (m) => (m?.unit === '°' ? '°' : m?.unit ? ` ${m.unit}` : '');
  const heads = usesDriver ? [`${spec.perSide ? primary.label : primary.label}, picco`]
    : [spec.second ? `${primary.label} sin` : primary.label, ...(spec.second ? [`${metric(spec.second).label} des`] : []), `${driver.label}, picco`];
  const cells = (r) => (usesDriver ? [`${it(r.peakValue)}${unit(primary)}`]
    : [`${it(r.at?.[spec.primary], primary.d)}${unit(primary)}`, ...(spec.second ? [`${it(r.at?.[spec.second], primary.d)}${unit(primary)}`] : []), `${it(r.peakValue)}${unit(driver)}`]);
  const drift = reps.some((r) => r.drift != null);
  return `<div class="tablewrap"><table class="metrics reps"><thead><tr><th>Ripetizione</th>${heads.map((h) => `<th class="n">${esc(h)}</th>`).join('')}<th class="n">Escursione</th><th class="n">Andata, s</th><th class="n">Tenuta, s</th><th class="n">Ritorno, s</th>${drift ? '<th class="n">Traiettoria laterale, % gamba</th>' : ''}</tr></thead><tbody>
    ${reps.map((r) => `<tr><th scope="row">${r.side ? `<i class="sw ${r.side === 'L' ? 'l' : 'r'}"></i>${r.side === 'L' ? 'Sin' : 'Des'} ` : ''}${r.i}</th>${cells(r).map((c) => `<td class="n">${c}</td>`).join('')}<td class="n">${it(r.rom)}${unit(driver)}</td><td class="n">${sec(r.down)}</td><td class="n">${sec(r.hold)}</td><td class="n">${sec(r.up)}</td>${drift ? `<td class="n">${it(r.drift, 1)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

const lineSample = (cls) => `<svg class="dash-sample" width="26" height="8" aria-hidden="true"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--${cls === 'r' ? 'r' : 'l'})" stroke-width="2.5"${cls === 'r' ? ' stroke-dasharray="7 4"' : ''}/></svg>`;
function chart(set) {
  const proto = protocolById(set.protocolId, set.customSpec), spec = proto.views[set.view], tr = set.summary.trace ?? {};
  const series = [spec.primary, spec.second].filter(Boolean).map((id) => ({ id, name: id.endsWith('_L') ? 'Sinistra' : id.endsWith('_R') ? 'Destra' : null, cls: id.endsWith('_R') ? 'r' : 'l', pts: tr[id] ?? [] })).filter((s) => s.pts.length > 3);
  if (!series.length) return '';
  const W = 720, H = 170, L = 40, R = 10, T = 10, B = 24;
  const xs = series.flatMap((s) => s.pts.map((p) => p[0])), ys = series.flatMap((s) => s.pts.map((p) => p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs); let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = Math.max((y1 - y0) * 0.1, 3); y0 -= pad; y1 += pad;
  const X = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), Y = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [y0 + (y1 - y0) * 0.12, (y0 + y1) / 2, y1 - (y1 - y0) * 0.12];
  const m = spec.metrics.find((q) => q.id === spec.primary);
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span>${lineSample(s.cls)}${s.name}${s.cls === 'r' ? ' (tratteggiata)' : ''}</span>`).join('')}</div>` : '';
  const payload = esc(JSON.stringify({ series: series.map((s) => ({ name: s.name, pts: s.pts })), x0, x1, L, R, W }));
  return `<figure class="chart" data-chart="${payload}"><figcaption>${esc(m.label)} nel tempo <span class="u">gradi</span></figcaption>${legend}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.label)} nel corso della serie">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="tick">${it(v)}</text>`).join('')}
    ${series.map((s) => `<polyline fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="line ${s.cls}" points="${s.pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`).join('')}
    <line class="cross" y1="${T}" y2="${H - B}" x1="0" x2="0" style="display:none"/>
    <text x="${L}" y="${H - 6}" class="tick">0 s</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="tick">${it((x1 - x0) / 1000)} s</text></svg><div class="tip" hidden></div></figure>`;
}
export function bindCharts(root) {
  root.querySelectorAll('[data-chart]').forEach((fig) => {
    const c = JSON.parse(fig.dataset.chart), svg = fig.querySelector('svg'), cross = fig.querySelector('.cross'), tip = fig.querySelector('.tip');
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * c.W;
      const tx = c.x0 + ((vx - c.L) / (c.W - c.L - c.R)) * (c.x1 - c.x0);
      const near = (pts) => pts.reduce((a, b) => (Math.abs(b[0] - tx) < Math.abs(a[0] - tx) ? b : a));
      const first = near(c.series[0].pts), px = c.L + ((first[0] - c.x0) / (c.x1 - c.x0 || 1)) * (c.W - c.L - c.R);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.style.display = '';
      tip.innerHTML = `<b>${it(first[0] / 1000, 1)} s</b><br>${c.series.map((s) => `${s.name ? `${s.name}: ` : ''}${it(near(s.pts)[1], 1)}°`).join('<br>')}`;
      tip.hidden = false; tip.style.left = `${Math.min((px / c.W) * r.width + 10, r.width - 130)}px`;
    });
    svg.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.hidden = true; });
  });
}

// Fotogrammi: a schermo la foto, in stampa la figura scura su fondo bianco (la foto solo se richiesta).
// Della simulazione si mostra solo la figura, perché la foto è un fondo scuro con poche linee.
export function keysHtml(set) {
  const ks = (set.keyframes ?? []).filter((k) => k.ink || !set.simulated);
  if (!ks.length) return '';
  return `<div class="keys photos">${ks.map((k) => keyFig(k, !set.simulated)).join('')}</div>`;
}
export const keyFig = (k, photo = true) => `<figure class="${photo ? '' : 'ink-only'}${k.ink ? '' : ' no-ink'}">${photo ? `<img class="k-photo" src="${k.src}" alt="${esc(k.label)}">` : ''}${k.ink ? `<img class="k-ink" src="${k.ink}" alt="${esc(k.label)}, figura">` : ''}<figcaption>${esc(k.label)}</figcaption></figure>`;
const PHOTO_KEY = 'lab_mov_foto_stampa';
const photosInPrint = () => { try { return localStorage.getItem(PHOTO_KEY) === '1'; } catch { return false; } };

export async function renderReport(root, id, cmpId = null) {
  const s = await getSession(id);
  if (!s) { root.innerHTML = '<p class="empty">Questa sessione non è più in archivio. <a href="#archivio">Apri l’archivio</a></p>'; return; }
  const others = (await allSessions()).filter((o) => o.id !== s.id && (o.person || '') === (s.person || '') && o.sets?.length);
  const prev = cmpId ? await getSession(cmpId) : null;
  const priorFor = (set) => prev?.sets?.find((p) => p.protocolId === set.protocolId && p.view === set.view);
  const sim = s.sets.some((k) => k.simulated);
  const sections = s.sets.map((set) => {
    const proto = protocolById(set.protocolId, set.customSpec), spec = proto.views[set.view];
    const sm = set.summary;
    const facts = [sm.reps?.length ? `${sm.reps.length} ripetizioni` : null, `${it(sm.durationS)} s`, `${it(sm.fps)} fps`, `corpo riconosciuto nel ${it(sm.quality * 100)}% dei fotogrammi`, set.load ? `carico ${esc(set.load)} kg` : null, set.view === 'side' ? `lato misurato: ${(proto.group === 'arm' ? sm.near : sm.work) === 'L' ? 'sinistro' : 'destro'}` : null, sm.baseTilt != null ? 'bacino calibrato in piedi' : null].filter(Boolean).join(', ');
    return `<section class="rep-set"><h2>${esc(setName(set))}</h2><p class="fine">${facts}.</p>
      ${proto.estimate ? '<p class="note">Stima: questa misura è meno affidabile delle altre perché i punti coinvolti sono piccoli o sovrapposti.</p>' : ''}
      ${sm.viewWarn ? `<p class="note">${esc(sm.viewWarn)}</p>` : ''}
      ${set.note ? `<p>${esc(set.note)}</p>` : ''}
      ${setErrorsHtml(set)}
      ${metricRows(sm, priorFor(set)?.summary)}
      ${repsTable(sm, spec)}
      ${keysHtml(set)}
      ${chart(set)}
      <p class="no-print"><a class="btn" href="#result/${s.id}/${set.id}">Rivedi fotogramma per fotogramma</a></p></section>`;
  }).join('');
  root.innerHTML = `<div class="report">
    <header class="rep-head"><div><div class="studio-line">${esc(window.LAB.studio())}</div><h1>${esc(s.person || 'Analisi del movimento')}</h1><p>${fmtDate(s.createdAt)}</p></div>
      <div class="rep-actions no-print">
        <label>Confronta con <select id="cmp"><option value="">Nessuna sessione</option>${others.map((o) => `<option value="${o.id}" ${String(o.id) === String(cmpId) ? 'selected' : ''}>${fmtDate(o.createdAt)}${o.sets.some((k) => k.simulated) ? ' (simulata)' : ''}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="photosPrint"${photosInPrint() ? ' checked' : ''}> Stampa anche le foto</label>
        <button id="print" class="primary">Stampa o salva PDF</button><a class="btn" href="#archivio">Archivio</a></div></header>
    ${sim ? '<p class="sim-banner">Contiene serie simulate: quei dati vengono da un soggetto virtuale, non da una persona.</p>' : ''}
    ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}
    ${prev ? `<p class="fine">Variazioni rispetto alla sessione del ${fmtDate(prev.createdAt)}, sullo stesso esercizio e la stessa vista.</p>` : ''}
    ${s.sets.length ? sectionHtml(movimentoFlags(s), MOVIMENTO_KEYS) : ''}
    ${crossTable(s)}
    ${sections || '<p class="empty">Questa sessione non contiene serie.</p>'}
    <p class="fine disclaimer">Stime da video 2D: valide sul piano ripreso e per confrontare sessioni fatte con la stessa inquadratura. Non sono misure di laboratorio e non costituiscono una diagnosi.</p></div>`;
  root.querySelector('#print').onclick = () => print();
  const syncPhotos = () => root.querySelector('.report').classList.toggle('print-photos', root.querySelector('#photosPrint').checked);
  root.querySelector('#photosPrint').onchange = (e) => { try { localStorage.setItem(PHOTO_KEY, e.target.checked ? '1' : '0'); } catch { /* scelta non salvata */ } syncPhotos(); };
  syncPhotos();
  root.querySelector('#cmp').onchange = (e) => { location.hash = `#report/${id}${e.target.value ? `/${e.target.value}` : ''}`; };
  bindCharts(root);
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

export async function renderArchive(root) {
  const list = (await allSessions()).filter((s) => s.sets?.length);
  root.innerHTML = `<div class="archive">
    <header class="rep-head"><h1>Archivio</h1><div class="rep-actions"><a class="btn" href="index.html#backup">Copia di sicurezza</a></div></header>
    ${list.length ? `<div class="tablewrap"><table class="metrics"><thead><tr><th>Persona</th><th>Data</th><th>Serie: aprile per rivederle, modificarle o rianalizzarle</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr><th scope="row"><a href="#report/${s.id}">${esc(s.person || 'Non indicata')}</a>${s.sets.some((k) => k.simulated) ? ' <span class="u">con simulazione</span>' : ''}</th><td>${fmtDate(s.createdAt)}</td><td>${s.sets.map((k) => `<a href="#result/${s.id}/${k.id}">${esc(setName(k))}</a>`).join('<br>')}</td><td class="n"><button class="quiet" data-del="${s.id}">Elimina</button></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">Le analisi salvate compariranno qui. <a href="#home">Scegli un esercizio</a></p>'}
    <p class="fine">Le analisi restano solo in questo browser su questo dispositivo. La copia di sicurezza si fa dalla pagina principale e contiene i risultati ma non i video.</p></div>`;
  root.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
    if (b.dataset.armed) { await deleteSession(b.dataset.del); renderArchive(root); return; }
    b.dataset.armed = '1'; b.textContent = 'Conferma eliminazione';
  }; });
}
