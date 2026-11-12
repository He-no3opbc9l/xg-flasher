// Simulated XG bootloader behind a Web Serial-like port: menu after `menuAfter` ms (radio
// switched on with the volume knob held), '1' -> "Erasing..." -> "Wait FW file" + 'C' ->
// XMODEM-1K receiver (NAKs every `nakEvery`-th packet, stray 'C' before some ACKs) -> "Complete!".
export function fakeBootloader({ menuAfter = 400, nakEvery = 7, garbage = true, eraseMs = 500 } = {}) {
  let ctrl, state = 'off', rx = [], expect = 1, sent = 0, cTimer;
  const got = [];
  const enc = s => new TextEncoder().encode(s);
  const emit = b => ctrl.enqueue(typeof b === 'string' ? enc(b) : Uint8Array.from(b));
  const readable = new ReadableStream({ start(c) { ctrl = c; } });
  setTimeout(() => { state = 'menu'; emit('\r\nXG Bootloader(v2.0)\r\n1. Update FW\r\n2. Run App\r\n'); }, menuAfter);
  function onBytes(bytes) {
    for (const b of bytes) rx.push(b);
    for (;;) {
      if (state === 'menu') {
        if (rx.includes(0x31)) {
          state = 'erase';
          emit('1\r\nErasing...\r\n');
          setTimeout(() => { state = 'xm'; emit('Wait FW file\r\nC'); cTimer = setInterval(() => emit('C'), 300); }, eraseMs);
        }
        rx = [];
        return;
      }
      if (state !== 'xm') { rx = []; return; }
      if (!rx.length) return;
      if (rx[0] === 0x04) { rx.shift(); emit([0x06]); setTimeout(() => emit('\r\nComplete!\r\n'), 200); state = 'done'; return; }
      if (rx[0] === 0x18) { rx = []; state = 'done'; return; }
      if (rx[0] !== 0x02) { rx.shift(); continue; }
      if (rx.length < 1029) return;
      const p = rx.splice(0, 1029);
      clearInterval(cTimer);
      sent++;
      if (nakEvery && sent % nakEvery === 0) { emit([0x15]); continue; }
      if (p[1] !== (expect & 0xff) || p[2] !== 255 - p[1]) {
        if (p[1] === ((expect - 1) & 0xff)) { emit([0x06]); continue; }   // duplicate
        emit([0x18]);
        return;
      }
      got.push(...p.slice(3, 1027));
      expect++;
      setTimeout(() => emit(garbage && expect % 5 === 0 ? [0x43, 0x06] : [0x06]), 5);
    }
  }
  const writable = new WritableStream({ write(chunk) { onBytes(chunk); } });
  return {
    port: { open: async () => {}, close: async () => {}, readable, writable, getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }) },
    got: () => Uint8Array.from(got),
  };
}
