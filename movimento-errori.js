// Errori di una serie, spiegati al cliente, e figura schematica: la sua posizione al punto massimo sopra quella di riferimento.
// Modulo senza pagina né video. I segni restano distinti in una stampa in bianco e nero: il riferimento è tratteggiato,
// la persona è a tratto pieno, il segmento sbagliato è a doppia linea e porta un numero in un cerchio.
import { protocolById } from './movimento-measure.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const rad = Math.PI / 180;
const SIDE = { L: 'sinistra', R: 'destra' };
const SIDE_M = { L: 'sinistro', R: 'destro' };

/* ---------- soglie ---------- */
// Valori indicativi: il fisioterapista li conferma guardando il video.
export const LIMITS = {
  depth: 10, trunkExtra: 15, trunkTibia: 15, ankle: 22, armsForward: 15, lungeKnee: 80,
  valgus: 10, kneesNarrow: 85, pelvis: 4, shift: 10, trunkLat: 5, shoulders: 4, wrists: 8, drop: 4, singleTrunk: 6,
  flex: 160, ext: 45, abd: 160, elbow: 135, press: 165, rot: 80, comp: 10, armSwing: 20,
  barFoot: 10, shoulderBehind: -8, lockBack: -8, hipsHigh: 45, hipsLow: 110, rdlKnee: 35, stiffKnee: 20, rdlHip: 60, slKnee: 35, slTrunk: 55,
  flare: 70, forearm: 20, benchDepth: 70, hipLift: 8, barTilt: 6, wristOut: 15, sag: -6, pike: 8,
  chin: 0, hangArms: 25, pullTilt: 5, pullLat: 6, swing: 20, kip: 40, rowTrunk: 15, rowElbow: 70,
};
// Tronco atteso al punto più basso per ciascun esercizio, in gradi dalla verticale.
const TRUNK_REF = { squat: 40, highbar: 40, lowbar: 48, frontsquat: 25, goblet: 32, sumo: 32, box: 42, overhead: 30, single: 40, split: 10, bulgarian: 12, lunge: 10 };
const TIBIA_REF = { lowbar: 26, frontsquat: 40, goblet: 38, overhead: 38 };
export const LIMIT_TEXT = [
  ['Discesa poco profonda', `coscia più di ${LIMITS.depth}° sopra l’orizzontale`],
  ['Busto che cade in avanti', `tronco oltre il valore atteso di ${LIMITS.trunkExtra}° o più inclinato della tibia di ${LIMITS.trunkTibia}°`],
  ['Caviglia poco mobile', `tibia sotto ${LIMITS.ankle}° dalla verticale`],
  ['Ginocchio verso l’interno', `tibia inclinata verso l’interno oltre ${LIMITS.valgus}°`],
  ['Bacino o spalle non in piano', `oltre ${LIMITS.pelvis}°`],
  ['Peso spostato di lato', `bacino oltre il ${LIMITS.shift}% della distanza tra i piedi`],
  ['Busto inclinato di lato', `oltre ${LIMITS.trunkLat}°`],
  ['Caduta del bacino nello squat su una gamba', `oltre ${LIMITS.drop}°`],
  ['Spalla: flessione, abduzione, estensione', `sotto ${LIMITS.flex}°, ${LIMITS.abd}°, ${LIMITS.ext}°`],
  ['Gomito', `flessione sotto ${LIMITS.elbow}°`],
  ['Stacco: barra lontana dal corpo', `oltre il ${LIMITS.barFoot}% della gamba davanti al centro del piede`],
  ['Stacco: busto all’indietro alla chiusura', `oltre ${-LIMITS.lockBack}°`],
  ['Panca: gomiti aperti', `braccio oltre ${LIMITS.flare}° dal tronco, visto di lato`],
  ['Panca: avambraccio non verticale', `oltre ${LIMITS.forearm}°`],
  ['Piegamenti: bacino che cede o sale', `oltre il ${-LIMITS.sag}% o il ${LIMITS.pike}% della gamba dalla linea spalla-caviglia`],
  ['Trazioni: mento sotto le mani, slancio', `mento sotto le mani; corpo che oscilla oltre ${LIMITS.swing}°`],
  ['Compenso del tronco nelle braccia', `oltre ${LIMITS.comp}°`],
];

