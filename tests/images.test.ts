import { describe, expect, it } from "vitest";
import { isImageFile, readImageDpi } from "@/lib/assets";
import { setPngDpi } from "@/lib/exporter/png";
import { readJpegDpi } from "@/lib/jpeg";
import { isPdf } from "@/lib/pdf";

// ---- JPEG fixtures: just the header segments readJpegDpi looks at, then SOS. ----

const u16 = (n: number, little = false) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
const u32 = (n: number, little = false) =>
  little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

const segment = (marker: number, payload: number[]) => [0xff, marker, ...u16(payload.length + 2), ...payload];

/** APP0 JFIF with the given density units (0 aspect, 1 dpi, 2 dpcm). */
const jfif = (units: number, density: number) =>
  segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, units, ...u16(density), ...u16(density), 0, 0]);

/** APP1 Exif with IFD0 XResolution = num/den and ResolutionUnit = unit (2 inch, 3 cm). */
function exif(num: number, den: number, unit: number, little: boolean) {
  const entries = 2;
  const ifdOffset = 8;
  const rationalOffset = ifdOffset + 2 + entries * 12 + 4; // after IFD and next-IFD pointer
  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42, little),
    ...u32(ifdOffset, little),
    ...u16(entries, little),
    // XResolution, RATIONAL, count 1, value at rationalOffset
    ...u16(0x011a, little), ...u16(5, little), ...u32(1, little), ...u32(rationalOffset, little),
    // ResolutionUnit, SHORT, count 1, inline value
    ...u16(0x0128, little), ...u16(3, little), ...u32(1, little), ...u16(unit, little), 0, 0,
    ...u32(0, little), // no next IFD
    ...u32(num, little),
    ...u32(den, little),
  ];
  return segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]);
}

const jpeg = (...segments: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);

describe("readJpegDpi", () => {
  it("reads JFIF density in dots per inch", () => {
    expect(readJpegDpi(jpeg(jfif(1, 300)))).toBe(300);
    expect(readJpegDpi(jpeg(jfif(1, 150)))).toBe(150);
  });

  it("converts JFIF dots per centimetre", () => {
    expect(readJpegDpi(jpeg(jfif(2, 118)))).toBeCloseTo(299.72, 2);
  });

  it("ignores JFIF aspect-ratio-only and placeholder densities", () => {
    expect(readJpegDpi(jpeg(jfif(0, 1)))).toBeNull(); // units 0 = aspect ratio only
    expect(readJpegDpi(jpeg(jfif(1, 1)))).toBeNull(); // "1 dpi" would import at hundreds of inches
  });

  it("reads EXIF XResolution in both byte orders", () => {
    expect(readJpegDpi(jpeg(exif(300, 1, 2, true)))).toBe(300); // Intel "II"
    expect(readJpegDpi(jpeg(exif(300, 1, 2, false)))).toBe(300); // Motorola "MM"
    expect(readJpegDpi(jpeg(exif(144, 2, 2, false)))).toBe(72); // rational num/den
  });

  it("converts EXIF centimetre units and rejects unitless or zero-denominator values", () => {
    expect(readJpegDpi(jpeg(exif(118, 1, 3, true)))).toBeCloseTo(299.72, 2);
    expect(readJpegDpi(jpeg(exif(300, 1, 1, true)))).toBeNull(); // unit 1 = no absolute unit
    expect(readJpegDpi(jpeg(exif(300, 0, 2, true)))).toBeNull();
  });

  it("prefers JFIF when both are present, and falls back to EXIF when JFIF has no units", () => {
    expect(readJpegDpi(jpeg(jfif(1, 200), exif(300, 1, 2, true)))).toBe(200);
    expect(readJpegDpi(jpeg(jfif(0, 1), exif(300, 1, 2, true)))).toBe(300);
  });

  it("returns null for JPEGs without resolution metadata, non-JPEGs, and truncated files", () => {
    expect(readJpegDpi(jpeg())).toBeNull();
    expect(readJpegDpi(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(readJpegDpi(jpeg(jfif(1, 300)).slice(0, 10))).toBeNull();
  });
});

describe("readImageDpi", () => {
  /** Minimal PNG: signature + IHDR + IEND (enough for the pHYs reader). */
  const png = () =>
    new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(1), ...u32(1), 8, 6, 0, 0, 0, ...u32(0),
      ...u32(0), 0x49, 0x45, 0x4e, 0x44, ...u32(0),
    ]);

  it("detects the format from the bytes, not the file name", () => {
    expect(readImageDpi(setPngDpi(png(), 150))).toBeCloseTo(150, 0);
    expect(readImageDpi(jpeg(jfif(1, 150)))).toBe(150);
  });

  it("returns null when neither format declares a DPI (caller falls back to 300)", () => {
    expect(readImageDpi(png())).toBeNull();
    expect(readImageDpi(jpeg())).toBeNull();
  });
});

describe("isImageFile", () => {
  it("accepts PNG and JPEG by MIME type or extension", () => {
    expect(isImageFile(new File([], "a.png", { type: "image/png" }))).toBe(true);
    expect(isImageFile(new File([], "photo.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isImageFile(new File([], "photo.JPEG"))).toBe(true); // no MIME type on some drops
    expect(isImageFile(new File([], "scan.jpg"))).toBe(true);
  });

  it("rejects PDFs and other files, which go to the PDF path or are skipped", () => {
    const pdf = new File([], "doc.pdf", { type: "application/pdf" });
    expect(isImageFile(pdf)).toBe(false);
    expect(isPdf(pdf)).toBe(true);
    expect(isImageFile(new File([], "art.gif", { type: "image/gif" }))).toBe(false);
    expect(isImageFile(new File([], "art.webp", { type: "image/webp" }))).toBe(false);
  });
});
