import { readPngDpi } from "@/lib/exporter/png";
import { readJpegDpi } from "@/lib/jpeg";
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

const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

/** PNG or JPEG, by MIME type or (for drops that arrive without one) by extension. */
export function isImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return IMAGE_TYPES.has(file.type) || IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Embedded print DPI of a PNG (pHYs) or JPEG (JFIF/EXIF), detected from the bytes, or null. */
export function readImageDpi(bytes: Uint8Array): number | null {
  return readPngDpi(bytes) ?? readJpegDpi(bytes);
}

/**
 * Loads a PNG or JPEG at its true print size: pixels ÷ its embedded DPI (300 DPI if none).
 * It is never resized here, even when it's larger than the sheet; callers flag that.
 */
export async function loadImageAsset(file: File): Promise<SheetAsset> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    const [bytes] = await Promise.all([file.arrayBuffer(), image.decode()]);
    const dpi = readImageDpi(new Uint8Array(bytes));

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
