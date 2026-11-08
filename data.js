// Accesso unico agli archivi dei tre programmi. Ogni programma conserva il proprio archivio nel browser:
// qui si aprono con la stessa versione e le stesse tabelle, così restano compatibili.
const DEF = {
  corsa: { db: 'analisi-corsa', stores: { sessions: 'id' }, main: 'sessions' },
  movimento: { db: 'analisi-movimento', stores: { sessions: 'id', media: 'setId' }, main: 'sessions' },
  stabilometria: { db: 'analisi-stabilometrica', stores: { exams: 'id' }, main: 'exams' },
  bici: { db: 'analisi-bici', stores: { sessions: 'id' }, main: 'sessions' },
  lab: { db: 'laboratorio-movimento', stores: { clients: 'key' }, main: 'clients' },
};
export const MODULES = ['corsa', 'movimento', 'stabilometria', 'bici'];
export const MODULE_NAMES = { corsa: 'Corsa', movimento: 'Accosciate e braccia', stabilometria: 'Stabilometria', bici: 'Bici' };

function open(mod) {
  const d = DEF[mod];
  return new Promise((res, rej) => {
    const r = indexedDB.open(d.db, 1);
    r.onupgradeneeded = () => { for (const [name, keyPath] of Object.entries(d.stores)) r.result.createObjectStore(name, { keyPath }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mod, store, mode, fn) {
  const db = await open(mod);
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), q = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); res(q?.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  });
}
const readAll = (mod) => tx(mod, DEF[mod].main, 'readonly', (o) => o.getAll());
const putMany = (mod, docs) => tx(mod, DEF[mod].main, 'readwrite', (o) => { for (const d of docs) o.put(d); });

export const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
export const cleanName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const personOf = (mod, doc) => (mod === 'stabilometria' ? doc.client?.name : doc.person) ?? '';
function setPerson(mod, doc, name) { if (mod === 'stabilometria') doc.client = { ...(doc.client ?? {}), name }; else doc.person = name; }
const hasContent = (mod, d) => (mod === 'corsa' ? !!d.views : mod === 'movimento' ? d.sets?.length > 0 : mod === 'bici' ? !!d.views?.side : d.tests?.length > 0);

// Tutte le analisi salvate, dalla più recente.
export async function allAnalyses() {
  const out = [];
  for (const mod of MODULES) {
    const docs = await readAll(mod).catch(() => []);
    for (const doc of docs) if (hasContent(mod, doc)) out.push({ mod, doc, id: doc.id, at: doc.createdAt, person: cleanName(personOf(mod, doc)), key: normName(personOf(mod, doc)) });
  }
  return out.sort((a, b) => b.at - a.at);
}

/* ---------- clienti ---------- */
export const getClient = (name) => tx('lab', 'clients', 'readonly', (o) => o.get(normName(name))).catch(() => null);
export async function saveClient({ name, birth = '', height = '' }) {
  const clean = cleanName(name); if (!clean) return;
  const prev = await getClient(clean);
  const rec = { key: normName(clean), name: clean, birth: birth || prev?.birth || '', height: height || prev?.height || '', createdAt: prev?.createdAt ?? Date.now() };
  await tx('lab', 'clients', 'readwrite', (o) => o.put(rec));
}
export async function clientList(analyses = null) {
  const list = analyses ?? await allAnalyses();
  const reg = await readAll('lab').catch(() => []);
  const map = new Map();
  const get = (key, name) => { if (!map.has(key)) map.set(key, { key, name, birth: '', height: '', counts: { corsa: 0, movimento: 0, stabilometria: 0, bici: 0 }, last: 0, analyses: [] }); return map.get(key); };
  for (const r of reg) { const c = get(r.key, r.name); c.birth = r.birth ?? ''; c.height = r.height ?? ''; c.last = 0; }
  for (const a of list) {
    if (!a.key) continue;
    const c = get(a.key, a.person);
    c.counts[a.mod]++; c.analyses.push(a); c.last = Math.max(c.last, a.at);
    if (a.mod === 'stabilometria') { c.birth ||= a.doc.client?.birth ?? ''; c.height ||= a.doc.client?.height ?? ''; }
    if (a.mod === 'corsa') c.height ||= a.doc.heightCm ?? '';
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
export const clientNames = async () => (await clientList()).map((c) => c.name);
export const unnamedAnalyses = async (analyses = null) => (analyses ?? await allAnalyses()).filter((a) => !a.key);

export async function renameClient(oldName, newName) {
  const from = normName(oldName), clean = cleanName(newName); if (!clean) throw new Error('Nome vuoto');
  for (const mod of MODULES) {
    const docs = (await readAll(mod).catch(() => [])).filter((d) => normName(personOf(mod, d)) === from);
    for (const d of docs) setPerson(mod, d, clean);
    if (docs.length) await putMany(mod, docs);
  }
  const old = await getClient(oldName);
  await tx('lab', 'clients', 'readwrite', (o) => o.delete(from));
  await saveClient({ name: clean, birth: old?.birth, height: old?.height });
}
export async function deleteClient(name) {
  const key = normName(name);
  for (const mod of MODULES) {
    const docs = (await readAll(mod).catch(() => [])).filter((d) => normName(personOf(mod, d)) === key);
    await tx(mod, DEF[mod].main, 'readwrite', (o) => { for (const d of docs) o.delete(d.id); });
    if (mod === 'movimento') { const ids = docs.flatMap((d) => (d.sets ?? []).map((s) => s.id)); if (ids.length) await tx(mod, 'media', 'readwrite', (o) => { for (const id of ids) o.delete(id); }); }
  }
  await tx('lab', 'clients', 'readwrite', (o) => o.delete(key));
}

/* ---------- copia di sicurezza ---------- */
export const BACKUP_FORMAT = 'laboratorio-movimento';
export async function exportAll() {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), clients: await readAll('lab').catch(() => []), corsa: await readAll('corsa').catch(() => []), movimento: await readAll('movimento').catch(() => []), stabilometria: await readAll('stabilometria').catch(() => []), bici: await readAll('bici').catch(() => []) };
}
const validFor = {
  bici: (d) => d && d.id != null && d.kind === 'bici' && d.views && typeof d.views === 'object',
  corsa: (d) => d && d.id != null && d.kind !== 'bici' && d.views && typeof d.views === 'object',
  movimento: (d) => d && d.id != null && Array.isArray(d.sets),
  stabilometria: (d) => d && d.id != null && Array.isArray(d.tests),
};
// Accetta la copia unica e anche i file esportati dalle singole app di prima.
export async function importAny(data) {
  const buckets = { corsa: [], movimento: [], stabilometria: [], bici: [] };
  let clients = [];
  if (Array.isArray(data)) {
    for (const d of data) { if (validFor.bici(d)) buckets.bici.push(d); else if (validFor.corsa(d)) buckets.corsa.push(d); else if (validFor.movimento(d)) buckets.movimento.push(d); else if (validFor.stabilometria(d)) buckets.stabilometria.push(d); }
  } else if (data?.format === BACKUP_FORMAT) {
    for (const mod of MODULES) buckets[mod] = (data[mod] ?? []).filter(validFor[mod]);
    clients = (data.clients ?? []).filter((c) => c?.key && c?.name);
  } else throw new Error('Formato non riconosciuto');
  const total = MODULES.reduce((n, m) => n + buckets[m].length, 0);
  if (!total && !clients.length) throw new Error('Il file non contiene analisi');
  for (const mod of MODULES) {
    if (!buckets[mod].length) continue;
    for (const d of buckets[mod]) if (d.draft) d.draft = false;
    await putMany(mod, buckets[mod]);
  }
  if (clients.length) await tx('lab', 'clients', 'readwrite', (o) => { for (const c of clients) o.put(c); });
  return { corsa: buckets.corsa.length, movimento: buckets.movimento.length, stabilometria: buckets.stabilometria.length, bici: buckets.bici.length, clients: clients.length };
}
