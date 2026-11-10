// Traduzione in inglese di un testo italiano del programma: frase intera, poi pezzi della frase.
import { EN } from './i18n-en.js';

const NUM = /[-−+]?\d+(?:[.,]\d+)*/g;
const MONTHS = { gennaio: 'January', febbraio: 'February', marzo: 'March', aprile: 'April', maggio: 'May', giugno: 'June', luglio: 'July', agosto: 'August', settembre: 'September', ottobre: 'October', novembre: 'November', dicembre: 'December' };
const DAYS = { lunedì: 'Monday', martedì: 'Tuesday', mercoledì: 'Wednesday', giovedì: 'Thursday', venerdì: 'Friday', sabato: 'Saturday', domenica: 'Sunday' };
const MON_SHORT = { gen: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', mag: 'May', giu: 'Jun', lug: 'Jul', ago: 'Aug', set: 'Sep', ott: 'Oct', nov: 'Nov', dic: 'Dec' };
const DATE_RE = new RegExp(`\\b(${Object.keys(DAYS).join('|')})\\b|\\b(\\d{1,2}) (${Object.keys(MONTHS).join('|')}|${Object.keys(MON_SHORT).join('|')})\\b`, 'gi');
const decimals = (s) => s.replace(/(\d),(\d)/g, '$1.$2');

// Una frase intera, con i numeri al loro posto.
function whole(core) {
  const m = core.match(/^(.*?)([.;:]+)$/);
  if (m && m[1]) { const w = whole1(m[1]); if (w != null) return w + m[2]; }
  return whole1(core);
}
// Voci con @: un nome qualsiasi al posto della chiocciola.
const NUMSRC = '[-−+]?\\d+(?:[.,]\\d+)*';
const WILD = Object.keys(EN).filter((k) => k.includes('@')).map((k) => {
  const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, `(${NUMSRC})`).replace(/@/g, '(.+?)') + '$');
  const kinds = [...k.matchAll(/[#@]/g)].map((m) => m[0]);
  return { re, kinds, v: EN[k] };
});
function wild(core) {
  for (const w of WILD) {
    const m = core.match(w.re);
    if (!m) continue;
    const nums = [], names = [];
    w.kinds.forEach((kd, i) => (kd === '#' ? nums : names).push(m[i + 1]));
    let a = 0, b = 0;
    return w.v.replace(/[#@]/g, (c) => (c === '#' ? decimals(nums[a++] ?? '') : names[b++] ?? ''));
  }
  return null;
}
function whole1(core) {
  let out = EN[core];
  if (out != null) return out;
  const nums = [];
  const k = core.replace(NUM, (m) => { nums.push(m); return '#'; });
  const v = EN[k];
  if (v != null) { let i = 0; return v.replace(/#/g, () => decimals(nums[i++] ?? '#')); }
  const wv = wild(core);
  if (wv != null) return wv;
  return null;
}
// Frasi composte (riepiloghi, avvisi): se non c'è la frase intera, si traducono i pezzi.
const SEPS = [/(?<=[.!?])\s+/, /(;\s+)/, /(:\s+)/, /(\s+·\s+)/, /(,\s+)/, /(\s+\/\s+)/];
function dateTr(core) {
  let out;
  DATE_RE.lastIndex = 0;
  if (DATE_RE.test(core)) {
    DATE_RE.lastIndex = 0;
    out = core.replace(DATE_RE, (m, day, n, mon) => (day ? DAYS[day.toLowerCase()] : `${n} ${MONTHS[mon.toLowerCase()] ?? MON_SHORT[mon.toLowerCase()]}`)).replace(/ alle ore /g, ' at ').replace(/\bil (\d)/g, 'on $1');
    DATE_RE.lastIndex = 0;
    return out === core ? null : out;
  }
  return null;
}
function pieces(core, level = 0) {
  const w = whole(core);
  if (w != null) return w;
  if (level >= SEPS.length) return dateTr(core);
  const parts = core.split(SEPS[level]);
  if (parts.length < 2) return pieces(core, level + 1);
  let hit = 0;
  const out = parts.map((p, i) => {
    if (level > 0 && i % 2 === 1) return p; // separatore
    if (!p.trim() || !/[A-Za-zÀ-ú]/.test(p)) return decimals(p);
    const r = pieces(p.trim(), level + 1);
    if (r != null) { hit++; return p.replace(p.trim(), r); }
    return p;
  });
  return hit ? out.join(level === 0 ? ' ' : '') : null;
}


export function translate(core) { return pieces(core); }
export function decimalsEN(s) { return decimals(s); }
