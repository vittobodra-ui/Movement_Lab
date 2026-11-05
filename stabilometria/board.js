// Collegamento alla Wii Balance Board tramite WebHID.
// Protocollo descritto da WiiBrew e dal driver hid-wiimote di Linux.
const VID = 0x057e;
const R = { LED: 0x11, MODE: 0x12, STATUS: 0x15, WRITE: 0x16, READ: 0x17, STATUS_IN: 0x20, READ_IN: 0x21, ACK_IN: 0x22, DATA_8: 0x32, DATA_19: 0x34 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class BoardBase {
  constructor() { this.listeners = {}; this.tare = { tl: 0, tr: 0, bl: 0, br: 0 }; this.connected = false; this.rate = 0; this.rateT = []; this.battery = null; this.log = []; }
  on(type, fn) { (this.listeners[type] ??= []).push(fn); return this; }
  emit(type, v) { for (const f of this.listeners[type] ?? []) f(v); }
  note(msg) { this.log.push(msg); this.emit('log', msg); }
  sample(t, tl, tr, bl, br, temp) {
    this.rateT.push(t); while (this.rateT.length && this.rateT[0] < t - 2000) this.rateT.shift();
    if (this.rateT.length > 1) this.rate = ((this.rateT.length - 1) * 1000) / (t - this.rateT[0]);
    this.emit('sample', { t, tl: tl - this.tare.tl, tr: tr - this.tare.tr, bl: bl - this.tare.bl, br: br - this.tare.br, rawTotal: tl + tr + bl + br, temp });
  }
}

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
export function batteryBars(v) { return v >= 0x82 ? 4 : v >= 0x7d ? 3 : v >= 0x78 ? 2 : v >= 0x6a ? 1 : 0; }
export function toKg(raw, c) {
  if (raw <= c[0]) return ((raw - c[0]) * 17) / ((c[1] - c[0]) || 1);
  if (raw < c[1]) return ((raw - c[0]) * 17) / ((c[1] - c[0]) || 1);
  return 17 + ((raw - c[1]) * 17) / ((c[2] - c[1]) || 1);
}

export class BalanceBoard extends BoardBase {
  static get supported() { return !!navigator.hid; }
  constructor() {
    super();
    this.onInput = (e) => this.handle(e);
    this.waitRead = null; this.waitAck = null; this.waitStatus = null; this.streaming = false;
    navigator.hid?.addEventListener('disconnect', (e) => { if (e.device === this.dev) this.lost(); });
  }
  lost() { if (!this.connected) return; this.connected = false; this.streaming = false; this.note('Pedana scollegata.'); this.emit('disconnect'); }
  async request() {
    const list = await navigator.hid.requestDevice({ filters: [{ vendorId: VID }] });
    if (!list.length) return false;
    await this.attach(list[0]);
    return true;
  }
  async reconnect() {
    const d = (await navigator.hid.getDevices()).find((x) => x.vendorId === VID);
    if (!d) return false;
    try { await this.attach(d); return true; } catch (e) { this.note(`Ricollegamento non riuscito: ${e.message}`); return false; }
  }
  async attach(d) {
    this.dev = d;
    this.note(`Trovato: ${d.productName || 'dispositivo Nintendo'} (${d.vendorId.toString(16)}:${d.productId.toString(16)})`);
    if (!d.opened) await d.open();
    d.removeEventListener('inputreport', this.onInput);
    d.addEventListener('inputreport', this.onInput);
    await this.init();
    this.connected = true;
    this.emit('connect');
  }
  async close() {
    this.streaming = false; this.connected = false;
    try { this.dev?.removeEventListener('inputreport', this.onInput); await this.dev?.close(); } catch { /* già chiusa */ }
  }
  send(id, bytes) { return this.dev.sendReport(id, new Uint8Array(bytes)); }
  withTimeout(slot, ms, what) {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this[slot] = null; rej(new Error(`La pedana non risponde (${what}).`)); }, ms);
      this[slot] = { res: (v) => { clearTimeout(timer); this[slot] = null; res(v); }, rej: (e) => { clearTimeout(timer); this[slot] = null; rej(e); } };
    });
  }
  async write(addr, data) {
    const pl = new Array(21).fill(0);
    pl[0] = 0x04; pl[1] = (addr >> 16) & 0xff; pl[2] = (addr >> 8) & 0xff; pl[3] = addr & 0xff; pl[4] = data.length;
    data.forEach((v, i) => { pl[5 + i] = v; });
    const ack = this.withTimeout('waitAck', 1500, 'scrittura');
    await this.send(R.WRITE, pl);
    await ack;
  }
  async read(addr, size) {
    const out = new Uint8Array(size);
    let got = 0;
    const done = new Promise((res, rej) => {
      const timer = setTimeout(() => { this.waitRead = null; rej(new Error('La pedana non risponde (lettura).')); }, 2000);
      this.waitRead = {
        chunk: (off, bytes, err) => {
          if (err) { clearTimeout(timer); this.waitRead = null; rej(new Error(`Errore di lettura ${err}.`)); return; }
          out.set(bytes.slice(0, Math.max(0, size - (off - (addr & 0xffff)))), off - (addr & 0xffff));
          got += bytes.length;
          if (got >= size) { clearTimeout(timer); this.waitRead = null; res(out); }
        },
      };
    });
    await this.send(R.READ, [0x04, (addr >> 16) & 0xff, (addr >> 8) & 0xff, addr & 0xff, (size >> 8) & 0xff, size & 0xff]);
    return done;
  }
  async init() {
    this.streaming = false;
    await this.send(R.LED, [0x10]).catch((e) => { throw new Error(`Windows non riesce a scrivere sulla pedana: ${e.message}`); });
    this.note('Scrittura sulla pedana riuscita.');
    const status = this.withTimeout('waitStatus', 1500, 'stato');
    await this.send(R.STATUS, [0x00]);
    await status.catch((e) => this.note(`${e.message} Proseguo.`));
    await this.write(0xa400f0, [0x55]);
    await this.write(0xa400fb, [0x00]);
    const id = await this.read(0xa400fe, 2);
    if (id[0] !== 0x04 || id[1] !== 0x02) throw new Error('Questo dispositivo Nintendo non è una Balance Board.');
    this.note('Balance Board riconosciuta.');
    const a = await this.read(0xa40020, 32), b = await this.read(0xa40060, 2);
    const c = [];
    for (let s = 0; s < 4; s++) c.push([0, 1, 2].map((p) => (a[4 + p * 8 + s * 2] << 8) | a[5 + p * 8 + s * 2]));
    this.calib = { tr: c[0], br: c[1], tl: c[2], bl: c[3] };
    this.refTemp = b[0];
    const stored = ((a[0x1c] << 24) | (a[0x1d] << 16) | (a[0x1e] << 8) | a[0x1f]) >>> 0;
    const computed = crc32([...a.slice(4, 28), a[0], a[1], b[0], b[1]]);
    this.calibOk = stored === computed;
    this.note(this.calibOk ? 'Calibrazione di fabbrica letta e verificata.' : 'Calibrazione letta, ma il controllo di integrità non torna: controlla i valori.');
    await this.send(R.MODE, [0x04, R.DATA_19]);
    this.streaming = true;
    this.note('Ricezione dati avviata.');
  }
  handle(e) {
    const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), id = e.reportId;
    if (id === R.DATA_19 || id === R.DATA_8) {
      if (!this.calib || d.length < 10) return;
      const u = (i) => (d[i] << 8) | d[i + 1];
      const tr = toKg(u(2), this.calib.tr), br = toKg(u(4), this.calib.br), tl = toKg(u(6), this.calib.tl), bl = toKg(u(8), this.calib.bl);
      if (id === R.DATA_19 && d.length > 12) { const bars = batteryBars(d[12]); if (bars !== this.battery) { this.battery = bars; this.emit('battery', bars); } }
      this.sample(e.timeStamp || performance.now(), tl, tr, bl, br, d[10]);
    } else if (id === R.READ_IN) {
      const se = d[2], size = (se >> 4) + 1, err = se & 0x0f, off = (d[3] << 8) | d[4];
      this.waitRead?.chunk(off, d.slice(5, 5 + size), err);
    } else if (id === R.ACK_IN) {
      if (d[3]) this.waitAck?.rej(new Error(`La pedana ha rifiutato il comando (${d[3]}).`)); else this.waitAck?.res();
    } else if (id === R.STATUS_IN) {
      this.battery = batteryBars(d[5]); this.emit('battery', this.battery);
      this.waitStatus?.res();
      // Dopo un rapporto di stato la modalità di invio va impostata di nuovo.
      if (this.streaming) this.send(R.MODE, [0x04, R.DATA_19]).catch(() => {});
    }
  }
}
export { sleep };
