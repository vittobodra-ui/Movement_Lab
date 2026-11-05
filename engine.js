// Riconoscimento della posa, condiviso dai programmi. L'immagine viene ridotta prima dell'analisi: il modello
// lavora comunque a bassa risoluzione e sul PC di prova 640 px hanno quasi dimezzato i tempi rispetto a 1280 px.
const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const modelUrl = (k) => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${k}/float16/1/pose_landmarker_${k}.task`;
const local = (p) => new URL(`vendor/${p}`, import.meta.url).href;
let runtime = null;

async function exists(url) { try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; } }
async function loadRuntime() {
  if (runtime) return runtime;
  runtime = (async () => {
    const isLocal = await exists(local('vision_bundle.mjs')) && await exists(local('wasm/vision_wasm_internal.wasm'));
    const lib = await import(isLocal ? local('vision_bundle.mjs') : `${CDN}/vision_bundle.mjs`);
    const fileset = await lib.FilesetResolver.forVisionTasks(isLocal ? local('wasm') : `${CDN}/wasm`);
    return { lib, fileset };
  })();
  try { return await runtime; } catch (e) { runtime = null; throw e; }
}

export async function createPose(kind = 'full') {
  if (window.__poseFactory) return window.__poseFactory(kind); // solo per i test automatici
  const { lib, fileset } = await loadRuntime();
  const file = local(`pose_landmarker_${kind}.task`);
  const path = (await exists(file)) ? file : modelUrl(kind);
  const build = (delegate) => lib.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  let delegate = 'GPU', lm;
  try { lm = await build('GPU'); } catch { delegate = 'CPU'; lm = await build('CPU'); }
  // La prima elaborazione prepara la scheda grafica e può bloccare la pagina per diversi secondi:
  // si fa qui, mentre l'interfaccia lo dichiara, e non sul primo fotogramma della persona.
  await new Promise((r) => setTimeout(r, 60));
  const warm = document.createElement('canvas'); warm.width = 320; warm.height = 240;
  warm.getContext('2d').fillRect(0, 0, 320, 240);
  lm.detectForVideo(warm, 1);
  return { delegate, detect: (src, ts) => lm.detectForVideo(src, ts).landmarks?.[0] ?? null, close: () => lm.close() };
}
