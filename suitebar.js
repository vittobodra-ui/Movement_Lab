// Barra comune in cima a ogni programma e cliente attuale, condiviso tra le pagine.
import { saveClient, getClient, clientNames, normName, cleanName } from './data.js';

const base = new URL('./', import.meta.url).href;
const CLIENT_KEY = 'lab_client', STUDIO_KEY = 'lab_studio';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = () => { try { return JSON.parse(localStorage.getItem(CLIENT_KEY) ?? 'null') ?? {}; } catch { return {}; } };
const write = (c) => { try { localStorage.setItem(CLIENT_KEY, JSON.stringify(c)); } catch { /* non salvato */ } };

// Telefono o tablet: Corsa e Accosciate usano la versione a una camera, con comandi grandi.
const ua = navigator.userAgent;
export const isPhone = !!navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
// Online (GitHub Pages) l'app funziona anche senza rete e si può installare. Dal programma per PC non serve.
export const isWeb = location.protocol === 'https:' || !!window.__forceSW;
if (isPhone) { document.documentElement.classList.add('is-phone'); if (document.body.dataset.platform) document.body.dataset.platform = 'mobile'; }
if (isWeb && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${base}sw.js`).catch(() => {});

let busyFn = null;
addEventListener('beforeunload', (e) => { if (busyFn?.()) { e.preventDefault(); e.returnValue = ''; } });

function buildBar() {
  const cur = document.body.dataset.module ?? '';
  const link = (href, label, id) => `<a href="${base}${href}"${cur === id ? ' aria-current="page"' : ''}>${label}</a>`;
  const bar = document.createElement('div');
  bar.className = 'labbar no-print';
  bar.innerHTML = `<a class="labname" href="${base}#home">Movement Lab</a>
    <nav aria-label="Programmi">${link('corsa/', 'Corsa', 'corsa')}${link('movimento/', 'Accosciate e braccia', 'movimento')}${link('stabilometria/', 'Stabilometria', 'stabilometria')}${link('#clienti', 'Clienti', 'clienti')}${link('#aiuto', 'Aiuto', 'aiuto')}</nav>
    <span class="labclient" id="labClient"></span><button type="button" class="labinstall" id="labInstall" hidden>Installa l’app</button>`;
  document.body.prepend(bar);
  if (isWeb) {
    let ev = null;
    const btn = bar.querySelector('#labInstall');
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ev = e; btn.hidden = false; });
    addEventListener('appinstalled', () => { btn.hidden = true; });
    btn.onclick = async () => { await ev?.prompt(); ev = null; btn.hidden = true; };
  }
  renderClient();
}
function renderClient() {
  const box = document.getElementById('labClient'); if (!box) return;
  const c = read();
  box.innerHTML = c.name
    ? `Cliente: <a class="who" href="${base}#cliente/${encodeURIComponent(c.name)}">${esc(c.name)}</a> <a class="change" href="${base}#home">cambia</a>`
    : `<a class="change" href="${base}#home">Scegli un cliente</a>`;
}

function setClient(c) {
  const name = cleanName(c?.name);
  const next = name ? { name, birth: c.birth ?? '', height: c.height ?? '' } : {};
  write(next);
  renderClient();
  if (name) saveClient(next).catch(() => {});
  return next;
}

export const LAB = {
  isPhone, isIOS, isWeb,
  client: read,
  setClient,
  studio() { try { return localStorage.getItem(STUDIO_KEY) ?? ''; } catch { return ''; } },
  setStudio(v) { try { localStorage.setItem(STUDIO_KEY, v); } catch { /* non salvato */ } },
  base,
  // Collega i campi cliente di un programma al cliente attuale. Va chiamata dopo aver riaperto eventuali sessioni in corso.
  attach({ name, birth = null, height = null, datalist = null, draft = null, busy = null }) {
    busyFn = busy;
    const nameEl = document.getElementById(name), birthEl = birth && document.getElementById(birth), heightEl = height && document.getElementById(height);
    LAB.datalistId = datalist;
    const fill = (c) => { nameEl.value = c.name ?? ''; if (birthEl) birthEl.value = c.birth ?? ''; if (heightEl) heightEl.value = c.height ?? ''; };
    LAB.fillFromClient = () => fill(read());
    const d = draft?.(), c = read();
    if (d?.person && normName(d.person) !== normName(c.name)) {
      if (c.name) showDraftNotice(d, c, fill);
      else setClient({ name: d.person, birth: birthEl?.value, height: heightEl?.value });
    } else if (!nameEl.value) fill(c);
    else if (!birthEl?.value && !heightEl?.value) { if (birthEl) birthEl.value = c.birth ?? ''; if (heightEl) heightEl.value = c.height ?? ''; }

    nameEl.addEventListener('change', async () => {
      const v = cleanName(nameEl.value); nameEl.value = v;
      if (!v) { setClient({}); return; }
      // Cambiando persona non restano i dati della precedente; ciò che si sta scrivendo non si tocca.
      const prev = read(), same = normName(v) === normName(prev.name);
      if (!same) {
        if (birthEl && birthEl.value === String(prev.birth ?? '')) birthEl.value = '';
        if (heightEl && heightEl.value === String(prev.height ?? '')) heightEl.value = '';
      }
      const birthNow = () => birthEl?.value ?? (same ? prev.birth : '') ?? '', heightNow = () => heightEl?.value ?? (same ? prev.height : '') ?? '';
      setClient({ name: v, birth: birthNow(), height: heightNow() });
      const known = await getClient(v);
      if (known && normName(nameEl.value) === known.key) {
        if (birthEl && !birthEl.value) birthEl.value = known.birth ?? '';
        if (heightEl && !heightEl.value) heightEl.value = known.height ?? '';
        setClient({ name: known.name, birth: birthNow() || known.birth, height: heightNow() || known.height });
      }
      LAB.refreshPeople();
    });
    for (const el of [birthEl, heightEl]) el?.addEventListener('change', () => { if (cleanName(nameEl.value)) setClient({ name: nameEl.value, birth: birthEl?.value ?? read().birth, height: heightEl?.value ?? read().height }); });
    LAB.refreshPeople();
  },
  async refreshPeople() {
    const el = LAB.datalistId && document.getElementById(LAB.datalistId); if (!el) return;
    const names = await clientNames().catch(() => []);
    el.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
  },
};
window.LAB = LAB;

// Una sessione rimasta aperta appartiene a un altro cliente: si chiede prima di mischiare i dati.
function showDraftNotice(d, c, fill) {
  const box = document.createElement('div');
  box.className = 'labnotice no-print'; box.setAttribute('role', 'alert');
  box.innerHTML = `<p>C’è una sessione aperta di <b>${esc(d.person)}</b>, ma il cliente scelto è <b>${esc(c.name)}</b>. Le nuove prove finirebbero nella sessione di ${esc(d.person)}.</p>
    <div><button type="button" class="close">Chiudi quella sessione e passa a ${esc(c.name)}</button> <button type="button" class="keep">Continua con ${esc(d.person)}</button></div>`;
  document.querySelector('.labbar').after(box);
  box.querySelector('.close').onclick = async () => { await d.close(); fill(read()); box.remove(); };
  box.querySelector('.keep').onclick = () => { setClient({ name: d.person }); box.remove(); };
}

buildBar();
