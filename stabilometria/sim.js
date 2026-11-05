// Pedana e cliente simulati, con valori noti: per provare il programma e per i test.
import { BoardBase } from './board.js';
import { SENSOR_X, SENSOR_Y } from './signal.js';
let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

export const SIM_SUBJECT = { weight: 72, xL: -105, xR: 95, yHeel: -88, yFore: 62, left: 0.56, fore: 0.44, sway: 1, rotated: false, noise: 0.025, rate: 90, stepOffAfter: null };
export function forcesAt(x, y, W) {
  return { tr: W * (0.25 + x / (2 * SENSOR_X) + y / (2 * SENSOR_Y)), br: W * (0.25 + x / (2 * SENSOR_X) - y / (2 * SENSOR_Y)), tl: W * (0.25 - x / (2 * SENSOR_X) + y / (2 * SENSOR_Y)), bl: W * (0.25 - x / (2 * SENSOR_X) - y / (2 * SENSOR_Y)) };
}
export class SimBoard extends BoardBase {
  constructor(subject = {}) { super(); this.S = { ...SIM_SUBJECT, ...subject }; this.phase = 'empty'; this.scale = 1; this.ox = 0; this.oy = 0; this.simulated = true; }
  async request() { this.connected = true; this.battery = 4; this.note('Pedana simulata: i dati vengono da un cliente virtuale.'); this.emit('battery', 4); this.emit('connect'); this.start(); return true; }
  async close() { clearInterval(this.timer); this.connected = false; }
  start() {
    const dt = 1000 / this.S.rate; let last = performance.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => { const now = performance.now(); while (last < now) { last += dt * (0.8 + rnd() * 0.4); this.step(last); } }, 20);
  }
  target() {
    const S = this.S, stand = { x: S.xR + (S.xL - S.xR) * S.left, y: S.yHeel + (S.yFore - S.yHeel) * S.fore };
    switch (this.phase) {
      case 'liftR': return { x: S.xL, y: stand.y };
      case 'liftL': return { x: S.xR, y: stand.y };
      case 'toes': return { x: stand.x, y: S.yFore };
      case 'heels': return { x: stand.x, y: S.yHeel };
      default: return stand;
    }
  }
  step(t) {
    const S = this.S;
    if (this.phase === 'empty') { const e = S.noise; return this.emitForces(t, { tl: gauss() * e, tr: gauss() * e, bl: gauss() * e, br: gauss() * e }); }
    const k = 0.002, amp = S.sway * this.scale;
    this.ox += -k * this.ox + gauss() * amp * 0.16; this.oy += -k * this.oy + gauss() * amp * 0.22;
    const T = this.target();
    this.tx = this.tx == null ? T.x : this.tx + (T.x - this.tx) * 0.03; this.ty = this.ty == null ? T.y : this.ty + (T.y - this.ty) * 0.03;
    const f = forcesAt(this.tx + this.ox, this.ty + this.oy, S.weight);
    for (const q of Object.keys(f)) f[q] += gauss() * S.noise;
    this.emitForces(t, f);
  }
  emitForces(t, f) { const s = this.S.rotated ? { tl: f.br, tr: f.bl, bl: f.tr, br: f.tl } : f; this.sample(t, s.tl, s.tr, s.bl, s.br, 100); }
}
