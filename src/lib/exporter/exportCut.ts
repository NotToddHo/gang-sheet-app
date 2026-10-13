import { DPI } from "@/lib/packing/rectPacker";
import type { PxRect, SheetSpec } from "./types";

const MM_PER_IN = 25.4;

/** Sheet px → mm, rounded to 0.1 µm to keep the file tidy without losing precision. */
const toMm = (px: number) => Math.round((px * MM_PER_IN * 10000) / DPI) / 10000;

/**
 * Builds the cut file: a 1:1 SVG in millimetres containing only closed cut loops.
 *
 * The document is exactly the sheet size with (0, 0) at the sheet's top-left, the
 * same frame as the print PNG, so it aligns with the print without any resizing.
 */
export function buildCutSvg(sheet: SheetSpec, cuts: readonly PxRect[]): string {
  const widthMm = toMm(Math.round(sheet.width * DPI));
  const heightMm = toMm(Math.round(sheet.height * DPI));

  const paths = cuts.map((r) => {
    const x0 = toMm(r.x);
    const y0 = toMm(r.y);
    const x1 = toMm(r.x + r.width);
    const y1 = toMm(r.y + r.height);
    return `    <path d="M${x0} ${y0}H${x1}V${y1}H${x0}Z"/>`;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
    `  <g id="cut-lines" fill="none" stroke="#ff0000" stroke-width="0.1">`,
    ...paths,
    `  </g>`,
    `</svg>`,
    ``,
  ].join("\n");
}
