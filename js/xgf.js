// What a chosen file is and the exact bytes to send. .xgf = the raw application image (base
// 0x08020000) encrypted with AES-256-ECB, no header, no checksum. The bootloader checks nothing
// but the vector table, so the image is decrypted here and checked the same way first.
import { ecbDecrypt, ecbEncrypt } from './aes.js';

// Same key as tools/aes_key.hex
const KEY = Uint8Array.from('435158494547552d584945594920202059414e4855414e204d4f554c49414e5a'.match(/../g), h => parseInt(h, 16));

export const APP_BASE = 0x08020000;
export const APP_MAX = 0x100000 - 0x20000;            // 1 MB flash minus the 128 KB bootloader

const STOCK = {                                       // sha256 of known official .xgf files
  '95bd0b0adea0027cd75855aa280ad97ee8abd17620786a5e6d2c23f8dc01d113': 'V1.4b01',
};

const u32 = (d, o) => (d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24) >>> 0;

// The bootloader's own test (0x0800164c): (SP & 0xFFFF0000) == 0x20000000, (Reset & 0xFFF80000) ==
// 0x08000000. Stricter here: Reset is a Thumb address inside this image.
function vectors(d) {
  if (d.length < 64) return null;
  const sp = u32(d, 0), reset = u32(d, 4), hard = u32(d, 12);
  const end = APP_BASE + d.length;
  const inImage = a => (a & 1) && a >= APP_BASE && a < end;
  if ((sp & 0xffff0000) !== 0x20000000 || (reset & 0xfff80000) !== 0x08000000) return null;
  if (!inImage(reset) || !inImage(hard)) return null;
  return { sp, reset };
}

function find(hay, needle) {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    return i;
  }
  return -1;
}

// WebCrypto exists only in secure contexts (https / localhost); plain JS otherwise.
export function sha256js(d) {
  const K = [], H = [], frac = x => (x - Math.floor(x)) * 2 ** 32 >>> 0;
  for (let n = 2, c = 0; c < 64; n++) {
    let prime = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { prime = false; break; }
    if (!prime) continue;
    if (c < 8) H.push(frac(Math.sqrt(n)));
    K.push(frac(Math.cbrt(n)));
    c++;
  }
  const len = d.length, total = Math.ceil((len + 9) / 64) * 64, m = new Uint8Array(total);
  m.set(d);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor(len / 2 ** 29));
  dv.setUint32(total - 4, (len << 3) >>> 0);
  const w = new Uint32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + 4 * i);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, e, f, g, h, k] = [H[0], H[1], H[2], H[4], H[5], H[6], H[7], H[3]];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (k + t1) >>> 0; k = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [H[0], H[1], H[2], H[3], H[4], H[5], H[6], H[7]] = [a, b, c, k, e, f, g, h].map((v, i) => (H[i] + v) >>> 0);
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

export async function sha256(d) {
  if (!globalThis.crypto?.subtle) return sha256js(d);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', d))].map(b => b.toString(16).padStart(2, '0')).join('');
}

// -> { xgf, plain, sha, vec, kind: 'open'|'stock'|'other', label, built, wasRaw } or throws Error(code)
export async function analyze(data) {
  if (!data.length) throw new Error('empty');
  if (data.length > APP_MAX + 16) throw new Error('tooBig');
  let xgf, plain, wasRaw = false;
  let vec = vectors(data);
  if (vec) {                                          // unencrypted image (.bin): encrypt it here
    wasRaw = true;
    plain = data;
    const padded = new Uint8Array(Math.ceil(data.length / 16) * 16).fill(0x1a);
    padded.set(data);
    xgf = ecbEncrypt(padded, KEY);
  } else {
    if (data.length % 16) throw new Error('notXgf');
    plain = ecbDecrypt(data, KEY);
    vec = vectors(plain);
    if (!vec) throw new Error('notXgf');
    xgf = data;
  }
  const sha = await sha256(xgf);
  let kind = 'other', label = '', built = '';
  const at = find(plain, 'G106 open');
  if (STOCK[sha]) {
    kind = 'stock';
    label = STOCK[sha];
  } else if (at >= 0) {
    kind = 'open';
    label = 'G106 open';
    // __DATE__ / __TIME__ follow the "G106 open" string in .rodata
    const tail = new TextDecoder('latin1').decode(plain.subarray(at, at + 64));
    const m = tail.match(/([A-Z][a-z]{2} [ \d]\d \d{4})\0+(\d\d:\d\d:\d\d)/);
    if (m) built = `${m[1].replace(/ +/g, ' ')} ${m[2]}`;
  }
  return { xgf, plain, sha, vec, kind, label, built, wasRaw };
}
