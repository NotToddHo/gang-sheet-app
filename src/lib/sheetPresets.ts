import { safeMarginIn, silhouetteMarks } from "@/lib/exporter/registrationMarks";
import type { PxRect, SheetSpec } from "@/lib/exporter/types";
import { LETTER_HEIGHT_IN, LETTER_WIDTH_IN, usableArea, type PackOptions } from "@/lib/packing/rectPacker";

export interface SheetPreset {
  id: string;
  label: string;
  /** Inches, portrait. */
  width: number;
  height: number;
}

/** Millimetres → inches, for ISO paper sizes defined in mm. */
const mm = (millimetres: number) => millimetres / 25.4;

/** Ordered by size within each family: office paper first, then Cameo mats. */
export const SHEET_PRESETS: readonly SheetPreset[] = [
  { id: "letter", label: "US Letter", width: LETTER_WIDTH_IN, height: LETTER_HEIGHT_IN },
  { id: "a4", label: "A4", width: mm(210), height: mm(297) },
  { id: "tabloid", label: "Tabloid", width: 11, height: 17 },
  { id: "a3", label: "A3", width: mm(297), height: mm(420) },
  { id: "super-b", label: "Super B / A3+", width: 13, height: 19 },
  { id: "cameo-12x12", label: "Cameo 12x12 Mat", width: 12, height: 12 },
  { id: "cameo-12x24", label: "Cameo 12x24 Mat", width: 12, height: 24 },
];

export const DEFAULT_SHEET_PRESET = SHEET_PRESETS[0];

/** Inches for display: 2 decimal places, trailing zeros dropped (8.5, 11, 8.27). */
export const formatInches = (inches: number) => String(Number(inches.toFixed(2)));

/** e.g. "8.5 x 11 in", "8.27 x 11.69 in". */
export function presetSizeLabel(preset: SheetPreset): string {
  return `${formatInches(preset.width)} x ${formatInches(preset.height)} in`;
}

export function findSheetPreset(id: string): SheetPreset {
  return SHEET_PRESETS.find((p) => p.id === id) ?? DEFAULT_SHEET_PRESET;
}

/** Everything that depends on the paper size, derived together so packing, preview and export always agree. */
export interface SheetSetup {
  preset: SheetPreset;
  sheet: SheetSpec;
  marks: PxRect[];
  /** Artwork is packed inside this margin so it (and its bleed) stays clear of the registration marks. */
  safeMargin: number;
  /** Shared by packing and the per-asset size check. */
  packOptions: PackOptions;
  /** Usable area in inches. */
  printable: { width: number; height: number };
}

export function sheetSetup(preset: SheetPreset): SheetSetup {
  const sheet = { width: preset.width, height: preset.height };
  const safeMargin = safeMarginIn();
  const packOptions: PackOptions = { sheetWidth: sheet.width, sheetHeight: sheet.height, margin: safeMargin };
  return {
    preset,
    sheet,
    marks: silhouetteMarks(sheet),
    safeMargin,
    packOptions,
    printable: usableArea(packOptions),
  };
}
