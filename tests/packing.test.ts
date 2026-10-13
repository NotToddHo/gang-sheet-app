import { describe, expect, it } from "vitest";
import { CUT_GAP_MM, PX_PER_MM, packRects, type PackResult, type Placement } from "../src/lib/packing/rectPacker";

const MM_PER_PX = 1 / PX_PER_MM;

/** Edge-to-edge clearance between two rects in mm; negative means they overlap. */
function clearanceMm(a: Placement, b: Placement): number {
  const dx = Math.max(b.px.x - (a.px.x + a.px.width), a.px.x - (b.px.x + b.px.width));
  const dy = Math.max(b.px.y - (a.px.y + a.px.height), a.px.y - (b.px.y + b.px.height));
  // Separated if either axis has a gap; the larger axis gap is the clearance.
  return Math.max(dx, dy) * MM_PER_PX;
}

function assertValidLayout(result: PackResult) {
  const { placements, sheet } = result;

  for (const p of placements) {
    expect(p.px.x).toBeGreaterThanOrEqual(0);
    expect(p.px.y).toBeGreaterThanOrEqual(0);
    expect(p.px.x + p.px.width).toBeLessThanOrEqual(sheet.widthPx);
    expect(p.px.y + p.px.height).toBeLessThanOrEqual(sheet.heightPx);
  }

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const gap = clearanceMm(placements[i], placements[j]);
      expect(gap, `items ${i} and ${j} overlap or violate the ${CUT_GAP_MM}mm gap`).toBeGreaterThanOrEqual(CUT_GAP_MM);
    }
  }
}

describe("packRects", () => {
  it("places every copy of a mixed batch with no overlap and >= CUT_GAP_MM gap", () => {
    const result = packRects([
      { id: "a", width: 2, height: 2, quantity: 6 },
      { id: "b", width: 3, height: 1.25, quantity: 4 },
      { id: "c", width: 1, height: 1, quantity: 10 },
    ]);

    expect(result.placements).toHaveLength(20);
    expect(result.unplaced).toHaveLength(0);
    assertValidLayout(result);
  });

  it("enforces the gap even when the sheet is packed to capacity", () => {
    // 1in squares with a 3mm gap: 8 across would need 8in + 7 gaps = 8.83in > 8.5in, so 7 fit;
    // 10 down would need 10in + 9 gaps = 11.06in > 11in, so 9 fit. 7 × 9 = 63.
    expect(CUT_GAP_MM).toBe(3);
    const result = packRects([{ width: 1, height: 1, quantity: 200 }]);

    expect(result.placements.length).toBe(63);
    expect(result.unplaced.length).toBe(137);
    assertValidLayout(result);
  });

  it("does not fit items that would only fit without the gap", () => {
    // Two 4.25in-wide items fill 8.5in exactly — the cut gap forces one onto a new row.
    const result = packRects([{ width: 4.25, height: 5.4, quantity: 4 }], { allowRotation: false });

    expect(result.placements).toHaveLength(2);
    expect(result.placements[0].px.x).toBe(result.placements[1].px.x);
    assertValidLayout(result);
  });

  it("rotates items when that is the only way they fit", () => {
    const result = packRects([{ width: 10, height: 2, quantity: 1 }]);

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].rotated).toBe(true);
    expect(result.placements[0].width).toBe(2);
    expect(result.placements[0].height).toBe(10);
    assertValidLayout(result);
  });

  it("reports oversized items as unplaced", () => {
    const result = packRects([{ width: 12, height: 12, quantity: 2 }]);

    expect(result.placements).toHaveLength(0);
    expect(result.unplaced).toHaveLength(2);
  });

  it("never uses a gap smaller than CUT_GAP_MM, even if asked to", () => {
    const result = packRects([{ width: 1, height: 1, quantity: 20 }], { gapMm: 0.5 });

    expect(result.gapPx * MM_PER_PX).toBeGreaterThanOrEqual(CUT_GAP_MM);
    assertValidLayout(result);
  });

  it("keeps items inside the margin", () => {
    const margin = 0.5;
    const result = packRects([{ width: 1.5, height: 1.5, quantity: 30 }], { margin });

    for (const p of result.placements) {
      expect(p.x).toBeGreaterThanOrEqual(margin);
      expect(p.y).toBeGreaterThanOrEqual(margin);
      expect(p.x + p.width).toBeLessThanOrEqual(8.5 - margin);
      expect(p.y + p.height).toBeLessThanOrEqual(11 - margin);
    }
    assertValidLayout(result);
  });

  it("holds up on randomized input", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

    for (let trial = 0; trial < 25; trial++) {
      const items = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => ({
        width: 0.25 + Math.round(rand() * 400) / 100,
        height: 0.25 + Math.round(rand() * 400) / 100,
        quantity: 1 + Math.floor(rand() * 8),
      }));
      const result = packRects(items);
      const total = items.reduce((s, i) => s + i.quantity, 0);

      expect(result.placements.length + result.unplaced.length).toBe(total);
      assertValidLayout(result);
    }
  });
});