/* ---------- voci ---------- */
export function setFindings(set, T = LIMITS) {
  const proto = protocolById(set.protocolId, set.customSpec);
  if (!proto || proto.custom) return [];
  const M = set.summary?.metrics ?? {}, view = set.view, sm = set.summary ?? {};
  const v = (id) => (ok(M[id]?.peakMean) ? M[id].peakMean : null);
  const out = [];
  const add = (key, title, flag, value, plain, cue, parts = [], side = null, state = null) => out.push({ key, title, state: state ?? (flag == null ? 'none' : flag ? 'flag' : 'ok'), value, plain, cue, parts, side });
  const id = proto.id, grp = proto.group;

  if (grp === 'squat' && view === 'side') {
    const thigh = v('thigh'), trunk = v('trunk'), tibia = v('tibia'), tt = v('trunkTibia'), knee = v('knee');
    const work = sm.work === 'R' ? 'R' : 'L';
    if (['split', 'bulgarian', 'lunge'].includes(id)) {
      add('depth', 'Discesa poco profonda', knee == null ? null : knee < T.lungeKnee, knee == null ? '' : `Ginocchio davanti piegato di ${fmt(knee)}°.`,
        'Il ginocchio della gamba davanti si piega poco: il movimento resta corto.', 'Scendi finché il ginocchio dietro si avvicina a terra, se resta comodo.', ['thigh', 'shin']);
      const ref = TRUNK_REF[id] ?? 10;
      add('trunk', 'Busto che si piega in avanti', trunk == null ? null : trunk > ref + T.trunkExtra, trunk == null ? '' : `Tronco a ${fmt(trunk)}° dalla verticale.`,
        'Il busto si piega in avanti invece di scendere dritto.', 'Petto alto e scendi verticale, come in un ascensore.', ['trunk']);
    } else {
      add('depth', 'Discesa poco profonda', thigh == null ? null : thigh > T.depth, thigh == null ? '' : thigh > 0 ? `Coscia ${fmt(thigh)}° sopra l’orizzontale.` : `Coscia ${fmt(-thigh)}° sotto l’orizzontale.`,
        'Le anche restano alte rispetto alle ginocchia: il movimento si ferma prima del parallelo.', 'Scendi un po’ di più solo se resta comodo: spesso aiutano la mobilità di caviglia e anca o un rialzo sotto i talloni.', ['thigh']);
      const ref = TRUNK_REF[id] ?? 40, over = trunk != null && trunk > ref + T.trunkExtra, ttOver = tt != null && tt > T.trunkTibia;
      add('trunk', 'Busto che cade in avanti', trunk == null ? null : over || ttOver, trunk == null ? '' : `Tronco a ${fmt(trunk)}° dalla verticale${tt != null ? `, ${fmt(Math.abs(tt))}° ${tt >= 0 ? 'più' : 'meno'} inclinato della tibia` : ''}.`,
        'Il busto si piega molto in avanti: il carico passa dalle gambe alla schiena e alle anche.', 'Petto alto e sguardo avanti. Prova il goblet squat o i talloni su un piccolo rialzo.', ['trunk']);
      const tRef = id === 'lowbar' ? T.ankle - 4 : T.ankle;
      add('ankle', 'Ginocchia che avanzano poco (caviglia rigida?)', tibia == null ? null : tibia < tRef && (thigh == null || thigh < 25), tibia == null ? '' : `Tibia a ${fmt(tibia)}° dalla verticale.`,
        'La tibia resta quasi verticale: spesso la caviglia si piega poco e il busto compensa piegandosi in avanti.', 'Da verificare con un test di mobilità della caviglia, per esempio ginocchio al muro.', ['shin']);
      if (id === 'overhead') {
        const arm = v('armVert');
        add('arms', 'Braccia che cadono in avanti', arm == null ? null : arm > T.armsForward, arm == null ? '' : `Braccia ${fmt(arm)}° davanti alla verticale.`,
          'Le braccia non restano sopra la testa: di solito spalle o parte alta della schiena si muovono poco.', 'Lavora sulla mobilità delle spalle e della parte alta della schiena.', ['uarm', 'farm']);
      }
    }
    out.forEach((f) => { f.side = f.side ?? work; });
  }

  if (grp === 'squat' && view !== 'side') {
    const uni = !!proto.views[view]?.metrics.find((m) => m.id === 'drop');
    if (uni) {
      const work = sm.work === 'R' ? 'R' : 'L';
      const vg = v('valgus'), drop = v('drop'), tl = v('trunkLat');
      add('valgus', `Ginocchio ${SIDE_M[work]} verso l’interno`, vg == null ? null : vg > T.valgus, vg == null ? '' : `Valgo di ${fmt(vg, 1)}°.`,
        'Scendendo il ginocchio della gamba d’appoggio va verso l’interno invece di restare sopra il piede.', 'Ginocchio in linea con la seconda e la terza dita del piede; rinforza i glutei, in particolare il medio.', ['thigh', 'shin'], work);
      add('drop', 'Bacino che cade dal lato opposto', drop == null ? null : drop > T.drop, drop == null ? '' : `Caduta di ${fmt(drop, 1)}°.`,
        'Il lato del bacino senza appoggio si abbassa: i muscoli laterali dell’anca d’appoggio tengono poco.', 'Bacino in piano, come se avessi un bicchiere d’acqua su ciascun’anca. Lavora sul gluteo medio.', ['pelvis'], work);
      add('trunkLat', 'Busto che si inclina di lato', tl == null ? null : Math.abs(tl) > T.singleTrunk, tl == null ? '' : `Tronco inclinato ${fmt(Math.abs(tl), 1)}° verso ${tl > 0 ? 'destra' : 'sinistra'}.`,
        'Il busto si inclina per aiutare l’equilibrio sulla gamba d’appoggio.', 'Busto dritto, sguardo avanti; riduci la profondità finché resta stabile.', ['trunk']);
    } else frontBilateral(add, v, T, id === 'overhead');
  }
  if (grp === 'lift') liftFindings(proto, view, add, v, M, sm, T);

  if (grp === 'arm') {
    const trunk = v('trunk'), tl = v('trunkLat'), st = v('shTilt');
    const near = sm.near === 'R' ? 'R' : 'L';
    const comp = (dir) => add('comp', 'Compenso del tronco', trunk == null ? null : Math.abs(trunk) > T.comp, trunk == null ? '' : `Tronco ${fmt(Math.abs(trunk))}° ${trunk > 0 ? 'in avanti' : 'all’indietro'}.`,
      dir === 'back' ? 'Per alzare di più il braccio la schiena si inarca: il movimento della spalla sembra più ampio di quello reale.' : 'Il busto si muove per aiutare il braccio.', 'Addome attivo e schiena ferma; misura il movimento fin dove il busto resta fermo.', ['trunk']);
    if (id === 'flex') {
      const x = v('shoulder');
      add('rom', 'Flessione di spalla limitata', x == null ? null : x < T.flex, x == null ? '' : `${fmt(x)}°, riferimento circa 180°.`, 'Il braccio non arriva in alto sopra la testa.', 'Lavora sulla mobilità della spalla e della parte alta della schiena.', ['uarm', 'farm'], near);
      comp('back');
    } else if (id === 'ext') {
      const x = v('shoulder');
      add('rom', 'Estensione di spalla limitata', x == null ? null : -x < T.ext, x == null ? '' : `${fmt(Math.abs(x))}° all’indietro, riferimento circa 50-60°.`, 'Il braccio va poco indietro.', 'Lavora sulla mobilità anteriore della spalla.', ['uarm', 'farm'], near);
      comp('fwd');
    } else if (id === 'abd' || id === 'press') {
      const lim = id === 'abd' ? T.abd : T.press;
      for (const s of ['L', 'R']) {
        const x = v(`abd_${s}`);
        add(`rom_${s}`, id === 'abd' ? `Abduzione limitata, braccio ${SIDE_M[s]}` : `Braccio ${SIDE_M[s]} non completo sopra la testa`, x == null ? null : x < lim, x == null ? '' : `${fmt(x)}°, riferimento circa 180°.`,
          id === 'abd' ? 'Il braccio non arriva in alto lateralmente.' : 'Il braccio si ferma prima della verticale.', 'Verifica mobilità e forza della spalla; scendi il carico se compensa.', ['uarm', 'farm'], s);
      }
      add('trunkLat', 'Busto inclinato di lato', tl == null ? null : Math.abs(tl) > T.trunkLat, tl == null ? '' : `Verso ${tl > 0 ? 'destra' : 'sinistra'} di ${fmt(Math.abs(tl), 1)}°.`, 'Il busto si piega di lato per far salire il braccio.', 'Busto fermo e dritto; riduci il carico o l’ampiezza.', ['trunk']);
      add('shoulders', 'Spalla che si alza', st == null ? null : Math.abs(st) > T.shoulders + 2, st == null ? '' : `Spalle diverse di ${fmt(Math.abs(st), 1)}°.`, 'Una spalla sale verso l’orecchio per aiutare il movimento.', 'Spalle basse e lontane dalle orecchie.', ['shoulders']);
      if (id === 'press') {
        const wd = v('wristDiff');
        add('wrists', 'Una mano più bassa dell’altra', wd == null ? null : wd > T.wrists, wd == null ? '' : `Differenza del ${fmt(wd)}% della lunghezza del braccio.`, 'Le due braccia non salgono insieme.', 'Spingi in modo uguale; usa un carico che permetta di salire dritti.', ['farm']);
      }
    } else if (id === 'elbow') {
      if (view === 'side') {
        const x = v('elbow'), arm = v('shoulder');
        add('rom', 'Flessione di gomito limitata', x == null ? null : x < T.elbow, x == null ? '' : `${fmt(x)}°, riferimento circa 145°.`, 'Il gomito si piega poco.', 'Verifica la mobilità del gomito; con il peso riduci il carico.', ['farm'], near);
        add('swing', 'Il braccio si sposta in avanti', arm == null ? null : Math.abs(arm) > T.armSwing, arm == null ? '' : `Braccio ${fmt(Math.abs(arm))}° rispetto al tronco.`, 'Il gomito si allontana dal fianco e la spalla aiuta il movimento.', 'Gomiti fermi vicino ai fianchi.', ['uarm']);
        comp('fwd');
      } else for (const s of ['L', 'R']) {
        const x = v(`elbow_${s}`);
        add(`rom_${s}`, `Flessione limitata, gomito ${SIDE_M[s]}`, x == null ? null : x < T.elbow, x == null ? '' : `${fmt(x)}°, riferimento circa 145°.`, 'Il gomito si piega poco.', 'Verifica la mobilità del gomito.', ['farm'], s);
      }
    } else if (id === 'rot') {
      const x = v('forearm');
      add('rom', 'Rotazione esterna limitata (stima)', x == null ? null : x < T.rot, x == null ? '' : `${fmt(x)}°, riferimento circa 90°.`, 'L’avambraccio ruota poco all’indietro.', 'Lavora sulla rotazione esterna della spalla.', ['farm'], near);
    }
  }
  return out.map((f, i) => ({ ...f, n: 0, i }));
}

