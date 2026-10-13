import { CUT_GAP_MM, DPI, PX_PER_MM } from "@/lib/packing/rectPacker";
import type { PxRect, SheetSpec } from "./types";

export interface SilhouetteMarkPreset {
  /** Distance from each sheet edge to the outer edge of the marks. */
  insetIn: number;
  /** Side of the solid top-left square. */
  squareMm: number;
  /** Arm length of each L-bracket. */
  lengthMm: number;
  /** Line thickness of each L-bracket. */
  thicknessMm: number;
}

/** Silhouette Cameo "Type 1" marks: solid square top-left, L-brackets top-right and bottom-left. */
export const SILHOUETTE_CAMEO: SilhouetteMarkPreset = {
  insetIn: 0.5,
  squareMm: 5,
  lengthMm: 20,
  thicknessMm: 0.5,
};

/** Registration marks as filled rectangles in 300 DPI sheet pixels. */
export function silhouetteMarks(sheet: SheetSpec, preset: SilhouetteMarkPreset = SILHOUETTE_CAMEO): PxRect[] {
  const W = sheet.width * DPI;
  const H = sheet.height * DPI;
  const inset = preset.insetIn * DPI;
  const sq = preset.squareMm * PX_PER_MM;
  const len = preset.lengthMm * PX_PER_MM;
  const t = preset.thicknessMm * PX_PER_MM;

  return [
    // Top-left solid square
    { x: inset, y: inset, width: sq, height: sq },
    // Top-right L: horizontal arm + vertical arm meeting at the outer corner
    { x: W - inset - len, y: inset, width: len, height: t },
    { x: W - inset - t, y: inset, width: t, height: len },
    // Bottom-left L
    { x: inset, y: H - inset - t, width: len, height: t },
    { x: inset, y: H - inset - len, width: t, height: len },
  ];
}

/**
 * Margin (inches) that keeps artwork, including its bleed, clear of the marks:
 * the mark inset, plus the deepest mark (the square), plus one cut gap of clearance.
 */
export function safeMarginIn(preset: SilhouetteMarkPreset = SILHOUETTE_CAMEO): number {
  const deepestMm = Math.max(preset.squareMm, preset.thicknessMm);
  return preset.insetIn + (deepestMm + CUT_GAP_MM) / 25.4;
}
