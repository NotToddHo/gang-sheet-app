import { strToU8, zipSync, type Zippable } from "fflate";
import { buildCutSvg } from "./exportCut";
import { renderPrintPng } from "./exportPrint";
import type { PxRect, SheetPlacement, SheetSpec } from "./types";

export interface SheetFiles {
  print: Uint8Array;
  cut: string;
}

/** "sheet-01-print.png" / "sheet-01-cut.svg"; zero-padded so files sort in sheet order. */
export function sheetFileName(index: number, total: number, kind: "print" | "cut"): string {
  const n = String(index + 1).padStart(Math.max(2, String(total).length), "0");
  return kind === "print" ? `sheet-${n}-print.png` : `sheet-${n}-cut.svg`;
}

/** Bundles each sheet's matching print PNG and cut SVG into one zip. */
export function zipSheets(sheets: readonly SheetFiles[]): Uint8Array {
  const entries: Zippable = {};
  sheets.forEach((s, i) => {
    // PNGs are already deflated; storing them avoids burning time recompressing.
    entries[sheetFileName(i, sheets.length, "print")] = [s.print, { level: 0 }];
    entries[sheetFileName(i, sheets.length, "cut")] = strToU8(s.cut);
  });
  return zipSync(entries, { level: 6 });
}

export interface SheetsZipInput {
  sheet: SheetSpec;
  /** Placements for each sheet, in order. */
  sheets: readonly (readonly SheetPlacement[])[];
  marks: readonly PxRect[];
  gapPx: number;
  onProgress?: (done: number, total: number) => void;
}

/** Renders the print and cut file for every sheet and returns them as a zip. */
export async function exportSheetsZip({ sheet, sheets, marks, gapPx, onProgress }: SheetsZipInput): Promise<Blob> {
  const files: SheetFiles[] = [];
  for (const [i, placements] of sheets.entries()) {
    onProgress?.(i, sheets.length);
    const png = await renderPrintPng({ sheet, placements, marks, gapPx });
    files.push({ print: new Uint8Array(await png.arrayBuffer()), cut: buildCutSvg(sheet, placements) });
  }
  onProgress?.(sheets.length, sheets.length);
  return new Blob([zipSheets(files) as BlobPart], { type: "application/zip" });
}