/* ---------- stacco, panca, trazioni ---------- */
const med = (a) => { if (!a.length) return null; const q = [...a].sort((x, y) => x - y), m = (q.length - 1) / 2; return (q[Math.floor(m)] + q[Math.ceil(m)]) / 2; };
// Escursione di una misura dentro le ripetizioni: mediana tra le ripetizioni.
const repRange = (sm, id) => med((sm.reps ?? []).map((r) => r.ext?.[id]).filter((e) => e && ok(e[0]) && ok(e[1])).map((e) => e[1] - e[0]));
function liftFindings(proto, view, add, v, M, sm, T) {
  const fam = proto.family, id = proto.id;
  const back = 'La curva della schiena, per esempio la schiena tonda, non si misura dai punti del corpo: guardala nel video.';
  const note = (txt) => add('note', txt, null, '', '', '', [], null, 'note');
  const barTilt = () => { const wd = v('wristDiff'); add('barTilt', 'Barra inclinata, una mano più bassa', wd == null ? null : wd > T.barTilt, wd == null ? '' : `Differenza del ${fmt(wd)}% della lunghezza del braccio.`, 'Un lato della barra sale o scende prima dell’altro: un lato del corpo spinge o tira di più.', 'Presa simmetrica e spinta uguale con le due braccia; lavora sul lato che resta indietro.', ['farm']); };
  const lockBack = () => { const mn = M.trunk?.min; add('lockBack', 'Busto all’indietro alla chiusura', ok(mn) ? mn < T.lockBack : null, ok(mn) ? `Tronco ${fmt(Math.abs(mn))}° indietro in cima.` : '', 'Alla fine della tirata il busto va oltre la verticale: si comprime la zona lombare.', 'Chiudi spingendo il bacino in avanti con i glutei e fermati in piedi dritto.', ['trunk']); };
  const barFoot = () => { const b = v('barFoot'); add('barFoot', 'Barra lontana dal corpo', b == null ? null : b > T.barFoot, b == null ? '' : `In basso la barra è il ${fmt(b)}% della gamba davanti al centro del piede.`, 'La barra si allontana dalle gambe: la schiena fa da leva e si carica di più.', 'Barra a contatto con tibie e cosce per tutta la salita; dorsali attivi, come a spingere la barra verso di te.', ['uarm', 'farm']); };
  if (fam === 'deadlift' || fam === 'rdl') {
    if (view !== 'side') { frontBilateral(add, v, T, false, false); barTilt(); return; }
    const knee = v('knee'), hip = v('hip');
    barFoot();
    if (fam === 'deadlift') {
      const sb = v('shoulderBar');
      add('shoulders', 'Spalle dietro la barra alla partenza', sb == null ? null : sb < T.shoulderBehind, sb == null ? '' : `Spalle ${fmt(Math.abs(sb))}% della gamba ${sb < 0 ? 'dietro' : 'davanti a'} la barra.`, 'Le spalle partono dietro la barra: il bacino è basso e lo stacco somiglia a uno squat.', 'Spalle appena davanti alla barra, scapole sopra la barra.', ['trunk']);
      if (id === 'deadlift') {
        add('hipsHigh', 'Anche alte, gambe quasi tese alla partenza', knee == null ? null : knee < T.hipsHigh, knee == null ? '' : `Ginocchio piegato di ${fmt(knee)}°.`, 'Le gambe spingono poco: il lavoro passa quasi tutto alla schiena.', 'Piega di più le ginocchia prima di tirare, petto alto e tibie vicine alla barra.', ['thigh', 'shin']);
        add('hipsLow', 'Bacino troppo basso alla partenza', knee == null ? null : knee > T.hipsLow, knee == null ? '' : `Ginocchio piegato di ${fmt(knee)}°.`, 'Il bacino parte molto basso, come in uno squat: le spalle finiscono dietro la barra.', 'Alza un po’ il bacino finché le spalle sono appena davanti alla barra.', ['thigh']);
      }
    } else {
      const lim = id === 'stiff' ? T.stiffKnee : T.rdlKnee;
      add('kneeBend', 'Ginocchia troppo piegate', knee == null ? null : knee > lim, knee == null ? '' : `Ginocchio piegato di ${fmt(knee)}°.`, 'Le ginocchia si piegano molto: il movimento diventa uno stacco da terra e la parte posteriore della coscia lavora meno.', 'Ginocchia morbide ma ferme; spingi il bacino indietro, come per chiudere una porta con i glutei.', ['thigh', 'shin']);
      add('depth', 'Discesa limitata', hip == null ? null : hip < T.rdlHip, hip == null ? '' : `Anca piegata di ${fmt(hip)}°.`, 'Il busto si piega poco dalle anche.', 'Scendi finché senti tirare dietro le cosce con la schiena lunga; spesso conta la mobilità posteriore della coscia.', ['trunk']);
    }
    lockBack(); note(back); return;
  }
  if (fam === 'slrdl') {
    const knee = v('knee'), tr = v('trunk');
    add('kneeBend', 'Ginocchio d’appoggio troppo piegato', knee == null ? null : knee > T.slKnee, knee == null ? '' : `Ginocchio piegato di ${fmt(knee)}°.`, 'La gamba d’appoggio si piega molto: lavora più la coscia davanti che quella dietro.', 'Ginocchio morbido ma fermo, il movimento parte dall’anca.', ['thigh', 'shin']);
    add('depth', 'Discesa limitata', tr == null ? null : tr < T.slTrunk, tr == null ? '' : `Busto a ${fmt(tr)}° dalla verticale.`, 'Il busto scende poco verso l’orizzontale.', 'Busto e gamba dietro si muovono insieme come una leva; scendi con controllo.', ['trunk']);
    note('La rotazione del bacino verso l’esterno si valuta guardando il video da dietro.'); return;
  }
  if (fam === 'bench' || fam === 'pushup') {
    if (view !== 'side') {
      barTilt();
      for (const s of ['L', 'R']) {
        const f = v(`forearmFront_${s}`);
        add(`forearm_${s}`, `Polso fuori dalla linea del gomito, braccio ${SIDE_M[s]}`, f == null ? null : Math.abs(f) > T.wristOut, f == null ? '' : `Avambraccio inclinato di ${fmt(Math.abs(f))}° verso ${f > 0 ? 'l’esterno' : 'l’interno'}.`, 'Vista dai piedi, in basso la mano non è sopra il gomito.', 'Regola la larghezza della presa finché gli avambracci sono verticali con la barra al petto.', ['farm'], s);
      }
      return;
    }
    const at = v('armTrunk'), el = v('elbow'), lim = id === 'closegrip' ? T.flare - 10 : T.flare;
    add('flare', 'Gomiti molto aperti', at == null ? null : at > lim, at == null ? '' : `Braccio a ${fmt(at)}° dal tronco, visto di lato (stima).`, 'I gomiti si allontanano dal corpo: la spalla lavora in una posizione più delicata.', 'Porta i gomiti un po’ verso i fianchi, circa a 45-70° dal corpo.', ['uarm']);
    add('depth', fam === 'pushup' ? 'Discesa incompleta, petto lontano da terra' : 'Discesa incompleta, barra lontana dal petto', el == null ? null : el < T.benchDepth, el == null ? '' : `Gomito piegato di ${fmt(el)}°.`, 'Il movimento si ferma prima: si allena solo una parte dell’escursione.', fam === 'pushup' ? 'Scendi finché il petto è a un pugno da terra; se serve, appoggia le ginocchia.' : 'Porta la barra a sfiorare il petto, controllando la discesa; riduci il carico se serve.', ['uarm', 'farm']);
    if (fam === 'bench') {
      const f = v('forearmVert');
      add('forearm', 'Avambraccio non verticale in basso', f == null ? null : Math.abs(f) > T.forearm, f == null ? '' : `Polso ${fmt(Math.abs(f))}° ${f > 0 ? 'verso la testa' : 'verso i piedi'} rispetto al gomito.`, 'Con la barra al petto il polso non è sopra il gomito: la spinta si disperde e carica di più spalla o tricipite.', 'Controlla in basso che polso e gomito siano sulla stessa verticale; regola la presa.', ['farm']);
      const lift = repRange(sm, 'bodyLine');
      add('hipLift', 'Bacino che si alza durante la spinta', lift == null ? null : lift > T.hipLift, lift == null ? '' : `Il bacino si muove del ${fmt(lift)}% della gamba a ogni ripetizione.`, 'Durante la salita il bacino si stacca o si muove: la schiena si inarca per aiutare la spinta.', 'Glutei sulla panca per tutta la ripetizione e piedi spinti a terra; riduci il carico se serve.', ['trunk', 'thigh']);
    } else {
      const bl = v('bodyLine');
      add('sag', 'Bacino che cede verso terra', bl == null ? null : bl < T.sag, bl == null ? '' : `Bacino il ${fmt(Math.abs(bl))}% della gamba sotto la linea spalla-caviglia.`, 'Il bacino scende e la schiena si inarca: l’addome tiene poco.', 'Addome e glutei stretti, corpo dritto come una tavola dalla testa ai talloni.', ['trunk', 'thigh']);
      add('pike', 'Bacino troppo alto', bl == null ? null : bl > T.pike, bl == null ? '' : `Bacino il ${fmt(bl)}% della gamba sopra la linea spalla-caviglia.`, 'Il bacino resta in alto e il corpo fa una V: le braccia lavorano meno.', 'Abbassa il bacino in linea con spalle e talloni.', ['trunk', 'thigh']);
    }
    return;
  }
  if (fam === 'pull' || fam === 'latpull') {
    const ch = v('chinBar');
    add('chin', fam === 'latpull' ? 'La barra non arriva al mento' : 'Il mento non supera le mani', ch == null ? null : ch < T.chin, ch == null ? '' : `In alto il mento è il ${fmt(Math.abs(ch))}% del braccio ${ch < 0 ? 'sotto' : 'sopra'} le mani.`, 'La salita si ferma prima del punto più alto.', 'Tira i gomiti verso i fianchi e il petto verso la barra; riduci il carico o usa un elastico se serve.', ['uarm', 'farm']);
    if (view !== 'side') {
      const mn = M.elbowAvg?.min, st = v('shTilt'), tl = v('trunkLat');
      add('hang', 'Non scende a braccia distese', ok(mn) ? mn > T.hangArms : null, ok(mn) ? `In basso i gomiti restano piegati di ${fmt(mn)}°.` : '', 'Tra una ripetizione e l’altra le braccia non si distendono: il movimento resta corto.', 'Scendi controllato fino a braccia quasi distese, con le spalle attive.', ['farm']);
      add('shoulders', 'Spalle non alla stessa altezza', st == null ? null : Math.abs(st) > T.pullTilt, st == null ? '' : `Più bassa a ${st > 0 ? 'destra' : 'sinistra'} di ${fmt(Math.abs(st), 1)}°.`, 'Un lato sale più dell’altro: un braccio tira di più.', 'Tira allo stesso modo con le due braccia; lavora sul lato più debole.', ['shoulders']);
      add('trunkLat', 'Corpo che si inclina di lato', tl == null ? null : Math.abs(tl) > T.pullLat, tl == null ? '' : `Verso ${tl > 0 ? 'destra' : 'sinistra'} di ${fmt(Math.abs(tl), 1)}°.`, 'Il corpo si piega o ruota durante la salita.', 'Corpo fermo e centrato sotto la barra.', ['trunk']);
    } else {
      const sw = repRange(sm, 'trunk'), hp = M.hip?.max;
      add('swing', fam === 'latpull' ? 'Busto che va avanti e indietro' : 'Corpo che oscilla (slancio)', sw == null ? null : sw > T.swing, sw == null ? '' : `Il corpo si inclina di ${fmt(sw)}° a ogni ripetizione.`, 'Lo slancio del corpo aiuta la salita al posto delle braccia.', fam === 'latpull' ? 'Busto appena inclinato e fermo; tira solo con le braccia.' : 'Parti fermo da appeso, con addome e glutei stretti.', ['trunk']);
      if (fam === 'pull') add('kip', 'Gambe che spingono in avanti', ok(hp) ? hp > T.kip : null, ok(hp) ? `Anca piegata fino a ${fmt(hp)}°.` : '', 'Le gambe calciano in avanti per dare slancio.', 'Gambe ferme, unite e un po’ avanti al corpo.', ['thigh']);
    }
    return;
  }
  if (fam === 'row') {
    const rg = repRange(sm, 'trunk'), el = v('elbow');
    add('trunkRise', 'Busto che si alza durante la tirata', rg == null ? null : rg > T.rowTrunk, rg == null ? '' : `Il busto cambia inclinazione di ${fmt(rg)}° a ogni ripetizione.`, 'A ogni tirata il busto si raddrizza: lo slancio aiuta a sollevare il peso.', 'Busto fermo e inclinato; riduci il carico.', ['trunk']);
    add('short', 'Tirata corta', el == null ? null : el < T.rowElbow, el == null ? '' : `Gomito piegato di ${fmt(el)}°.`, 'I gomiti non arrivano indietro: il movimento resta corto.', 'Porta i gomiti indietro e le scapole una verso l’altra.', ['uarm', 'farm']);
    note(back);
  }
}

