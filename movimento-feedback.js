// Feedback dal vivo: quali errori si vedono adesso e quali sono stati commessi nell'ultima ripetizione.
// Usa le stesse regole del referto (errori.js) sui valori del fotogramma o della ripetizione.
import { setFindings } from './movimento-errori.js';

const LIMB = { thigh: { L: [23, 25], R: [24, 26] }, shin: { L: [25, 27], R: [26, 28] }, uarm: { L: [11, 13], R: [12, 14] }, farm: { L: [13, 15], R: [14, 16] }, foot: { L: [29, 31], R: [30, 32] } };
const CENTRAL = { trunk: [[11, 23], [12, 24]], pelvis: [[23, 24]], shoulders: [[11, 12]] };
// Errori che si giudicano solo a ripetizione finita, sul suo punto massimo.
const REP_ONLY = new Set(['depth', 'chin', 'hang', 'short', 'rom', 'hipsHigh', 'hipsLow', 'ankle', 'narrow', 'swing', 'trunkRise', 'hipLift', 'lockBack', 'kip']);
// Errori di postura validi in ogni momento; gli altri solo vicino al punto massimo del movimento.
const ALWAYS = new Set(['pelvis', 'shift', 'trunkLat', 'shoulders', 'sag', 'pike', 'comp', 'wrists', 'barTilt']);
const base = (k) => k.replace(/_[LR]$/, '');
const CUE_SHORT = {
  valgus: 'Ginocchio in fuori', narrow: 'Apri le ginocchia', trunk: 'Petto alto', depth: 'Scendi di più', ankle: 'Ginocchia più avanti',
  pelvis: 'Bacino in piano', drop: 'Bacino in piano', shift: 'Peso al centro', trunkLat: 'Busto dritto', shoulders: 'Spalle in piano', wrists: 'Mani alla stessa altezza',
  arms: 'Braccia in alto', comp: 'Busto fermo', rom: 'Più ampio', swing: 'Senza slancio', barFoot: 'Barra vicina al corpo', shoulderBar: 'Spalle sopra la barra',
  hipsHigh: 'Piega di più le ginocchia', hipsLow: 'Bacino più alto', lockBack: 'Chiudi senza inarcarti', kneeBend: 'Ginocchia più ferme', flare: 'Gomiti più stretti',
  forearm: 'Polso sopra il gomito', hipLift: 'Glutei sulla panca', barTilt: 'Barra in piano', sag: 'Corpo dritto, addome stretto', pike: 'Bacino più basso',
  chin: 'Sali di più', hang: 'Scendi a braccia distese', kip: 'Gambe ferme', trunkRise: 'Busto fermo', short: 'Tira di più',
};
export const cueOf = (f) => CUE_SHORT[base(f.key)] ?? f.title;

const fakeSet = (proto, view, values, ctx, extra = {}) => ({
  protocolId: proto.id, customSpec: proto.custom ? proto.spec : undefined, view,
  summary: { metrics: Object.fromEntries(Object.entries(values).filter(([, v]) => v != null).map(([k, v]) => [k, { peakMean: v, ...(extra[k] ?? {}) }])), work: ctx.work, near: ctx.near, dir: ctx.dir, reps: ctx.reps ?? [] },
});

export class LiveFeedback {
  constructor(protocol, view) { this.protocol = protocol; this.view = view; this.hist = []; this.count = {}; this.until = {}; this.lastRep = null; this.items = []; }
  // Segmenti da colorare per un errore.
  segsFor(f, frame) {
    const out = [], parts = f.parts?.length ? f.parts : ['trunk'];
    const sideFallback = this.view === 'side' ? [this.protocol.group === 'arm' ? frame.near : frame.work] : ['L', 'R'];
    for (const p of parts) {
      if (CENTRAL[p]) out.push(...CENTRAL[p]);
      else if (LIMB[p]) for (const s of f.side ? [f.side] : sideFallback) out.push(LIMB[p][s]);
    }
    return out;
  }
  deepNow(frame) {
    const spec = this.protocol.views[this.view], id = spec.driver ?? spec.primary, sign = spec.driverSign ?? 1, v = frame.values[id];
    if (v == null) return false;
    this.hist.push([frame.t, v * sign]); while (this.hist.length && this.hist[0][0] < frame.t - 6000) this.hist.shift();
    const vs = this.hist.map((h) => h[1]), lo = Math.min(...vs), hi = Math.max(...vs);
    return hi - lo > (spec.minRange ?? 20) * 0.6 && v * sign - lo >= 0.7 * (hi - lo);
  }
  update(frame) {
    if (!frame || this.protocol.custom) { this.items = []; return { segs: [], items: [] }; }
    const deep = this.deepNow(frame), now = frame.t;
    const fs = setFindings(fakeSet(this.protocol, this.view, frame.values, frame)).filter((f) => f.state === 'flag' && !REP_ONLY.has(base(f.key)) && (ALWAYS.has(base(f.key)) || deep));
    const on = new Set(fs.map((f) => f.key));
    for (const k of new Set([...Object.keys(this.count), ...on])) this.count[k] = on.has(k) ? Math.min(8, (this.count[k] ?? 0) + 1) : Math.max(0, (this.count[k] ?? 0) - 1);
    const items = [];
    for (const f of fs) if (this.count[f.key] >= 3) { this.until[f.key] = { t: now + 700, f }; }
    for (const [k, o] of Object.entries(this.until)) { if (o.t < now) delete this.until[k]; else items.push(o.f); }
    this.items = items.map((f) => ({ key: f.key, title: f.title, cue: cueOf(f), segs: this.segsFor(f, frame) }));
    return { segs: this.items.flatMap((i) => i.segs), items: this.items };
  }
  // A ripetizione finita: tutti gli errori di quella ripetizione, anche quelli che servono il punto massimo.
  onRep(rep, ctx) {
    if (this.protocol.custom) return null;
    const extra = Object.fromEntries(Object.entries(rep.ext ?? {}).map(([k, e]) => [k, { min: e[0], max: e[1] }]));
    const fs = setFindings(fakeSet(this.protocol, this.view, rep.at ?? {}, { ...ctx, reps: [rep] }, extra)).filter((f) => f.state === 'flag');
    this.lastRep = { i: rep.i, side: rep.side, t: rep.t1, items: fs.map((f) => ({ key: f.key, title: f.title, cue: cueOf(f) })) };
    return this.lastRep;
  }
}
