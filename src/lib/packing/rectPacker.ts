import { pack2D, type Box2D } from "binpackingjs/2d";

/** Print resolution. 1 inch = 300 px. */
export const DPI = 300;
/** 1 mm = 11.811 px at 300 DPI. */
export const PX_PER_MM = DPI / 25.4;
/** Mandatory gap between cut vectors. */
export const CUT_GAP_MM = 2.0;

export const LETTER_WIDTH_IN = 8.5;
export const LETTER_HEIGHT_IN = 11;

export interface PackItem {
  /** Optional caller-supplied identifier, echoed back on each placement. */
  id?: string;
  /** Inches. */
  width: number;
  /** Inches. */
  height: number;
  /** Number of copies to place. */
  quantity: number;
}

export interface PackOptions {
  /** Sheet width in inches. Default 8.5. */
  sheetWidth?: number;
  /** Sheet height in inches. Default 11. */
  sheetHeight?: number;
  /** Gap between items in mm. Clamped to a minimum of 2 mm. */
  gapMm?: number;
  /** Clear border around the sheet edge in inches (e.g. for registration marks). Default 0. */
  margin?: number;
  /** Allow 90° rotation to improve fit. Default true. */
  allowRotation?: boolean;
}

export interface Placement {
  /** Index into the input items array. */
  itemIndex: number;
  /** 0-based copy number within that item's quantity. */
  copyIndex: number;
  id?: string;
  /** Top-left position and placed size, in inches from the sheet origin (0,0). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Same rectangle in 300 DPI pixels (integers). */
  px: { x: number; y: number; width: number; height: number };
  /** True when the item was rotated 90° (width/height are already swapped). */
  rotated: boolean;
}

export interface UnplacedItem {
  itemIndex: number;
  copyIndex: number;
  id?: string;
  width: number;
  height: number;
}

export interface PackResult {
  sheet: { width: number; height: number; widthPx: number; heightPx: number };
  /** Gap actually enforced, in px (rounded up from gapMm so it is never below spec). */
  gapPx: number;
  placements: Placement[];
  unplaced: UnplacedItem[];
  /** Placed item area / sheet area, 0–1. */
  utilization: number;
}

interface TaggedBox extends Box2D {
  readonly itemIndex: number;
  readonly copyIndex: number;
  readonly id?: string;
  readonly wPx: number;
  readonly hPx: number;
}

/**
 * Sheet edge length in inches → whole 300 DPI pixels. Every consumer (packer, print PNG,
 * cut SVG, marks, preview) uses this so they share one pixel frame, even for metric
 * sheets like A4 whose 210 mm isn't a whole number of pixels.
 */
export const sheetPx = (inches: number) => Math.round(inches * DPI);

/** Inches → px, rounded up so artwork is never clipped. */
const inToPx = (inches: number) => Math.ceil(inches * DPI - 1e-9);

/** Integer-px sheet geometry shared by the packers and the fit check. */
function sheetGeometry(options: PackOptions) {
  const sheetWidth = options.sheetWidth ?? LETTER_WIDTH_IN;
  const sheetHeight = options.sheetHeight ?? LETTER_HEIGHT_IN;
  const gapMm = Math.max(options.gapMm ?? CUT_GAP_MM, CUT_GAP_MM);
  const sheetWPx = sheetPx(sheetWidth);
  const sheetHPx = sheetPx(sheetHeight);
  const marginPx = inToPx(options.margin ?? 0);
  return {
    sheetWidth,
    sheetHeight,
    sheetWPx,
    sheetHPx,
    marginPx,
    gapPx: Math.ceil(gapMm * PX_PER_MM),
    usableW: sheetWPx - 2 * marginPx,
    usableH: sheetHPx - 2 * marginPx,
    allowRotation: options.allowRotation ?? true,
  };
}

/**
 * Whether one item of this size fits on an empty sheet's usable area (inside `margin`),
 * in either orientation when rotation is allowed. Uses the packer's exact px rounding,
 * so anything this accepts the packer can place.
 */
export function fitsOnSheet(width: number, height: number, options: PackOptions = {}): boolean {
  const { usableW, usableH, allowRotation } = sheetGeometry(options);
  const w = inToPx(width);
  const h = inToPx(height);
  return (w <= usableW && h <= usableH) || (allowRotation && h <= usableW && w <= usableH);
}

/** Largest usable area in inches (width × height inside the margin). */
export function usableArea(options: PackOptions = {}): { width: number; height: number } {
  const { usableW, usableH } = sheetGeometry(options);
  return { width: usableW / DPI, height: usableH / DPI };
}

/**
 * Packs rectangles onto a single sheet with a guaranteed minimum gap between them.
 *
 * Works in integer 300 DPI pixels. Each box is inflated by the gap on its right and
 * bottom, and the usable area is inflated by the same amount, so any two placed
 * items are separated by at least `gapPx` while items may still sit flush against
 * the usable-area edges.
 */