// Ginocchia, bacino, busto e spalle viste da davanti o da dietro, con i due piedi a terra.
function frontBilateral(add, v, T, overhead = false, narrow = true) {
  for (const s of ['L', 'R']) {
    const sh = v(`shin_${s}`);
    add(`valgus_${s}`, `Ginocchio ${SIDE_M[s]} verso l’interno`, sh == null ? null : sh > T.valgus, sh == null ? '' : `Tibia inclinata ${fmt(sh, 1)}° verso l’interno.`,
      'Scendendo il ginocchio cede verso l’interno invece di restare sopra il piede (valgo dinamico).', 'Spingi le ginocchia in fuori, in linea con le punte dei piedi. Un elastico sopra le ginocchia aiuta a sentirlo.', ['thigh', 'shin'], s);
  }
  const ka = narrow ? v('kneeAnkle') : null;
  if (narrow) add('narrow', 'Ginocchia più strette dei piedi', ka == null ? null : ka < T.kneesNarrow, ka == null ? '' : `Distanza tra le ginocchia al ${fmt(ka)}% di quella tra le caviglie.`,
    'Al punto più basso le ginocchia si avvicinano tra loro.', 'Apri le ginocchia verso l’esterno per tutta la discesa.', ['shin']);
  const pv = v('pelvis');
  add('pelvis', 'Bacino non in piano', pv == null ? null : Math.abs(pv) > T.pelvis, pv == null ? '' : `Più basso a ${pv > 0 ? 'destra' : 'sinistra'} di ${fmt(Math.abs(pv), 1)}°.`,
    'Un lato del bacino scende più dell’altro: spesso si carica di più una gamba.', 'Distribuisci il peso in modo uguale sui due piedi; controlla la mobilità di anca e caviglia del lato che scende.', ['pelvis'], pv > 0 ? 'R' : 'L');
  const hs = v('hipShift');
  add('shift', 'Peso spostato di lato', hs == null ? null : Math.abs(hs) > T.shift, hs == null ? '' : `Bacino spostato verso ${hs > 0 ? 'destra' : 'sinistra'} del ${fmt(Math.abs(hs))}% della distanza tra i piedi.`,
    'Scendendo il bacino si sposta verso un lato: quella gamba lavora di più.', 'Scendi al centro tra i piedi; aiuta guardarsi allo specchio o rallentare la discesa.', ['pelvis', 'trunk'], hs > 0 ? 'R' : 'L');
  const tl = v('trunkLat');
  add('trunkLat', 'Busto inclinato di lato', tl == null ? null : Math.abs(tl) > T.trunkLat, tl == null ? '' : `Verso ${tl > 0 ? 'destra' : 'sinistra'} di ${fmt(Math.abs(tl), 1)}°.`,
    'Il busto non resta al centro e si piega verso un lato.', 'Busto dritto, spalle sopra il bacino.', ['trunk']);
  const st = v('shTilt');
  add('shoulders', 'Spalle non in piano', st == null ? null : Math.abs(st) > T.shoulders, st == null ? '' : `Più bassa a ${st > 0 ? 'destra' : 'sinistra'} di ${fmt(Math.abs(st), 1)}°.`,
    'Una spalla scende più dell’altra.', 'Tieni le spalle alla stessa altezza; con il bilanciere controlla che sia centrato.', ['shoulders']);
  if (overhead) {
    const wd = v('wristDiff');
    add('wrists', 'Una mano più bassa dell’altra', wd == null ? null : wd > T.wrists, wd == null ? '' : `Differenza del ${fmt(wd)}% della lunghezza del braccio.`,
      'Le braccia sopra la testa non salgono alla stessa altezza.', 'Spingi in alto con entrambe le mani allo stesso modo; verifica la mobilità della spalla più bassa.', ['uarm', 'farm']);
  }
}
// Numera solo gli errori, nello stesso ordine della lista.
export function numbered(findings) {
  let n = 0;
  return findings.map((f) => ({ ...f, n: f.state === 'flag' ? ++n : 0 }));
}

