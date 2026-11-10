// Lingua dell'interfaccia: italiano (originale) o inglese.
// Il programma è scritto in italiano; in inglese ogni testo mostrato viene sostituito con la sua traduzione,
// anche quelli che compaiono dopo (risultati, referti, avvisi, voce, scritte sui disegni).
import { translate, decimalsEN as decimals } from './i18n-core.js';

const KEY = 'ml_lang';
export const LANG = (() => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'it'; } catch { return 'it'; } })();
export function setLang(l) { try { localStorage.setItem(KEY, l); } catch { /* non salvata */ } location.reload(); }

const cache = new Map();
export function t(s) {
  if (LANG !== 'en' || typeof s !== 'string') return s;
  const core = s.trim();
  if (!core || !/[A-Za-zÀ-ú]/.test(core)) return LANG === 'en' ? decimals(s) : s;
  if (cache.has(s)) return cache.get(s);
  const out = translate(core);
  const res = out == null ? s : s.slice(0, s.indexOf(core)) + out + s.slice(s.indexOf(core) + core.length);
  if (cache.size > 20000) cache.clear();
  cache.set(s, res);
  return res;
}

const ATTR = ['title', 'placeholder', 'aria-label', 'alt'];
const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE)$/;
const skip = (el) => !el || SKIP.test(el.nodeName) || el.closest?.('[data-no-tr],[contenteditable="true"]');
function trText(n) {
  if (skip(n.parentElement)) return;
  const v = n.nodeValue, r = t(v);
  if (r !== v) n.nodeValue = r;
}
function trAttrs(el) {
  for (const a of ATTR) if (el.hasAttribute(a)) { const v = el.getAttribute(a), r = t(v); if (r !== v) el.setAttribute(a, r); }
  if (el.tagName === 'INPUT' && /^(button|submit)$/.test(el.type)) { const r = t(el.value); if (r !== el.value) el.value = r; }
}
function scan(root) {
  if (root.nodeType === 3) { trText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (skip(root)) return; trAttrs(root); }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
}

if (LANG === 'en') {
  document.documentElement.lang = 'en';
  const st = document.createElement('style');
  st.textContent = '@media print { @page { @bottom-left { content: "Movement Lab · movement analysis"; } @bottom-right { content: "Page " counter(page) " of " counter(pages); } } }';
  document.head.appendChild(st);
  const start = () => {
    scan(document.documentElement);
    document.title = t(document.title);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') { if (!skip(m.target)) trAttrs(m.target); }
        else for (const n of m.addedNodes) scan(n);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // Avvisi, scritte disegnate sui video e sui grafici, voce.
  const oa = window.alert, oc = window.confirm, op = window.prompt;
  window.alert = (m) => oa.call(window, t(String(m)));
  window.confirm = (m) => oc.call(window, t(String(m)));
  window.prompt = (m, d) => op.call(window, t(String(m)), d);
  const C = CanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText', 'measureText']) {
    const o = C[fn];
    C[fn] = function (txt, ...a) { return o.call(this, t(String(txt)), ...a); };
  }
  if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
    const os = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u) => {
      u.text = t(u.text); u.lang = 'en-GB';
      const v = speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
      u.voice = v ?? null;
      return os(u);
    };
  }
}
