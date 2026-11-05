// Archivio locale nel browser, con esportazione e importazione in un file.
const DB = 'analisi-stabilometrica', STORE = 'exams';
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(q?.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  });
}
export const saveExam = (e) => tx('readwrite', (o) => o.put(e));
export const getExam = (id) => tx('readonly', (o) => o.get(Number(id)));
export const deleteExam = (id) => tx('readwrite', (o) => o.delete(Number(id)));
export const allExams = async () => (await tx('readonly', (o) => o.getAll())).sort((a, b) => b.createdAt - a.createdAt);
