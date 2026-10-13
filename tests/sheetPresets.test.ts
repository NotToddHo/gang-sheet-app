import { describe, expect, it } from "vitest";
import { buildCutSvg } from "@/lib/exporter/exportCut";
import { DPI, fitsOnSheet, packSheets } from "@/lib/packing/rectPacker";
import { findSheetPreset, presetSizeLabel, SHEET_PRESETS, sheetSetup } from "@/lib/sheetPresets";

const intersects = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("sheet presets", () => {
  it("offers the seven sizes, labelled in inches", () => {
    expect(SHEET_PRESETS.map((p) => `${p.label} (${presetSizeLabel(p)})`)).toEqual([
      "US Letter (8.5 x 11 in)",
      "A4 (8.27 x 11.69 in)",
      "Tabloid (11 x 17 in)",
      "A3 (11.69 x 16.54 in)",
      "Super B / A3+ (13 x 19 in)",
      "Cameo 12x12 Mat (12 x 12 in)",
      "Cameo 12x24 Mat (12 x 24 in)",
    ]);
  });

  it("defines A4 and A3 at their exact ISO millimetre sizes", () => {
    const toMm = (inches: number) => inches * 25.4;
    const a4 = findSheetPreset("a4");
    const a3 = findSheetPreset("a3");
    expect(toMm(a4.width)).toBeCloseTo(210, 9);
    expect(toMm(a4.height)).toBeCloseTo(297, 9);
    expect(toMm(a3.width)).toBeCloseTo(297, 9);
    expect(toMm(a3.height)).toBeCloseTo(420, 9);
  });

  it("falls back to Letter for an unknown id", () => {
    expect(findSheetPreset("nope").id).toBe("letter");
  });

  it.each(SHEET_PRESETS)("$label: packs inside the sheet, clear of the marks", (preset) => {
    const setup = sheetSetup(preset);
    const result = packSheets([{ width: 1.5, height: 1, quantity: 400 }], setup.packOptions);
    // Metric sheets aren't whole pixels at 300 DPI (A4 = 2480.3 px), so the frame is rounded.
    const W = Math.round(preset.width * DPI);
    const H = Math.round(preset.height * DPI);

    expect(result.sheet.widthPx).toBe(W);
    expect(result.sheet.heightPx).toBe(H);
    for (const m of setup.marks) {
      expect(m.x + m.width).toBeLessThanOrEqual(W);
      expect(m.y + m.height).toBeLessThanOrEqual(H);
    }
    // Marks are inset from the same rounded frame the PNG is drawn on: the top-right
    // L-bracket's outer edge sits exactly 0.5 in from the right edge.
    const rightmost = Math.max(...setup.marks.map((m) => m.x + m.width));
    expect(rightmost).toBeCloseTo(W - 0.5 * DPI, 9);
    for (const sheet of result.sheets) {
      for (const p of sheet.placements) {
        expect(p.px.x + p.px.width).toBeLessThanOrEqual(W);
        expect(p.px.y + p.px.height).toBeLessThanOrEqual(H);
        for (const m of setup.marks) expect(intersects(p.px, m)).toBe(false);
      }
    }
  });

  it.each(SHEET_PRESETS)("$label: cut SVG matches the print PNG frame and the paper size", (preset) => {
    const svg = buildCutSvg(sheetSetup(preset).sheet, []);
    const [, wMm, hMm] = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/)!.map(Number);

    // Exactly the print PNG's pixel frame (what matters for print/cut alignment)...
    expect((wMm / 25.4) * DPI).toBeCloseTo(Math.round(preset.width * DPI), 3);
    expect((hMm / 25.4) * DPI).toBeCloseTo(Math.round(preset.height * DPI), 3);
    // ...and within half a pixel (0.05 mm) of the nominal paper size.
    expect(Math.abs(wMm - preset.width * 25.4)).toBeLessThan(0.05);
    expect(Math.abs(hMm - preset.height * 25.4)).toBeLessThan(0.05);
    expect(svg).toContain(`viewBox="0 0 ${wMm} ${hMm}"`);
  });

  it("bigger paper fits more per sheet and accepts items Letter rejects", () => {
    const letter = sheetSetup(findSheetPreset("letter"));
    const tabloid = sheetSetup(findSheetPreset("tabloid"));
    const mat24 = sheetSetup(findSheetPreset("cameo-12x24"));
    const items = [{ width: 2, height: 2, quantity: 60 }];

    const onLetter = packSheets(items, letter.packOptions).sheets.length;
    const onTabloid = packSheets(items, tabloid.packOptions).sheets.length;
    expect(onTabloid).toBeLessThan(onLetter);

    expect(fitsOnSheet(9, 9, letter.packOptions)).toBe(false); // Letter printable ≈ 6.87 × 9.37 in
    expect(fitsOnSheet(9, 9, tabloid.packOptions)).toBe(true); // Tabloid printable ≈ 9.37 × 15.37 in
    expect(fitsOnSheet(10, 22, mat24.packOptions)).toBe(true);
    expect(fitsOnSheet(10, 22, tabloid.packOptions)).toBe(false);
  });
});
