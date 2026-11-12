// Web Serial link and the XG bootloader IAP protocol (same as tools/flash_iap.py):
// menu "1. Update FW" -> send '1' -> "Erasing..." -> "Wait FW file" + 'C' -> XMODEM-1K (CRC16)
// -> EOT -> "Complete!". USART1 at 115200 8N1.

export const BAUD = 115200;
const STX = 0x02, EOT = 0x04, ACK = 0x06, NAK = 0x15, CAN = 0x18;

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Aborted extends Error { constructor() { super('aborted'); } }

// Serial port with a background reader and a byte queue.
export class Link {
  constructor(port) {
    this.port = port;
    this.q = [];
    this.qi = 0;
    this.notify = null;
    this.closed = false;
  }

  async open() {
    await this.port.open({ baudRate: BAUD, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', bufferSize: 4096 });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.loop = this.readLoop();
  }

  async readLoop() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        for (const b of value) this.q.push(b);
        this.wake();
      }
    } catch (e) {
      this.error = e;
    } finally {
      this.closed = true;
      this.wake();
    }
  }

  wake() { const n = this.notify; this.notify = null; n?.(); }

  // Resolves when new bytes arrive or after ms.
  wait(ms) {
    if (this.qi < this.q.length || this.closed) return Promise.resolve();
    return new Promise(r => {
      const t = setTimeout(() => { this.notify = null; r(); }, ms);
      this.notify = () => { clearTimeout(t); r(); };
    });
  }

  check() { if (this.closed) throw new Error(this.error ? `port: ${this.error.message}` : 'port closed'); }

  drain() {
    const out = Uint8Array.from(this.q.slice(this.qi));
    this.q = [];
    this.qi = 0;
    return out;
  }

  // Next byte or -1 after ms.
  async byte(ms) {
    const end = performance.now() + ms;
    while (this.qi >= this.q.length) {
      this.check();
      const left = end - performance.now();
      if (left <= 0) return -1;
      await this.wait(left);
    }
    return this.q[this.qi++];
  }

  async write(bytes) {
    this.check();
    await this.writer.write(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
  }

  async close() {
    try { await this.reader?.cancel(); } catch { /* already gone */ }
    await this.loop?.catch(() => {});
    try { this.reader?.releaseLock(); } catch { /* */ }
    try { this.writer?.releaseLock(); } catch { /* */ }
    try { await this.port.close(); } catch { /* */ }
  }
}

function crc16(d) {
  let crc = 0;
  for (const b of d) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

export function packet(num, chunk) {
  const p = new Uint8Array(3 + 1024 + 2);
  p[0] = STX;
  p[1] = num & 0xff;
  p[2] = 0xff - (num & 0xff);
  p.fill(0x1a, 3, 3 + 1024);
  p.set(chunk, 3);
  const c = crc16(p.subarray(3, 3 + 1024));
  p[1027] = c >> 8;
  p[1028] = c & 0xff;
  return p;
}

// Wait for ACK / NAK / CAN, skipping anything else (e.g. late 'C' requests). -> byte or -1.
async function reply(link, ms) {
  const end = performance.now() + ms;
  for (;;) {
    const b = await link.byte(Math.max(0, end - performance.now()));
    if (b < 0 || b === ACK || b === NAK || b === CAN) return b;
  }
}

/*
 * ui: { text(str) bootloader output, state(name), progress(done, total), aborted() -> bool }
 * States: wait (radio not in the menu yet), erasing, sending, finishing.
 * Returns true if the bootloader printed "Complete", false if it stayed silent after EOT.
 */
export async function flash(link, xgf, ui, waitMs = 300000) {
  const total = Math.ceil(xgf.length / 1024);
  const latin1 = new TextDecoder('latin1');
  const abort = () => { if (ui.aborted()) throw new Aborted(); };

  link.drain();
  ui.state('wait');
  await link.write([0x31]);             // menu already on screen: starts the update at once
  let sentAt = performance.now(), buf = '', erasing = false;
  const end = performance.now() + waitMs;
  for (;;) {
    abort();
    link.check();
    if (performance.now() > end) throw new Error('timeoutMenu');
    await link.wait(200);
    const d = link.drain();
    if (d.length) {
      const s = latin1.decode(d);
      ui.text(s);
      buf = (buf + s).slice(-512);
    }
    const low = buf.toLowerCase();
    // Checked on every pass, not only on new data: the menu may show up < 1 s after the last '1'
    if (low.includes('update fw') && performance.now() - sentAt > 1000 && !low.includes('erasing')) {
      await sleep(300);                 // menu just appeared (power-on with the volume knob held)
      await link.write([0x31]);
      sentAt = performance.now();
      buf = '';
      continue;
    }
    if (low.includes('erasing') && !erasing) {
      erasing = true;
      ui.state('erasing');
    }
    const w = low.lastIndexOf('wait fw file');
    if (w >= 0 && buf.slice(w + 12).includes('C')) break;   // receiver asks for XMODEM-CRC
  }

  ui.state('sending');
  await sleep(200);
  link.drain();
  for (let i = 0; i < total; i++) {
    const pkt = packet(i + 1, xgf.subarray(i * 1024, (i + 1) * 1024));
    let ok = false;
    for (let attempt = 0; attempt < 10 && !ok; attempt++) {
      if (ui.aborted()) {
        await link.write([CAN, CAN, CAN]).catch(() => {});
        throw new Aborted();
      }
      await link.write(pkt);
      const r = await reply(link, 1500);
      if (r === CAN) throw new Error('canceled');
      ok = r === ACK;
    }
    if (!ok) throw new Error(`block ${i + 1}/${total}`);
    ui.progress(i + 1, total);
  }

  ui.state('finishing');
  let acked = false;
  for (let i = 0; i < 10 && !acked; i++) {
    await link.write([EOT]);
    acked = await reply(link, 1000) === ACK;
  }
  if (!acked) throw new Error('noEotAck');
  let tail = '';
  const until = performance.now() + 4000;
  while (performance.now() < until && !/complete/i.test(tail)) {
    await link.wait(200);
    const d = link.drain();
    if (d.length) { const s = latin1.decode(d); tail += s; ui.text(s); }
  }
  return /complete/i.test(tail);
}