/* ---------- figura ---------- */
const L_SH = 0.25, L_TH = 0.25, L_TR = 0.3, L_UA = 0.165, L_FA = 0.15, HEAD = 0.055;
const f1 = (x) => (Math.round(x * 10) / 10).toString();

// Pose di lato, il soggetto guarda verso destra. Angoli in gradi.
function sidePose(o) {
  const tibia = clamp(o.tibia ?? 0, -20, 60), thigh = clamp(o.thigh ?? 90, -40, 90), trunk = clamp(o.trunk ?? 0, -45, 90), { sh = 10, el = 15, lunge = false } = o;
  const A = [0, 0], K = [A[0] + L_SH * Math.sin(tibia * rad), A[1] - L_SH * Math.cos(tibia * rad)];
  const H = [K[0] - L_TH * Math.cos(thigh * rad), K[1] - L_TH * Math.sin(thigh * rad)];
  const S = [H[0] + L_TR * Math.sin(trunk * rad), H[1] - L_TR * Math.cos(trunk * rad)];
  const a1 = (sh - trunk) * rad, E = [S[0] + L_UA * Math.sin(a1), S[1] + L_UA * Math.cos(a1)];
  const a2 = a1 + el * rad, W = [E[0] + L_FA * Math.sin(a2), E[1] + L_FA * Math.cos(a2)];
  const Hd = [S[0] + 0.1 * Math.sin(trunk * rad) + 0.015, S[1] - 0.1 * Math.cos(trunk * rad)];
  const pose = { A, K, H, S, E, W, Hd, heel: [-0.03, 0.02], toe: [0.09, 0.02] };
  if (o.back) { // gamba libera tesa all'indietro, in linea con il busto
    const b = [-Math.sin(trunk * rad), Math.cos(trunk * rad)], RK = [H[0] + b[0] * L_TH, H[1] + b[1] * L_TH], RA = [RK[0] + b[0] * L_SH, RK[1] + b[1] * L_SH];
    Object.assign(pose, { RA, RK, rheel: RA, rtoe: [RA[0] + 0.02, RA[1] + 0.06] });
  }
  if (lunge) { // gamba dietro, ginocchio verso terra
    const RA = [H[0] - 0.42, 0], RK = [H[0] - 0.12, -0.06];
    Object.assign(pose, { RA, RK, rheel: [RA[0] - 0.02, 0.02], rtoe: [RA[0] + 0.07, 0.02] });
  }
  return pose;
}
// Pose vista da davanti o da dietro. g(s) = verso nell'immagine del lato s (+1 a destra nell'immagine).
// I valori sono limitati a intervalli plausibili, così una ripresa sbagliata non deforma il disegno.
const clamp = (v, lo, hi) => (ok(v) ? Math.max(lo, Math.min(hi, v)) : v);
function frontPose(o0, view) {
  const o = { ...o0, shift: clamp(o0.shift, -35, 35), pelvis: clamp(o0.pelvis, -20, 20), shTilt: clamp(o0.shTilt, -20, 20), trunkLat: clamp(o0.trunkLat, -30, 30), drop: clamp(o0.drop, -20, 20), descent: clamp(o0.descent, 0, 75), shin_L: clamp(o0.shin_L, -30, 35), shin_R: clamp(o0.shin_R, -30, 35) };
  const sR = view === 'rear' ? 1 : -1, g = (s) => (s === 'R' ? sR : -sR);
  const aw = 0.11, hw = 0.085, sw = 0.12;
  const hipH = 0.5 - (o.descent ?? 0) / 100 * 0.5 * 0.9;
  const Pc = [g('R') * (o.shift ?? 0) / 100 * aw * 2, -hipH];
  const pv = (o.pelvis ?? 0) * rad, P = {};
  for (const s of ['L', 'R']) {
    const lift = o.single && s !== o.work;
    const dropY = o.single && s !== o.work ? Math.sin((o.drop ?? 0) * rad) * hw * 2 : 0;
    P[`H${s}`] = [Pc[0] + g(s) * hw * Math.cos(pv), Pc[1] + (s === 'R' ? 1 : -1) * hw * Math.sin(pv) + dropY];
    if (lift) {
      P[`A${s}`] = [P[`H${s}`][0] + g(s) * 0.04, P[`H${s}`][1] + 0.22]; P[`K${s}`] = [P[`H${s}`][0] + g(s) * 0.02, P[`H${s}`][1] + 0.11];
    } else {
      const A = [g(s) * aw, 0], fi = (o[`shin_${s}`] ?? 0) * rad;
      const kh = Math.min(L_SH, Math.max(0.12, -P[`H${s}`][1] * 0.52));
      P[`A${s}`] = A; P[`K${s}`] = [A[0] - g(s) * kh * Math.tan(fi), -kh];
    }
    P[`F${s}`] = [P[`A${s}`][0] + g(s) * 0.035, P[`A${s}`][1] + 0.02];
  }
  const tl = (o.trunkLat ?? 0) * rad, Sc = [Pc[0] + g('R') * L_TR * Math.sin(tl), Pc[1] - L_TR * Math.cos(tl)];
  const st = (o.shTilt ?? 0) * rad;
  for (const s of ['L', 'R']) {
    P[`S${s}`] = [Sc[0] + g(s) * sw * Math.cos(st), Sc[1] + (s === 'R' ? 1 : -1) * sw * Math.sin(st)];
    const ab = (o[`abd_${s}`] ?? 12) * rad, el = (o[`el_${s}`] ?? 6) * rad;
    const S = P[`S${s}`], E = [S[0] + g(s) * L_UA * Math.sin(ab), S[1] + L_UA * Math.cos(ab)];
    P[`E${s}`] = E; P[`W${s}`] = [E[0] + g(s) * L_FA * Math.sin(ab + el), E[1] + L_FA * Math.cos(ab + el)];
  }
  P.Pc = Pc; P.Sc = Sc; P.Hd = [Sc[0] + g('R') * 0.11 * Math.sin(tl), Sc[1] - 0.11 * Math.cos(tl)];
  P.g = g;
  return P;
}

