import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { buildCutSvg } from "@/lib/exporter/exportCut";
import { BLEED_MM, effectiveBleedPx } from "@/lib/exporter/exportPrint";
import { readPngDpi, setPngDpi } from "@/lib/exporter/png";
import { safeMarginIn, silhouetteMarks } from "@/lib/exporter/registrationMarks";
import type { PxRect } from "@/lib/exporter/types";
import { DPI, PX_PER_MM, packRects } from "@/lib/packing/rectPacker";

const LETTER = { width: 8.5, height: 11 };

/** Minimal valid 1×1 RGBA PNG (CRCs on the source chunks are irrelevant to the code under test). */
function tinyPng(): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(Array.from(type, (c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1);
  new DataView(ihdr.buffer).setUint32(4, 1);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(Buffer.from([0, 0, 0, 0, 0])))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

const intersects = (a: PxRect, b: PxRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const grow = (r: PxRect, by: number): PxRect => ({
  x: r.x - by,
  y: r.y - by,
  width: r.width + 2 * by,
  height: r.height + 2 * by,
});

describe("cut SVG", () => {
  it("is exactly the sheet size in mm with a matching viewBox", () => {
    const svg = buildCutSvg(LETTER, []);
    expect(svg).toContain('width="215.9mm"');
    expect(svg).toContain('height="279.4mm"');
    expect(svg).toContain('viewBox="0 0 215.9 279.4"');
  });

  it("emits one closed loop per placement at 1:1 mm from the sheet origin", () => {
    // 1in square at (300px, 600px) = 25.4mm square at (25.4mm, 50.8mm).
    const svg = buildCutSvg(LETTER, [{ x: 300, y: 600, width: 300, height: 300 }]);
    expect(svg).toContain('<path d="M25.4 50.8H50.8V76.2H25.4Z"/>');
    expect(svg.match(/<path /g)).toHaveLength(1);
  });

  it("contains only cut paths — no images or fills", () => {
    const { placements } = packRects([{ width: 1, height: 1, quantity: 12 }], { margin: safeMarginIn() });
    const svg = buildCutSvg(LETTER, placements.map((p) => p.px));
    expect(svg.match(/<path /g)).toHaveLength(12);
    expect(svg).not.toMatch(/<image|<rect|<text/);
    expect(svg).toContain('fill="none"');
  });
});

describe("print PNG DPI", () => {
  it("writes a pHYs chunk so the PNG imports at 300 DPI", () => {
    const png = tinyPng();
    expect(readPngDpi(png)).toBeNull();

    const tagged = setPngDpi(png, DPI);
    expect(readPngDpi(tagged)).toBeCloseTo(300, 2);
    // 2550 px at the stored resolution is 215.9 mm to within a micron.
    expect((2550 / readPngDpi(tagged)!) * 25.4).toBeCloseTo(215.9, 3);
  });

  it("replaces an existing pHYs chunk rather than duplicating it", () => {
    const twice = setPngDpi(setPngDpi(tinyPng(), 72), DPI);
    const text = String.fromCharCode(...twice);
    expect(text.split("pHYs")).toHaveLength(2);
    expect(readPngDpi(twice)).toBeCloseTo(300, 2);
  });
});

describe("registration marks and safe area", () => {
  it("places Silhouette marks 0.5in from the sheet edges", () => {
    const marks = silhouetteMarks(LETTER);
    const inset = 0.5 * DPI;
    const square = marks[0];
    expect(square).toMatchObject({ x: inset, y: inset });
    expect(square.width).toBeCloseTo(5 * PX_PER_MM);

    for (const m of marks) {
      expect(m.x).toBeGreaterThanOrEqual(inset - 1e-9);
      expect(m.y).toBeGreaterThanOrEqual(inset - 1e-9);
      expect(m.x + m.width).toBeLessThanOrEqual(LETTER.width * DPI - inset + 1e-9);
      expect(m.y + m.height).toBeLessThanOrEqual(LETTER.height * DPI - inset + 1e-9);
    }
  });

  it("never packs artwork or its bleed onto a mark, even when the sheet is full", () => {
    const marks = silhouetteMarks(LETTER);
    const result = packRects(
      [
        { width: 0.5, height: 0.5, quantity: 300 },
        { width: 2, height: 1, quantity: 20 },
      ],
      { margin: safeMarginIn() },
    );
    const bleed = effectiveBleedPx(result.gapPx);

    expect(result.unplaced.length).toBeGreaterThan(0); // sheet really is full
    for (const p of result.placements) {
      for (const m of marks) expect(intersects(grow(p.px, bleed), m)).toBe(false);
    }
  });
});

describe("bleed", () => {
  it("is capped at half the cut gap so neighbouring bleeds never overlap", () => {
    const gapPx = Math.ceil(2 * PX_PER_MM);
    const bleed = effectiveBleedPx(gapPx);
    expect(bleed * 2).toBeLessThanOrEqual(gapPx);
    expect(bleed).toBeLessThanOrEqual(Math.ceil(BLEED_MM * PX_PER_MM));
  });

  it("uses the full 1.5mm when the gap allows it", () => {
    expect(effectiveBleedPx(Math.ceil(4 * PX_PER_MM))).toBe(Math.ceil(BLEED_MM * PX_PER_MM));
  });
});
