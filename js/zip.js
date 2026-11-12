// Minimal ZIP reader: lists entries from the central directory, inflates stored / deflated ones
// (DecompressionStream 'deflate-raw'). Enough for firmware archives.

export function isZip(data) {
  return data.length > 22 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 3 && data[3] === 4;
}

export function zipEntries(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65535); i--)
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP: end of central directory not found');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP: bad central directory');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true),
      size = dv.getUint32(p + 24, true), nlen = dv.getUint16(p + 28, true),
      xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true),
      local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(data.subarray(p + 46, p + 46 + nlen));
    out.push({ name, method, csize, size, local });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

export async function zipRead(data, e) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (dv.getUint32(e.local, true) !== 0x04034b50) throw new Error('ZIP: bad local header');
  const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
  const raw = data.subarray(start, start + e.csize);
  if (e.method === 0) return raw.slice();
  if (e.method !== 8) throw new Error(`ZIP: compression method ${e.method} not supported`);
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length !== e.size) throw new Error('ZIP: size mismatch after inflate');
  return out;
}