// Segmenti della figura con il nome usato dagli errori.
function ik2(S, W, a, b, pick) {
  const dx = W[0] - S[0], dy = W[1] - S[1], d = Math.max(1e-4, Math.min(Math.hypot(dx, dy), a + b - 1e-4)), base = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const E1 = [S[0] + a * Math.cos(base + al), S[1] + a * Math.sin(base + al)], E2 = [S[0] + a * Math.cos(base - al), S[1] + a * Math.sin(base - al)];
  return pick(E1) >= pick(E2) ? E1 : E2;
}
const reach = (flex) => Math.sqrt(L_UA ** 2 + L_FA ** 2 - 2 * L_UA * L_FA * Math.cos((180 - clamp(flex, 0, 175)) * rad));
// Sdraiato sulla panca, testa a sinistra.
function liePose(phi, psi) {
  const S = [-0.18, -0.25], H = [0.12, -0.25], K = [0.33, -0.29], A = [0.37, 0], ua = 0.13;
  const E = [S[0] + ua * Math.cos(clamp(phi, -90, 100) * rad), S[1] + ua * Math.sin(clamp(phi, -90, 100) * rad)], W = [E[0] - L_FA * Math.sin(clamp(psi, -60, 60) * rad), E[1] - L_FA * Math.cos(clamp(psi, -60, 60) * rad)];
  return { S, H, K, A, E, W, heel: [0.35, 0.02], toe: [0.44, 0.02], Hd: [-0.29, -0.28] };
}
// Piegamenti: mani a terra, testa a sinistra.
function pushPose(flex, line) {
  const W = [0, 0], d = reach(flex), S = [0.03, -d], A = [0.62, -0.01];
  const E = ik2(S, W, L_UA, L_FA, (e) => e[0]);
  const lerp = (k) => [S[0] + (A[0] - S[0]) * k, S[1] + (A[1] - S[1]) * k];
  const up = -clamp(line, -30, 30) / 100 * 0.5, H = lerp(0.45), K = lerp(0.72); H[1] += up; K[1] += up * 0.4;
  return { S, H, K, A, E, W, heel: [0.62, -0.02], toe: [0.645, 0.02], Hd: [S[0] - 0.1, S[1] - 0.01] };
}
// Appeso alla barra, di lato, rivolto verso destra.
function hangSide(flex, trunk, hip) {
  const W = [0.03, -1], d = reach(flex), S = [-0.02, -1 + Math.sqrt(Math.max(d * d - 0.0025, 1e-4))];
  const E = ik2(S, W, L_UA, L_FA, (e) => e[0]);
  const tr = clamp(trunk, -40, 40) * rad, hp = clamp(hip, 0, 100) * rad;
  const H = [S[0] - Math.sin(tr) * L_TR, S[1] + Math.cos(tr) * L_TR], K = [H[0] + Math.sin(hp) * L_TH, H[1] + Math.cos(hp) * L_TH], A = [K[0] + Math.sin(hp * 0.5) * L_SH, K[1] + Math.cos(hp * 0.5) * L_SH];
  return { S, H, K, A, E, W, heel: A, toe: [A[0] + 0.06, A[1] + 0.02], Hd: [S[0] + 0.015, S[1] - 0.1] };
}
// Appeso alla barra, visto da davanti o da dietro.
function hangFront(o, view) {
  const sR = view === 'rear' ? 1 : -1, g = (s) => (s === 'R' ? sR : -sR), P = { g }, st = clamp(o.shTilt ?? 0, -20, 20) * rad;
  for (const s of ['L', 'R']) {
    const W = [g(s) * 0.2, -1], d = reach(o[`elbow_${s}`] ?? 0), dx = 0.08;
    const S = [g(s) * 0.12, -1 + Math.sqrt(Math.max(d * d - dx * dx, 1e-4)) + (s === 'R' ? 1 : -1) * Math.sin(st) * 0.12];
    P[`S${s}`] = S; P[`W${s}`] = W; P[`E${s}`] = ik2(S, W, L_UA, L_FA, (e) => Math.abs(e[0]));
  }
  const tl = clamp(o.trunkLat ?? 0, -30, 30) * rad, Sc = [(P.SL[0] + P.SR[0]) / 2, (P.SL[1] + P.SR[1]) / 2];
  const Pc = [Sc[0] - g('R') * Math.sin(tl) * L_TR, Sc[1] + Math.cos(tl) * L_TR];
  for (const s of ['L', 'R']) {
    const H = [Pc[0] + g(s) * 0.085, Pc[1]], K = [H[0] + g(s) * 0.01, H[1] + L_TH], A = [K[0] + g(s) * 0.01, K[1] + L_SH];
    P[`H${s}`] = H; P[`K${s}`] = K; P[`A${s}`] = A; P[`F${s}`] = [A[0] + g(s) * 0.03, A[1] + 0.03];
  }
  Object.assign(P, { Sc, Pc, Hd: [Sc[0], Sc[1] - 0.11] });
  return P;
}
function sideSegs(p) {
  const s = [['shin', p.A, p.K], ['thigh', p.K, p.H], ['trunk', p.H, p.S], ['uarm', p.S, p.E], ['farm', p.E, p.W], ['foot', p.heel, p.toe]];
  if (p.RA) s.push(['rshin', p.RA, p.RK], ['rthigh', p.RK, p.H], ['rfoot', p.rheel, p.rtoe]);
  return s;
}
function frontSegs(p) {
  const s = [['pelvis', p.HL, p.HR], ['shoulders', p.SL, p.SR], ['trunk', p.Pc, p.Sc]];
  for (const k of ['L', 'R']) s.push([`thigh_${k}`, p[`H${k}`], p[`K${k}`]], [`shin_${k}`, p[`K${k}`], p[`A${k}`]], [`foot_${k}`, p[`A${k}`], p[`F${k}`]], [`uarm_${k}`, p[`S${k}`], p[`E${k}`]], [`farm_${k}`, p[`E${k}`], p[`W${k}`]]);
  return s;
}

// Angoli misurati e di riferimento per la figura di una serie.
function figureAngles(set) {
  const proto = protocolById(set.protocolId, set.customSpec);
  if (!proto || proto.custom || proto.id === 'wrist') return null;
  const M = set.summary?.metrics ?? {}, view = set.view, sm = set.summary ?? {};
  const v = (id, d = null) => (ok(M[id]?.peakMean) ? M[id].peakMean : d);
  const id = proto.id, grp = proto.group;
  if (grp === 'squat' && view === 'side') {
    const lunge = ['split', 'bulgarian', 'lunge'].includes(id);
    const trunkRef = TRUNK_REF[id] ?? 40, tibiaRef = TIBIA_REF[id] ?? 34;
    const absArm = ['highbar', 'lowbar'].includes(id) ? { a: -20, el: 150 } : id === 'frontsquat' ? { a: 95, el: 150 } : id === 'goblet' ? { a: 40, el: 130 } : { a: 88, el: 5 };
    const armsFor = (trunk) => ({ sh: absArm.a + trunk, el: absArm.el });
    if (lunge) {
      const kn = v('knee'); if (kn == null) return null;
      const tib = Math.min(30, Math.max(0, v('tibia', 12)));
      return { kind: 'side', lunge: true, me: { tibia: tib, thigh: 90 - (kn - tib), trunk: v('trunk', 8), ...armsFor(v('trunk', 8)), lunge: true }, ref: { tibia: 12, thigh: 2, trunk: trunkRef, ...armsFor(trunkRef), lunge: true } };
    }
    const thigh = v('thigh'), tibia = v('tibia'); if (thigh == null || tibia == null) return null;
    const meArms = id === 'overhead' ? { sh: 180 - v('armVert', 5) + v('trunk', 30), el: 0 } : armsFor(v('trunk', 30));
    const refArms = id === 'overhead' ? { sh: 180 + trunkRef, el: 0 } : armsFor(trunkRef);
    return { kind: 'side', me: { tibia, thigh, trunk: v('trunk', 30), ...meArms }, ref: { tibia: tibiaRef, thigh: -3, trunk: trunkRef, ...refArms } };
  }
  if (grp === 'squat') {
    const uni = !!proto.views[view]?.metrics.find((m) => m.id === 'drop');
    const work = sm.work === 'R' ? 'R' : 'L';
    const armsUp = id === 'overhead' ? { abd_L: v('abd_L', 170), abd_R: v('abd_R', 170), el_L: 3, el_R: 3 } : {};
    const refArms = id === 'overhead' ? { abd_L: 172, abd_R: 172, el_L: 3, el_R: 3 } : {};
    if (uni) {
      const vg = v('valgus'); if (vg == null) return null;
      return { kind: 'front', view, me: { single: true, work, [`shin_${work}`]: vg / 2, drop: v('drop', 0), trunkLat: v('trunkLat', 0), shTilt: v('shTilt', 0), descent: v('descent', 30) }, ref: { single: true, work, descent: v('descent', 30) } };
    }
    if (v('shin_L') == null && v('shin_R') == null) return null;
    return { kind: 'front', view, me: { shin_L: v('shin_L', 0), shin_R: v('shin_R', 0), pelvis: v('pelvis', 0), shTilt: v('shTilt', 0), trunkLat: v('trunkLat', 0), shift: v('hipShift', 0), descent: v('descent', 40), ...armsUp }, ref: { shin_L: 0, shin_R: 0, descent: v('descent', 40), ...refArms } };
  }
  if (grp === 'lift') return liftFigure(proto, view, v, sm);
  // Arti superiori
  if (view === 'side') {
    const trunk = v('trunk', 0);
    if (id === 'flex') { const x = v('shoulder'); if (x == null) return null; return { kind: 'side', stand: true, me: { thigh: 90, trunk, sh: x, el: 5 }, ref: { thigh: 90, trunk: 0, sh: 180, el: 0 } }; }
    if (id === 'ext') { const x = v('shoulder'); if (x == null) return null; return { kind: 'side', stand: true, me: { thigh: 90, trunk, sh: x, el: 5 }, ref: { thigh: 90, trunk: 0, sh: -55, el: 0 } }; }
    if (id === 'elbow') { const x = v('elbow'); if (x == null) return null; return { kind: 'side', stand: true, me: { thigh: 90, trunk, sh: v('shoulder', 4), el: x }, ref: { thigh: 90, trunk: 0, sh: 0, el: 145 } }; }
    if (id === 'rot') { const x = v('forearm'); if (x == null) return null; return { kind: 'side', stand: true, me: { thigh: 90, trunk: 0, sh: 90, el: x }, ref: { thigh: 90, trunk: 0, sh: 90, el: 90 } }; }
    return null;
  }
  const base = { trunkLat: v('trunkLat', 0), shTilt: v('shTilt', 0), descent: 0 };
  if (id === 'abd' || id === 'press') {
    if (v('abd_L') == null && v('abd_R') == null) return null;
    return { kind: 'front', view, me: { ...base, abd_L: v('abd_L', 0), abd_R: v('abd_R', 0), el_L: id === 'press' ? -v('elbow_L', 5) : 3, el_R: id === 'press' ? -v('elbow_R', 5) : 3 }, ref: { abd_L: 178, abd_R: 178, el_L: 0, el_R: 0, descent: 0 } };
  }
  if (id === 'elbow') {
    if (v('elbow_L') == null && v('elbow_R') == null) return null;
    return { kind: 'front', view, me: { ...base, abd_L: 4, abd_R: 4, el_L: -v('elbow_L', 0), el_R: -v('elbow_R', 0) }, ref: { abd_L: 4, abd_R: 4, el_L: -145, el_R: -145, descent: 0 } };
  }
  return null;
}

