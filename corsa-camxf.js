// Rotazione e zoom della camera: il fotogramma viene girato e ingrandito prima dell'analisi,
// così tutto il resto (riconoscimento, angoli, registrazione, referto) vede l'immagine già dritta.
const MAX_SIDE = 1280;
export const ZOOM_MAX = 3;

export class CamXf {
  constructor(saved) {
    this.rot = 0; this.zoom = 1; this.cx = 0.5; this.cy = 0.5;
    this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d');
    if (saved) this.set(saved);
  }
  get active() { return this.rot !== 0 || this.zoom > 1.001; }
  get json() { return { rot: this.rot, zoom: +this.zoom.toFixed(2), cx: +this.cx.toFixed(3), cy: +this.cy.toFixed(3) }; }
  set({ rot = this.rot, zoom = this.zoom, cx = this.cx, cy = this.cy } = {}) {
    this.rot = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
    this.zoom = Math.min(ZOOM_MAX, Math.max(1, zoom));
    const m = 0.5 / this.zoom;
    this.cx = Math.min(1 - m, Math.max(m, cx)); this.cy = Math.min(1 - m, Math.max(m, cy));
  }
  // Dimensioni dell'immagine dopo la rotazione.
  size(video) {
    const w = video?.videoWidth || 1280, h = video?.videoHeight || 720;
    const [rw, rh] = this.rot % 180 ? [h, w] : [w, h];
    const sc = Math.min(1, MAX_SIDE / Math.max(rw, rh));
    return [Math.round(rw * sc), Math.round(rh * sc)];
  }
  draw(video) {
    const [W, H] = this.size(video), c = this.ctx;
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    const vw = video.videoWidth || W, vh = video.videoHeight || H;
    const fit = this.rot % 180 ? W / vh : W / vw;
    c.save();
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.translate(W / 2, H / 2); c.scale(this.zoom, this.zoom);
    c.translate(-(this.cx - 0.5) * W, -(this.cy - 0.5) * H);
    c.rotate(this.rot * Math.PI / 180);
    c.drawImage(video, -vw * fit / 2, -vh * fit / 2, vw * fit, vh * fit);
    c.restore();
    return this.canvas;
  }
}

// Pulsanti sopra il video, rotellina per lo zoom, trascinamento per spostare l'inquadratura ingrandita.
// onChange(final): final è vero quando l'utente ha finito (per salvare e rifare l'analisi).
export function xfControls(stage, xf, onChange) {
  const box = document.createElement('div');
  box.className = 'xf-tools';
  box.innerHTML = `<button type="button" data-a="rot" title="Ruota di 90°, per la camera in verticale" aria-label="Ruota di 90 gradi">↻</button>
    <button type="button" data-a="out" title="Allontana" aria-label="Riduci zoom">−</button>
    <span class="xf-z" aria-live="polite"></span>
    <button type="button" data-a="in" title="Avvicina" aria-label="Aumenta zoom">+</button>
    <button type="button" data-a="reset" title="Immagine originale" aria-label="Ripristina rotazione e zoom">⟲</button>`;
  stage.appendChild(box);
  const label = () => {
    box.querySelector('.xf-z').textContent = `${xf.zoom.toFixed(1).replace('.', ',')}×${xf.rot ? ` · ${xf.rot}°` : ''}`;
    box.querySelector('[data-a="reset"]').hidden = !xf.active;
    stage.classList.toggle('xf-zoomed', xf.zoom > 1.001);
  };
  label();
  let saveT = 0;
  const changed = (final) => { label(); onChange(false); clearTimeout(saveT); saveT = setTimeout(() => onChange(true), final ? 0 : 400); };
  box.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    e.stopPropagation();
    if (a === 'rot') xf.set({ rot: xf.rot + 90 });
    else if (a === 'in') xf.set({ zoom: Math.round((xf.zoom + 0.25) * 4) / 4 });
    else if (a === 'out') xf.set({ zoom: Math.round((xf.zoom - 0.25) * 4) / 4 });
    else xf.set({ rot: 0, zoom: 1, cx: 0.5, cy: 0.5 });
    changed(true);
  });
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    xf.set({ zoom: xf.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1) }); changed(false);
  }, { passive: false });
  // Trascinando con lo zoom attivo si sposta l'inquadratura.
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (xf.zoom <= 1.001 || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, cx: xf.cx, cy: xf.cy, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = stage.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; stage.dataset.dragged = '1';
    xf.set({ cx: drag.cx - dx / r.width / xf.zoom, cy: drag.cy - dy / r.height / xf.zoom }); changed(false);
  });
  window.addEventListener('pointerup', () => { if (drag?.moved) { changed(true); setTimeout(() => delete stage.dataset.dragged, 0); } drag = null; });
  return { refresh: label, el: box };
}