export function packRects(items: readonly PackItem[], options: PackOptions = {}): PackResult {
  const { sheetWidth, sheetHeight, sheetWPx, sheetHPx, marginPx, gapPx, usableW, usableH, allowRotation } =
    sheetGeometry(options);

  const boxes: TaggedBox[] = [];
  const unplaced: UnplacedItem[] = [];

  items.forEach((item, itemIndex) => {
    if (!(item.width > 0 && item.height > 0)) {
      throw new Error(`Item ${itemIndex}: width and height must be positive`);
    }
    const qty = Math.floor(item.quantity);
    if (!(qty >= 0)) throw new Error(`Item ${itemIndex}: quantity must be a non-negative number`);

    const wPx = inToPx(item.width);
    const hPx = inToPx(item.height);
    for (let copyIndex = 0; copyIndex < qty; copyIndex++) {
      boxes.push({
        width: wPx + gapPx,
        height: hPx + gapPx,
        constrainRotation: !allowRotation,
        itemIndex,
        copyIndex,
        id: item.id,
        wPx,
        hPx,
      });
    }
  });

  const placements: Placement[] = [];

  if (usableW > 0 && usableH > 0 && boxes.length > 0) {
    const result = pack2D({
      bins: [{ width: usableW + gapPx, height: usableH + gapPx }],
      boxes,
      factor: 1, // inputs are already integer px
    });

    for (const packed of result.packedBins[0]?.boxes ?? []) {
      const src = packed.sourceBox as TaggedBox;
      const wPx = packed.rotated ? src.hPx : src.wPx;
      const hPx = packed.rotated ? src.wPx : src.hPx;
      const xPx = packed.x + marginPx;
      const yPx = packed.y + marginPx;
      placements.push({
        itemIndex: src.itemIndex,
        copyIndex: src.copyIndex,
        id: src.id,
        x: xPx / DPI,
        y: yPx / DPI,
        width: wPx / DPI,
        height: hPx / DPI,
        px: { x: xPx, y: yPx, width: wPx, height: hPx },
        rotated: packed.rotated,
      });
    }

    for (const box of result.unpackedBoxes) {
      const src = box as TaggedBox;
      const item = items[src.itemIndex];
      unplaced.push({ itemIndex: src.itemIndex, copyIndex: src.copyIndex, id: src.id, width: item.width, height: item.height });
    }
  } else {
    for (const src of boxes) {
      const item = items[src.itemIndex];
      unplaced.push({ itemIndex: src.itemIndex, copyIndex: src.copyIndex, id: src.id, width: item.width, height: item.height });
    }
  }

  placements.sort((a, b) => a.itemIndex - b.itemIndex || a.copyIndex - b.copyIndex);

  const placedArea = placements.reduce((sum, p) => sum + p.px.width * p.px.height, 0);

  return {
    sheet: { width: sheetWidth, height: sheetHeight, widthPx: sheetWPx, heightPx: sheetHPx },
    gapPx,
    placements,
    unplaced,
    utilization: placedArea / (sheetWPx * sheetHPx),
  };
}

export interface MultiPackOptions extends PackOptions {
  /** Stop after this many sheets; anything left goes to `overflow`. Default 100. */
  maxSheets?: number;
}

export interface SheetLayout {
  placements: Placement[];
  /** Placed item area / sheet area, 0–1. */
  utilization: number;
}

export interface MultiPackResult {
  sheet: PackResult["sheet"];
  gapPx: number;
  /** One entry per generated sheet, in order. Empty when nothing could be placed. */
  sheets: SheetLayout[];
  /** Copies that can't fit even on an empty sheet at their requested size. */
  tooLarge: UnplacedItem[];
  /** Copies that would fit but were cut off by `maxSheets`. */
  overflow: UnplacedItem[];
}

/**
 * Packs every requested copy at its exact size, adding sheets as needed. Items are
 * never scaled: leftovers from one sheet are packed onto the next until all copies
 * are placed. `copyIndex` on each placement is unique per item across all sheets.
 */
export function packSheets(items: readonly PackItem[], options: MultiPackOptions = {}): MultiPackResult {
  const maxSheets = options.maxSheets ?? 100;

  // An empty pass validates the inputs and gives the sheet metadata.
  const probe = packRects(
    items.map((it) => ({ ...it, quantity: 0 })),
    options,
  );
  const { gapPx, usableW, usableH } = sheetGeometry(options);
  const binW = usableW + gapPx;
  const binH = usableH + gapPx;

  const remaining = items.map((it) => Math.max(0, Math.floor(it.quantity)));
  const placedSoFar = items.map(() => 0);
  const unplacedCopies = (itemIndex: number, from: number, count: number): UnplacedItem[] =>
    Array.from({ length: count }, (_, k) => ({
      itemIndex,
      copyIndex: from + k,
      id: items[itemIndex].id,
      width: items[itemIndex].width,
      height: items[itemIndex].height,
    }));

  // Inflated box size, and how many could possibly fit on one sheet by area (an upper bound
  // that keeps each pass small when a quantity is huge).
  const boxW = items.map((it) => inToPx(it.width) + gapPx);
  const boxH = items.map((it) => inToPx(it.height) + gapPx);
  const perSheetBound = items.map((_, i) => Math.floor((binW * binH) / (boxW[i] * boxH[i])));

  const tooLarge: UnplacedItem[] = [];
  items.forEach((_, i) => {
    if (remaining[i] > 0 && !fitsOnSheet(items[i].width, items[i].height, options)) {
      tooLarge.push(...unplacedCopies(i, 0, remaining[i]));
      remaining[i] = 0;
    }
  });

  const sheets: SheetLayout[] = [];
  while (sheets.length < maxSheets && remaining.some((n) => n > 0)) {
    const pass = packRects(
      items.map((it, i) => ({ ...it, quantity: Math.min(remaining[i], perSheetBound[i]) })),
      options,
    );
    if (pass.placements.length === 0) break; // can't make progress; shouldn't happen after the size check

    // Renumber copies sequentially across sheets (a pass may place copies 0, 1, 3 of a batch).
    const placements = pass.placements.map((p) => {
      remaining[p.itemIndex]--;
      return { ...p, copyIndex: placedSoFar[p.itemIndex]++ };
    });
    sheets.push({ placements, utilization: pass.utilization });
  }

  const overflow = remaining.flatMap((count, i) => (count > 0 ? unplacedCopies(i, placedSoFar[i], count) : []));

  return { sheet: probe.sheet, gapPx, sheets, tooLarge, overflow };
}