const HINGE_REF = { deadlift: { tibia: 12, thigh: 25, trunk: 55 }, sumodl: { tibia: 8, thigh: 12, trunk: 40 }, trapbar: { tibia: 20, thigh: 15, trunk: 40 }, rdl: { tibia: 4, thigh: 74, trunk: 75 }, stiff: { tibia: 0, thigh: 84, trunk: 80 } };
function liftFigure(proto, view, v, sm) {
  const fam = proto.family, id = proto.id, bar = [[-0.34, -1], [0.34, -1]];
  if (fam === 'deadlift' || fam === 'rdl') {
    if (view !== 'side') {
      if (v('shin_L') == null && v('shin_R') == null) return null;
      return { kind: 'front', view, me: { shin_L: v('shin_L', 0), shin_R: v('shin_R', 0), pelvis: v('pelvis', 0), shTilt: v('shTilt', 0), trunkLat: v('trunkLat', 0), shift: v('hipShift', 0), descent: v('descent', 20), abd_L: 4, abd_R: 4 }, ref: { descent: v('descent', 20), abd_L: 4, abd_R: 4 } };
    }
    const thigh = v('thigh'), tibia = v('tibia'), trunk = v('trunk', 50); if (thigh == null || tibia == null) return null;
    const r = HINGE_REF[id] ?? HINGE_REF.deadlift, arm = clamp(v('barFoot', 0) * 0.7, -20, 35);
    return { kind: 'side', plate: true, me: { tibia, thigh, trunk, sh: arm + trunk, el: 0 }, ref: { ...r, sh: r.trunk, el: 0 } };
  }
  if (fam === 'slrdl') {
    const kn = v('knee'), tr = v('trunk'); if (kn == null || tr == null) return null;
    return { kind: 'side', plate: true, me: { tibia: 4, thigh: 90 - (kn - 4), trunk: tr, sh: tr, el: 0, back: true }, ref: { tibia: 4, thigh: 76, trunk: 82, sh: 82, el: 0, back: true } };
  }
  if (fam === 'row') {
    const tr = v('trunk'), el = v('elbow'); if (tr == null || el == null) return null;
    return { kind: 'side', plate: true, me: { tibia: 8, thigh: 73, trunk: tr, sh: v('shoulder', -40), el }, ref: { tibia: 8, thigh: 73, trunk: 45, sh: -55, el: 100 } };
  }
  if (fam === 'bench') {
    if (view !== 'side' || v('armTrunk') == null) return null;
    return { kind: 'side', poses: true, noflip: true, lines: [[[-0.36, -0.22], [0.22, -0.22]]], me: liePose(v('armTrunk'), v('forearmVert', 0)), ref: liePose(id === 'closegrip' ? 35 : 50, 0) };
  }
  if (fam === 'pushup') {
    if (v('elbow') == null) return null;
    return { kind: 'side', poses: true, noflip: true, me: pushPose(v('elbow'), v('bodyLine', 0)), ref: pushPose(Math.max(v('elbow'), 110), 0) };
  }
  if (fam === 'pull' || fam === 'latpull') {
    if (view === 'side') {
      if (v('elbow') == null) return null;
      return { kind: 'side', poses: true, lines: [bar], me: hangSide(v('elbow'), v('trunk', 0), v('hip', 0)), ref: hangSide(150, 0, 0) };
    }
    if (v('elbow_L') == null && v('elbow_R') == null) return null;
    return { kind: 'front', view, poses: true, lines: [bar], me: hangFront({ elbow_L: v('elbow_L', 0), elbow_R: v('elbow_R', 0), shTilt: v('shTilt', 0), trunkLat: v('trunkLat', 0) }, view), ref: hangFront({ elbow_L: 145, elbow_R: 145 }, view) };
  }
  return null;
}

function badge(x, y, n) { return `<g class="mf-badge" transform="translate(${f1(x)} ${f1(y)})"><circle r="12"/><text y="5">${n}</text></g>`; }

