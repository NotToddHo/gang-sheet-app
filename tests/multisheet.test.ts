import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { safeMarginIn } from "@/lib/exporter/registrationMarks";
import { sheetFileName, zipSheets } from "@/lib/exporter/exportZip";
import {
  CUT_GAP_MM,
  DPI,
  fitsOnSheet,
  PX_PER_MM,
  packRects,
  packSheets,
  usableArea,
  type Placement,
} from "@/lib/packing/rectPacker";

const margin = safeMarginIn();

function assertNoOverlap(placements: readonly Placement[]) {
  const gapPx = CUT_GAP_MM * PX_PER_MM;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i].px;
      const b = placements[j].px;
      const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
      const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
      expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(gapPx);
    }
  }
}

describe("packSheets", () => {
  it("fits on one sheet when it can, matching the single-sheet packer", () => {
    const items = [{ id: "a", width: 2, height: 2, quantity: 4 }];
    const multi = packSheets(items, { margin });
    expect(multi.sheets).toHaveLength(1);
    expect(multi.sheets[0].placements).toEqual(packRects(items, { margin }).placements);
  });

  it("spills extra copies onto additional sheets instead of shrinking them", () => {
    const capacity = packRects([{ width: 1, height: 1, quantity: 1000 }], { margin }).placements.length;
    const quantity = capacity * 2 + 5;
    const result = packSheets([{ id: "dot", width: 1, height: 1, quantity }], { margin });

    expect(result.sheets).toHaveLength(3);
    expect(result.sheets.map((s) => s.placements.length)).toEqual([capacity, capacity, 5]);
    expect(result.tooLarge).toHaveLength(0);
    expect(result.overflow).toHaveLength(0);

    for (const sheet of result.sheets) {
      for (const p of sheet.placements) {
        expect([p.width, p.height].sort()).toEqual([1, 1]); // never scaled
      }
      assertNoOverlap(sheet.placements);
    }
  });

  it("places every requested copy exactly once across sheets", () => {
    const items = [
      { id: "a", width: 2, height: 3, quantity: 17 },
      { id: "b", width: 1.25, height: 0.75, quantity: 60 },
      { id: "c", width: 6, height: 1, quantity: 9 },
    ];
    const result = packSheets(items, { margin });
    expect(result.sheets.length).toBeGreaterThan(1);

    items.forEach((item, itemIndex) => {
      const copies = result.sheets
        .flatMap((s) => s.placements)
        .filter((p) => p.itemIndex === itemIndex)
        .map((p) => p.copyIndex)
        .sort((x, y) => x - y);
      expect(copies).toEqual(Array.from({ length: item.quantity }, (_, i) => i));
    });
    for (const sheet of result.sheets) assertNoOverlap(sheet.placements);
  });

  it("reports items larger than the sheet without adding sheets for them", () => {
    const result = packSheets(
      [
        { id: "huge", width: 9, height: 12, quantity: 3 },
        { id: "ok", width: 1, height: 1, quantity: 2 },
      ],
      { margin },
    );
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].placements).toHaveLength(2);
    expect(result.tooLarge).toHaveLength(3);
    expect(result.tooLarge.every((u) => u.id === "huge")).toBe(true);
  });

  it("stops at maxSheets and reports the rest as overflow", () => {
    const capacity = packRects([{ width: 1, height: 1, quantity: 1000 }], { margin }).placements.length;
    const result = packSheets([{ width: 1, height: 1, quantity: capacity * 5 }], { margin, maxSheets: 2 });
    expect(result.sheets).toHaveLength(2);
    expect(result.overflow).toHaveLength(capacity * 3);
  });

  it("returns no sheets for an empty request", () => {
    expect(packSheets([{ width: 1, height: 1, quantity: 0 }], { margin }).sheets).toHaveLength(0);
  });
});

describe("zipSheets", () => {
  it("bundles a print PNG and cut SVG per sheet, in sheet order", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const zip = zipSheets([
      { print: png, cut: "<svg>1</svg>" },
      { print: png, cut: "<svg>2</svg>" },
    ]);
    const files = unzipSync(zip);

    expect(Object.keys(files).sort()).toEqual([
      "sheet-01-cut.svg",
      "sheet-01-print.png",
      "sheet-02-cut.svg",
      "sheet-02-print.png",
    ]);
    expect(files["sheet-02-print.png"]).toEqual(png);
    expect(strFromU8(files["sheet-02-cut.svg"])).toBe("<svg>2</svg>");
  });

  it("pads sheet numbers so they sort correctly past 99", () => {
    expect(sheetFileName(4, 120, "print")).toBe("sheet-005-print.png");
    expect(sheetFileName(119, 120, "cut")).toBe("sheet-120-cut.svg");
  });
});

describe("fitsOnSheet", () => {
  const opts = { margin };
  const area = usableArea(opts);

  it("reports the usable area inside the registration-mark keep-out", () => {
    // 8.5 x 11 minus the safe margin on both sides, at whole-pixel precision.
    const marginPx = Math.ceil(margin * DPI);
    expect(area.width).toBeCloseTo((2550 - 2 * marginPx) / DPI, 6);
    expect(area.height).toBeCloseTo((3300 - 2 * marginPx) / DPI, 6);
    expect(area.width).toBeLessThan(7);
  });

  it("accepts an item exactly the size of the usable area and rejects one pixel more", () => {
    expect(fitsOnSheet(area.width, area.height, opts)).toBe(true);
    expect(fitsOnSheet(area.width + 1 / DPI, area.height, opts)).toBe(false);
    expect(fitsOnSheet(area.width, area.height + 1 / DPI, opts)).toBe(false);
  });

  it("accepts items that only fit rotated, unless rotation is disabled", () => {
    expect(fitsOnSheet(9, 2, opts)).toBe(true);
    expect(fitsOnSheet(9, 2, { ...opts, allowRotation: false })).toBe(false);
  });

  it("agrees with the packer at the boundary", () => {
    for (const [w, h] of [
      [area.width, area.height],
      [area.width + 1 / DPI, 1],
      [area.height, area.width],
      [12, 1],
    ]) {
      const placed = packSheets([{ width: w, height: h, quantity: 1 }], opts).sheets.length === 1;
      expect(placed).toBe(fitsOnSheet(w, h, opts));
    }
  });
});
