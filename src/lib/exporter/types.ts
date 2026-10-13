/** Sheet size in inches. */
export interface SheetSpec {
  width: number;
  height: number;
}

/** An axis-aligned rectangle in 300 DPI sheet pixels, measured from the sheet's top-left (0, 0). */
export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One placed copy of an image. The rect is the cut rectangle; width/height are already swapped when rotated. */
export interface SheetPlacement extends PxRect {
  key: string;
  image: HTMLImageElement;
  /** Rotated 90° clockwise. */
  rotated: boolean;
}