// SVG della figura: riferimento tratteggiato sotto, persona sopra, errori a doppia linea con il numero.
export function figureSvg(set, findings) {
  const fa = figureAngles(set);
  if (!fa) return '';
  const W = 330, H = 360, S = 380, flags = findings.filter((f) => f.state === 'flag');
  let me, ref, segsOf, ox, oy = 330, flip = 1;
  if (fa.kind === 'side') {
    me = fa.poses ? fa.me : sidePose(fa.me); ref = fa.poses ? fa.ref : sidePose(fa.ref); segsOf = sideSegs;
    ox = fa.stand ? W / 2 : W * (fa.noflip ? 0.4 : 0.42);
    flip = !fa.noflip && (set.summary?.dir ?? 1) < 0 ? -1 : 1;
  } else {
    me = fa.poses ? fa.me : frontPose(fa.me, fa.view); ref = fa.poses ? fa.ref : frontPose(fa.ref, fa.view); segsOf = frontSegs; ox = W / 2;
  }
  const lines = fa.lines ?? [], PL = 0.125;
  const allPts = [...segsOf(me), ...segsOf(ref)].flatMap((s) => [s[1], s[2]]).concat([me.Hd, ref.Hd], lines.flat(), fa.plate ? [[me.W[0], me.W[1] - PL], [me.W[0] + PL, me.W[1]], [me.W[0] - PL, me.W[1]]] : []);
  const minY = Math.min(...allPts.map((p) => p[1])) - HEAD - 0.03, maxX = Math.max(...allPts.map((p) => Math.abs(p[0])));
  const sc = Math.min(S, (oy - 18) / -minY, (W / 2 - 14) / Math.max(maxX, 0.1) * (fa.kind === 'side' && !fa.stand ? 0.85 : 1));
  const P = (p) => [ox + flip * p[0] * sc, oy + p[1] * sc];
  const line = (a, b, cls) => { const A = P(a), B = P(b); return `<line x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(B[0])}" y2="${f1(B[1])}" class="${cls}"/>`; };
  const errParts = new Set();
  for (const f of flags) for (const part of f.parts) {
    if (fa.kind === 'front' && ['thigh', 'shin', 'uarm', 'farm'].includes(part)) {
      const sides = f.side ? [f.side] : ['L', 'R'];
      for (const s of sides) errParts.add(`${part}_${s}`);
    } else errParts.add(part);
  }
  let out = `<line x1="8" x2="${W - 8}" y1="${oy + 0.03 * sc}" y2="${oy + 0.03 * sc}" class="mf-ground"/>`;
  for (const [a, b] of lines) out += line(a, b, 'mf-ground');
  if (fa.plate) for (const [p, cls] of [[ref.W, 'mf-ref'], [me.W, 'mf-plate']]) { const q = P(p); out += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="${f1(PL * sc)}" class="${cls}"/>`; }
  for (const [, a, b] of segsOf(ref)) out += line(a, b, 'mf-ref');
  const hr = P(ref.Hd); out += `<circle cx="${f1(hr[0])}" cy="${f1(hr[1])}" r="${f1(HEAD * sc)}" class="mf-ref"/>`;
  for (const [name, a, b] of segsOf(me)) {
    if (errParts.has(name)) out += line(a, b, 'mf-err-o') + line(a, b, 'mf-err-i');
    else out += line(a, b, name.startsWith('r') && fa.kind === 'side' && me.RA ? 'mf-me far' : 'mf-me');
  }
  const hm = P(me.Hd); out += `<circle cx="${f1(hm[0])}" cy="${f1(hm[1])}" r="${f1(HEAD * sc)}" class="mf-head"/>`;
  const joints = fa.kind === 'side' ? [me.K, me.H, me.S, me.E] : [me.KL, me.KR, me.HL, me.HR, me.SL, me.SR, me.EL, me.ER];
  for (const j of joints) { const q = P(j); out += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="3.4" class="mf-joint"/>`; }
  // Numeri vicino al segmento sbagliato, senza sovrapporsi.
  const placed = [];
  const segMap = Object.fromEntries(segsOf(me).map(([n, a, b]) => [n, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]));
  for (const f of flags) {
    let key = f.parts[0] ?? 'trunk';
    if (fa.kind === 'front' && ['thigh', 'shin', 'uarm', 'farm'].includes(key)) key = `${key}_${f.side ?? 'L'}`;
    const m = segMap[key] ?? segMap.trunk; if (!m) continue;
    let [x, y] = P(m);
    const outward = fa.kind === 'front' ? Math.sign(x - ox) || 1 : (key === 'trunk' ? -1 : 1) * flip;
    x += outward * 26; y -= 4;
    for (let k = 0; k < 6 && placed.some((q) => Math.hypot(q[0] - x, q[1] - y) < 26); k++) y += 26;
    x = Math.max(14, Math.min(W - 14, x)); y = Math.max(14, Math.min(H - 14, y));
    placed.push([x, y]); out += badge(x, y, f.n);
  }
  if (fa.kind === 'front') {
    const lab = (s) => { const A = P(me[`A${s}`]); return `<text x="${f1(A[0])}" y="${f1(oy + 0.03 * sc + 17)}" text-anchor="middle" class="mf-small">${s === 'L' ? 'Sin' : 'Des'}</text>`; };
    out += lab('L') + lab('R');
  }
  const caption = fa.kind === 'front' ? (fa.view === 'rear' ? 'vista da dietro' : 'vista da davanti') : 'vista di lato';
  const top = Math.max(0, Math.floor(oy + minY * sc - 24)), vh = H + 12 - top;
  return `<svg viewBox="0 ${top} ${W} ${vh}" class="mf-svg" role="img" aria-label="Figura schematica, ${caption}: ${flags.length ? `${flags.length} errori numerati` : 'nessun errore oltre le soglie'}">${out}</svg>`;
}

/* ---------- testo ---------- */
const OK_NAME = { barFoot: 'barra vicina al corpo', hipsHigh: 'altezza del bacino alla partenza', hipsLow: 'altezza del bacino alla partenza', lockBack: 'chiusura in piedi', kneeBend: 'ginocchia ferme', flare: 'apertura dei gomiti', forearm: 'avambraccio verticale', hipLift: 'bacino fermo sulla panca', sag: 'linea del corpo', pike: 'linea del corpo', barTilt: 'barra in piano', chin: 'altezza raggiunta', hang: 'braccia distese in basso', swing: 'corpo fermo', kip: 'gambe ferme', trunkRise: 'busto fermo', short: 'ampiezza della tirata', depth: 'profondità', trunk: 'inclinazione del busto', ankle: 'avanzamento delle ginocchia', arms: 'braccia sopra la testa', valgus: 'ginocchio d’appoggio', valgus_L: 'ginocchio sinistro', valgus_R: 'ginocchio destro', narrow: 'distanza tra le ginocchia', pelvis: 'bacino in piano', drop: 'bacino in piano', shift: 'peso al centro', trunkLat: 'busto dritto', shoulders: 'spalle in piano', wrists: 'altezza delle mani', rom: 'ampiezza del movimento', comp: 'tronco fermo', swing: 'braccio vicino al fianco' };
function okName(f) {
  if (/^forearm_/.test(f.key)) return `avambraccio ${SIDE_M[f.side]}`;
  if (/^rom_/.test(f.key)) return `${/gomito/i.test(f.title) ? 'gomito' : 'braccio'} ${SIDE_M[f.side]}`;
  return OK_NAME[f.key] ?? f.title.toLowerCase();
}
export function findingsHtml(findings, { compact = false } = {}) {
  const flags = findings.filter((f) => f.state === 'flag'), oks = findings.filter((f) => f.state === 'ok'), notes = findings.filter((f) => f.state === 'note');
  if (!flags.length && !oks.length) return '<p class="fine">Non ci sono abbastanza ripetizioni per valutare gli errori.</p>';
  const notesHtml = notes.map((f) => `<p class="fine mf-note">${esc(f.title)}</p>`).join('');
  const li = (f) => `<li><span class="mf-num">${f.n}</span><div><b>${esc(f.title)}</b>${f.value ? ` <span class="mf-val">${esc(f.value)}</span>` : ''}<br>${esc(f.plain)}${compact ? '' : `<br><span class="mf-cue">Cosa provare: ${esc(f.cue)}</span>`}</div></li>`;
  return `${flags.length ? `<ol class="mf-list">${flags.map(li).join('')}</ol>` : '<p class="mf-good">Nessun errore oltre le soglie in questa serie.</p>'}
    ${oks.length ? `<p class="fine mf-oks">Nella norma: ${[...new Set(oks.map((f) => okName(f)))].map(esc).join(', ')}.</p>` : ''}${notesHtml}`;
}
export function legendHtml() {
  return `<ul class="mf-key"><li><svg width="30" height="10" aria-hidden="true"><line x1="0" x2="30" y1="5" y2="5" class="mf-me"/></svg>Il movimento della persona</li>
    <li><svg width="30" height="10" aria-hidden="true"><line x1="0" x2="30" y1="5" y2="5" class="mf-ref"/></svg>Riferimento</li>
    <li><svg width="30" height="12" aria-hidden="true"><line x1="3" x2="27" y1="6" y2="6" class="mf-err-o"/><line x1="3" x2="27" y1="6" y2="6" class="mf-err-i"/></svg>Parte con un errore, numerata</li></ul>`;
}
// Blocco completo per una serie: figura e spiegazione.
export function setErrorsHtml(set, { title = 'Cosa abbiamo visto', compact = false } = {}) {
  const fs = numbered(setFindings(set));
  if (!fs.length) return '';
  const fig = figureSvg(set, fs);
  return `<div class="mf"><h3>${esc(title)}</h3><div class="mf-grid${fig ? '' : ' nofig'}">${fig ? `<figure class="mf-fig">${fig}<figcaption>Al punto più basso o più alto del movimento: media delle ripetizioni. Figura schematica.</figcaption></figure>` : ''}
    <div>${findingsHtml(fs, { compact })}${fig ? legendHtml() : ''}</div></div></div>`;
}
