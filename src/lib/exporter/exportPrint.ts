import { DPI, PX_PER_MM, sheetPx } from "@/lib/packing/rectPacker";
import { setPngDpi } from "./png";
import type { PxRect, SheetPlacement, SheetSpec } from "./types";

/** Outward bleed past each cut line. With the 3 mm cut gap this is applied in full. */
export const BLEED_MM = 1.5;

export interface PrintExportInput {
  sheet: SheetSpec;
  placements: readonly SheetPlacement[];
  /** Registration marks, in sheet px. */
  marks: readonly PxRect[];
  /** Gap between cut lines in px (from the pack result). Bleed never exceeds half of it, so neighbours can't overprint. */
  gapPx: number;
  bleedMm?: number;
}

/**
 * Bleed actually applied, in px: the full BLEED_MM (18 px at 300 DPI), capped at half the
 * cut gap so adjacent items' bleeds can't overlap. At the default 3 mm gap (36 px) the cap
 * is also 18 px, so the full 1.5 mm is used; the cap only bites if the gap is ever narrowed.
 */
export function effectiveBleedPx(gapPx: number, bleedMm = BLEED_MM): number {
  return Math.min(Math.ceil(bleedMm * PX_PER_MM), Math.floor(gapPx / 2));
}

/**
 * Renders the print file at 300 DPI: white sheet, artwork with edge-extended bleed,
 * and registration marks. The canvas is the sheet size at 300 DPI (rounded to whole
 * pixels by sheetPx), with (0, 0) at the sheet's top-left, matching the cut SVG.
 */
export async function renderPrintPng({ sheet, placements, marks, gapPx, bleedMm }: PrintExportInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = sheetPx(sheet.width);
  canvas.height = sheetPx(sheet.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";

  const bleed = effectiveBleedPx(gapPx, bleedMm);
  for (const p of placements) {
    ctx.save();
    if (p.rotated) {
      // Rotate 90° clockwise about the rect's top-right corner; the image's own
      // width then runs down the page and its height runs right-to-left.
      ctx.translate(p.x + p.width, p.y);
      ctx.rotate(Math.PI / 2);
      drawWithBleed(ctx, p.image, p.height, p.width, bleed);
    } else {
      ctx.translate(p.x, p.y);
      drawWithBleed(ctx, p.image, p.width, p.height, bleed);
    }
    ctx.restore();
  }

  ctx.fillStyle = "#000000";
  for (const m of marks) ctx.fillRect(m.x, m.y, m.width, m.height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
  );
  const bytes = setPngDpi(new Uint8Array(await blob.arrayBuffer()), DPI);
  return new Blob([bytes as BlobPart], { type: "image/png" });
}

/**
 * Draws the image into (0, 0, w, h) and stretches its outermost pixel rows/columns
 * `bleed` px outward, so a slightly misregistered cut still lands on ink.
 */
function drawWithBleed(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, bleed: number) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (bleed > 0) {
    const b = bleed;
    // Edges
    ctx.drawImage(img, 0, 0, sw, 1, 0, -b, w, b);
    ctx.drawImage(img, 0, sh - 1, sw, 1, 0, h, w, b);
    ctx.drawImage(img, 0, 0, 1, sh, -b, 0, b, h);
    ctx.drawImage(img, sw - 1, 0, 1, sh, w, 0, b, h);
    // Corners
    ctx.drawImage(img, 0, 0, 1, 1, -b, -b, b, b);
    ctx.drawImage(img, sw - 1, 0, 1, 1, w, -b, b, b);
    ctx.drawImage(img, 0, sh - 1, 1, 1, -b, h, b, b);
    ctx.drawImage(img, sw - 1, sh - 1, 1, 1, w, h, b, b);
  }
  ctx.drawImage(img, 0, 0, sw, sh, 0, 0, w, h);
}
