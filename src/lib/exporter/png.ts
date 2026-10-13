const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const METERS_PER_INCH = 0.0254;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const chunkType = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

/**
 * Returns a copy of a PNG with a pHYs chunk declaring `dpi`, replacing any existing one.
 *
 * Browsers' canvas.toBlob() writes no pHYs, so print/cut software falls back to
 * 72 or 96 DPI and imports the sheet at the wrong physical size without this.
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 33 || PNG_SIGNATURE.some((b, i) => png[i] !== b) || chunkType(png, 8) !== "IHDR") {
    throw new Error("Not a PNG");
  }

  const ppm = Math.round(dpi / METERS_PER_INCH);
  const phys = new Uint8Array(21);
  const view = new DataView(phys.buffer);
  view.setUint32(0, 9);
  phys.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  phys[16] = 1; // unit: meter
  view.setUint32(17, crc32(phys.subarray(4, 17)));

  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    const end = offset + 12 + length;
    const type = chunkType(png, offset);
    if (type !== "pHYs") parts.push(png.subarray(offset, end));
    if (type === "IHDR") parts.push(phys);
    offset = end;
  }

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** Reads the DPI declared by a PNG's pHYs chunk, or null if absent / not in meters. */
export function readPngDpi(png: Uint8Array): number | null {
  if (png.length < 8 || PNG_SIGNATURE.some((b, i) => png[i] !== b)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = chunkType(png, offset);
    if (type === "IDAT" || type === "IEND") return null; // pHYs must precede image data
    if (type === "pHYs" && length >= 9 && offset + 17 <= png.length) {
      const ppm = view.getUint32(offset + 8);
      if (png[offset + 16] !== 1 || ppm === 0) return null;
      return ppm * METERS_PER_INCH;
    }
    offset += 12 + length;
  }
  return null;
}
