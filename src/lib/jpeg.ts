const CM_PER_INCH = 2.54;

/**
 * Below this we treat a declared resolution as a placeholder rather than a real print DPI
 * (e.g. JFIF density 1 with units set), so the image falls back to the default instead of
 * importing at hundreds of inches wide.
 */
const MIN_PLAUSIBLE_DPI = 10;

const plausible = (dpi: number): number | null => (Number.isFinite(dpi) && dpi >= MIN_PLAUSIBLE_DPI ? dpi : null);

/**
 * Reads the print resolution a JPEG declares: the JFIF (APP0) density if it has real units,
 * otherwise the EXIF (APP1) XResolution. Returns null if neither is present or usable.
 */
export function readJpegDpi(jpeg: Uint8Array): number | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null; // SOI

  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  let jfif: number | null = null;
  let exif: number | null = null;

  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) return jfif ?? exif; // lost sync; give up gracefully
    const marker = jpeg[offset + 1];
    if (marker === 0xff) {
      offset++; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // SOS / EOI: metadata segments come before these
    const length = view.getUint16(offset + 2); // includes its own 2 bytes
    const start = offset + 4;
    const end = offset + 2 + length;
    if (length < 2 || end > jpeg.length) break;

    if (marker === 0xe0 && jfif === null) jfif = readJfifDpi(jpeg, view, start, end);
    if (marker === 0xe1 && exif === null) exif = readExifDpi(jpeg, view, start, end);
    offset = end;
  }
  return jfif ?? exif;
}

/** APP0 "JFIF\0": version(2) units(1) Xdensity(2) Ydensity(2). Units: 0 = aspect only, 1 = dpi, 2 = dpcm. */
function readJfifDpi(bytes: Uint8Array, view: DataView, start: number, end: number): number | null {
  if (end - start < 12 || !matches(bytes, start, [0x4a, 0x46, 0x49, 0x46, 0x00])) return null;
  const units = bytes[start + 7];
  const xDensity = view.getUint16(start + 8);
  if (units === 1) return plausible(xDensity);
  if (units === 2) return plausible(xDensity * CM_PER_INCH);
  return null;
}

/** APP1 "Exif\0\0" + TIFF header; reads IFD0 XResolution (0x011A) and ResolutionUnit (0x0128). */
function readExifDpi(bytes: Uint8Array, view: DataView, start: number, end: number): number | null {
  if (end - start < 14 || !matches(bytes, start, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00])) return null;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49; // "II"
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return null; // "MM"
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  if (u16(tiff + 2) !== 42) return null;

  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  let xRes: number | null = null;
  let unit = 2; // EXIF default: inches

  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    const tag = u16(entry);
    if (tag === 0x011a && u16(entry + 2) === 5) {
      // RATIONAL: offset (from TIFF start) to numerator/denominator
      const at = tiff + u32(entry + 8);
      if (at + 8 <= end) {
        const den = u32(at + 4);
        xRes = den === 0 ? null : u32(at) / den;
      }
    } else if (tag === 0x0128 && u16(entry + 2) === 3) {
      unit = u16(entry + 8); // SHORT stored inline
    }
  }

  if (xRes === null) return null;
  if (unit === 2) return plausible(xRes);
  if (unit === 3) return plausible(xRes * CM_PER_INCH);
  return null; // unit 1 = no absolute unit
}

function matches(bytes: Uint8Array, at: number, expected: readonly number[]): boolean {
  return expected.every((b, i) => bytes[at + i] === b);
}
