import { describe, expect, it } from "vitest";
import { buildCutSvg } from "@/lib/exporter/exportCut";
import { DPI, fitsOnSheet, packSheets } from "@/lib/packing/rectPacker";
import { findSheetPreset, SHEET_PRESETS, sheetSetup } from "@/lib/sheetPresets";

const intersects = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("sheet presets", () => {
  it("offers the five requested sizes", () => {
    expect(SHEET_PRESETS.map((p) => [p.label, p.width, p.height])).toEqual([
      ["US Letter", 8.5, 11],
      ["Tabloid", 11, 17],
      ["Super B / A3+", 13, 19],
      ["Cameo 12x12 Mat", 12, 12],
      ["Cameo 12x24 Mat", 12, 24],
    ]);
  });

  it("falls back to Letter for an unknown id", () => {
    expect(findSheetPreset("nope").id).toBe("letter");
  });

  it.each(SHEET_PRESETS)("$label: packs inside the sheet, clear of the marks", (preset) => {
    const setup = sheetSetup(preset);
    const result = packSheets([{ width: 1.5, height: 1, quantity: 400 }], setup.packOptions);
    const W = preset.width * DPI;
    const H = preset.height * DPI;

    expect(result.sheet.widthPx).toBe(W);
    expect(result.sheet.heightPx).toBe(H);
    for (const m of setup.marks) {
      expect(m.x + m.width).toBeLessThanOrEqual(W);
      expect(m.y + m.height).toBeLessThanOrEqual(H);
    }
    for (const sheet of result.sheets) {
      for (const p of sheet.placements) {
        expect(p.px.x + p.px.width).toBeLessThanOrEqual(W);
        expect(p.px.y + p.px.height).toBeLessThanOrEqual(H);
        for (const m of setup.marks) expect(intersects(p.px, m)).toBe(false);
      }
    }
  });

  it.each(SHEET_PRESETS)("$label: cut SVG is the sheet size in mm", (preset) => {
    const svg = buildCutSvg(sheetSetup(preset).sheet, []);
    expect(svg).toContain(`width="${+(preset.width * 25.4).toFixed(4)}mm"`);
    expect(svg).toContain(`height="${+(preset.height * 25.4).toFixed(4)}mm"`);
  });

  it("bigger paper fits more per sheet and accepts items Letter rejects", () => {
    const letter = sheetSetup(findSheetPreset("letter"));
    const tabloid = sheetSetup(findSheetPreset("tabloid"));
    const mat24 = sheetSetup(findSheetPreset("cameo-12x24"));
    const items = [{ width: 2, height: 2, quantity: 60 }];

    const onLetter = packSheets(items, letter.packOptions).sheets.length;
    const onTabloid = packSheets(items, tabloid.packOptions).sheets.length;
    expect(onTabloid).toBeLessThan(onLetter);

    expect(fitsOnSheet(9, 9, letter.packOptions)).toBe(false); // Letter printable ≈ 6.94 × 9.44 in
    expect(fitsOnSheet(9, 9, tabloid.packOptions)).toBe(true); // Tabloid printable ≈ 9.44 × 15.44 in
    expect(fitsOnSheet(10, 22, mat24.packOptions)).toBe(true);
    expect(fitsOnSheet(10, 22, tabloid.packOptions)).toBe(false);
  });
});
