import { readPngDpi } from "@/lib/exporter/png";
import { DPI } from "@/lib/packing/rectPacker";

export interface SheetAsset {
  id: string;
  name: string;
  /** Object URL for the uploaded file. Revoke when the asset is removed. */
  url: string;
  image: HTMLImageElement;
  /** Source pixel dimensions. */
  pxWidth: number;
  pxHeight: number;
  /** Print size in inches. Aspect ratio is locked to the source pixels. */
  width: number;
  height: number;
  quantity: number;
}

export function isPng(file: File): boolean {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

/**
 * Loads a PNG at its true print size: pixels ÷ its embedded DPI (300 DPI if none).
 * It is never resized here, even when it's larger than the sheet; callers flag that.
 */
export async function loadPngAsset(file: File): Promise<SheetAsset> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    const [bytes] = await Promise.all([file.arrayBuffer(), image.decode()]);
    const dpi = readPngDpi(new Uint8Array(bytes));

    const pxWidth = image.naturalWidth;
    const pxHeight = image.naturalHeight;
    const effectiveDpi = dpi && dpi > 0 ? dpi : DPI;
    const width = roundIn(pxWidth / effectiveDpi);

    return {
      id: crypto.randomUUID(),
      name: file.name,
      url,
      image,
      pxWidth,
      pxHeight,
      width,
      height: roundIn((width * pxHeight) / pxWidth),
      quantity: 1,
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** Rounds to 0.01 in. */
export const roundIn = (inches: number) => Math.round(inches * 100) / 100;
