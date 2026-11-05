// Archivio locale: sessioni nel browser, con video e punti in un archivio separato.
const DB = 'analisi-movimento';
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('sessions', { keyPath: 'id' }); r.result.createObjectStore('media', { keyPath: 'setId' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), req = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); res(req?.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  });
}
export const saveSession = (s) => tx('sessions', 'readwrite', (o) => o.put(s));
export const getSession = (id) => tx('sessions', 'readonly', (o) => o.get(Number(id)));
export const allSessions = async () => (await tx('sessions', 'readonly', (o) => o.getAll())).sort((a, b) => b.createdAt - a.createdAt);
export const putMedia = (m) => tx('media', 'readwrite', (o) => o.put(m));
export const getMedia = (setId) => tx('media', 'readonly', (o) => o.get(Number(setId)));
export const deleteMedia = (setId) => tx('media', 'readwrite', (o) => o.delete(Number(setId)));
export async function deleteSession(id) {
  const s = await getSession(id);
  for (const k of s?.sets ?? []) await deleteMedia(k.id);
  return tx('sessions', 'readwrite', (o) => o.delete(Number(id)));
}

// Punti di una serie in forma compatta: x, y, visibilità per ciascuno dei 33 punti.
export function packFrames(frames) {
  const n = frames.length;
  const pack = { n, times: new Float64Array(n), pts: new Float32Array(n * 99), near: new Uint8Array(n), work: new Uint8Array(n), dir: new Int8Array(n), leg: new Float32Array(n), topY: new Float32Array(n) };
  frames.forEach((f, i) => {
    pack.times[i] = f.t; pack.near[i] = f.near === 'R' ? 1 : 0; pack.work[i] = f.work === 'R' ? 1 : 0; pack.dir[i] = f.dir; pack.leg[i] = f.leg ?? 0; pack.topY[i] = f.topY ?? 0;
    f.P.forEach((p, k) => { const o = i * 99 + k * 3; pack.pts[o] = p.x; pack.pts[o + 1] = p.y; pack.pts[o + 2] = p.v; });
  });
  return pack;
}
export function frameContext(pack, i, baseTilt = null) {
  const P = [];
  for (let k = 0; k < 33; k++) { const o = i * 99 + k * 3; P.push({ x: pack.pts[o], y: pack.pts[o + 1], z: 0, v: pack.pts[o + 2] }); }
  return { P, t: pack.times[i], near: pack.near[i] ? 'R' : 'L', work: pack.work[i] ? 'R' : 'L', dir: pack.dir[i], leg: pack.leg[i] || null, topY: pack.topY[i] || null, minVis: 0.35, baseTilt };
}
