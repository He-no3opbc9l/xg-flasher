// bun test/unit.mjs [file.xgf|.bin ...]   (also node >= 20)
// AES, SHA-256 fallback, file analysis and the IAP protocol against a simulated bootloader.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ecbEncrypt, ecbDecrypt } from '../js/aes.js';
import { analyze, sha256js } from '../js/xgf.js';
import { Link, flash } from '../js/iap.js';
import { fakeBootloader } from './fakebl.mjs';

const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exit(1); } console.log('ok  ', m); };
const ui = (o = {}) => ({ text: () => {}, state: () => {}, progress: () => {}, aborted: () => false, ...o });

// FIPS-197 C.3
const key = Uint8Array.from({ length: 32 }, (_, i) => i);
const pt = Uint8Array.from(Buffer.from('00112233445566778899aabbccddeeff', 'hex'));
const ct = ecbEncrypt(pt, key);
ok(Buffer.from(ct).toString('hex') === '8ea2b7ca516745bfeafc49904b496089', 'AES-256 encrypt (FIPS-197)');
ok(eq(ecbDecrypt(ct, key), pt), 'AES-256 decrypt (FIPS-197)');

// SHA-256 fallback (insecure contexts have no crypto.subtle)
for (const n of [0, 1, 55, 56, 64, 119, 5000]) {
  const d = Uint8Array.from({ length: n }, (_, i) => i * 7);
  ok(sha256js(d) === createHash('sha256').update(d).digest('hex'), `SHA-256 fallback, ${n} bytes`);
}

// Synthetic application image: SP 0x20002000, Reset/HardFault inside the image
const img = new Uint8Array(150 * 1024 + 100).map((_, i) => (i * 31) & 0xff);
new DataView(img.buffer).setUint32(0, 0x20002000, true);
new DataView(img.buffer).setUint32(4, 0x08020201, true);
new DataView(img.buffer).setUint32(12, 0x08020301, true);
const raw = await analyze(img);
ok(raw.wasRaw && raw.xgf.length % 16 === 0 && raw.kind === 'other', 'raw .bin accepted and encrypted');
const xgf = await analyze(raw.xgf);
ok(!xgf.wasRaw && eq(xgf.xgf, raw.xgf) && eq(xgf.plain.subarray(0, img.length), img), '.xgf decrypted and checked');
for (const [name, d] of [['random', Uint8Array.from({ length: 4096 }, () => Math.random() * 256)], ['empty', new Uint8Array(0)], ['huge', new Uint8Array(1 << 20)]]) {
  try { await analyze(d); ok(false, name); } catch (e) { ok(true, `${name} rejected (${e.message})`); }
}
for (const f of process.argv.slice(2)) {
  const a = await analyze(new Uint8Array(readFileSync(f)));
  console.log(`      ${f}: ${a.kind} ${a.label} ${a.built} reset 0x${a.vec.reset.toString(16)} sha ${a.sha.slice(0, 16)}`);
}

// IAP
async function run(name, opts, data, uiOpts) {
  const fb = fakeBootloader(opts);
  const link = new Link(fb.port);
  await link.open();
  const t0 = performance.now();
  try {
    const done = await flash(link, data, ui(uiOpts));
    const g = fb.got();
    ok(done && eq(g.subarray(0, data.length), data) && g.subarray(data.length).every(b => b === 0x1a),
      `IAP ${name}: ${data.length} B, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await link.close();
  }
}
await run('power-on after start, NAKs + stray bytes', { menuAfter: 1500 }, raw.xgf);
await run('menu already on screen', { menuAfter: 0, nakEvery: 0 }, raw.xgf);
await run('menu 100 ms after start', { menuAfter: 100, nakEvery: 0 }, raw.xgf);
let n = 0;
try {
  await run('abort', { menuAfter: 100, nakEvery: 0 }, raw.xgf, { progress: d => { n = d; }, aborted: () => n >= 20 });
  ok(false, 'abort');
} catch (e) { ok(e.message === 'aborted', `abort after block ${n}`); }
process.exit(0);
