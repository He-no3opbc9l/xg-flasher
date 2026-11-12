// AES-256-ECB, the cipher of .xgf files (same as tools/xgf.py). WebCrypto has no ECB, so plain JS:
// one call handles a whole file (≤ 1 MB) in well under a second.

const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
const MUL = (a, b) => { let p = 0; for (; b; b >>= 1) { if (b & 1) p ^= a; a = (a << 1) ^ (a & 0x80 ? 0x11b : 0); } return p; };
{
  for (let i = 0; i < 256; i++) {
    let inv = 0;
    if (i) for (let j = 1; j < 256; j++) if (MUL(i, j) === 1) { inv = j; break; }
    let x = inv, s = inv;
    for (let k = 0; k < 4; k++) { x = ((x << 1) | (x >> 7)) & 0xff; s ^= x; }
    SBOX[i] = s ^ 0x63;
    INV[SBOX[i]] = i;
  }
}
const M2 = new Uint8Array(256), M3 = new Uint8Array(256), M9 = new Uint8Array(256),
  M11 = new Uint8Array(256), M13 = new Uint8Array(256), M14 = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  M2[i] = MUL(i, 2); M3[i] = MUL(i, 3); M9[i] = MUL(i, 9);
  M11[i] = MUL(i, 11); M13[i] = MUL(i, 13); M14[i] = MUL(i, 14);
}

function expand(key) {
  const nk = key.length / 4, rounds = nk + 6, w = new Uint8Array(16 * (rounds + 1));
  w.set(key);
  let rcon = 1;
  for (let i = nk; i < 4 * (rounds + 1); i++) {
    let t = w.slice(4 * (i - 1), 4 * i);
    if (i % nk === 0) {
      t = Uint8Array.of(SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]);
      rcon = MUL(rcon, 2);
    } else if (nk > 6 && i % nk === 4) {
      t = t.map(b => SBOX[b]);
    }
    for (let j = 0; j < 4; j++) w[4 * i + j] = w[4 * (i - nk) + j] ^ t[j];
  }
  return { w, rounds };
}

function encBlock(s, { w, rounds }) {
  const t = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] ^= w[i];
  for (let r = 1; r <= rounds; r++) {
    for (let c = 0; c < 4; c++)            // SubBytes + ShiftRows
      for (let row = 0; row < 4; row++) t[4 * c + row] = SBOX[s[4 * ((c + row) & 3) + row]];
    if (r < rounds) {
      for (let c = 0; c < 4; c++) {        // MixColumns
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3];
        s[4 * c] = M2[a0] ^ M3[a1] ^ a2 ^ a3;
        s[4 * c + 1] = a0 ^ M2[a1] ^ M3[a2] ^ a3;
        s[4 * c + 2] = a0 ^ a1 ^ M2[a2] ^ M3[a3];
        s[4 * c + 3] = M3[a0] ^ a1 ^ a2 ^ M2[a3];
      }
    } else s.set(t);
    for (let i = 0; i < 16; i++) s[i] ^= w[16 * r + i];
  }
}

function decBlock(s, { w, rounds }) {
  const t = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] ^= w[16 * rounds + i];
  for (let r = rounds - 1; r >= 0; r--) {
    for (let c = 0; c < 4; c++)            // InvShiftRows + InvSubBytes
      for (let row = 0; row < 4; row++) t[4 * ((c + row) & 3) + row] = INV[s[4 * c + row]];
    for (let i = 0; i < 16; i++) t[i] ^= w[16 * r + i];
    if (r > 0) {
      for (let c = 0; c < 4; c++) {        // InvMixColumns
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3];
        s[4 * c] = M14[a0] ^ M11[a1] ^ M13[a2] ^ M9[a3];
        s[4 * c + 1] = M9[a0] ^ M14[a1] ^ M11[a2] ^ M13[a3];
        s[4 * c + 2] = M13[a0] ^ M9[a1] ^ M14[a2] ^ M11[a3];
        s[4 * c + 3] = M11[a0] ^ M13[a1] ^ M9[a2] ^ M14[a3];
      }
    } else s.set(t);
  }
}

function ecb(data, key, fn) {
  const ks = expand(key), out = new Uint8Array(data.length - data.length % 16);
  for (let i = 0; i < out.length; i += 16) {
    const b = data.slice(i, i + 16);
    fn(b, ks);
    out.set(b, i);
  }
  return out;
}

export const ecbEncrypt = (data, key) => ecb(data, key, encBlock);
export const ecbDecrypt = (data, key) => ecb(data, key, decBlock);
