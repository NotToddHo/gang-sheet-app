import { setPngDpi } from "@/lib/exporter/png";
import { DPI } from "@/lib/packing/rectPacker";

/** PDF user-space units: 1 pt = 1/72 in. */
const POINTS_PER_INCH = 72;

/**
 * Most pixels we'll render for one page (~30 MP: a 12 × 24 in mat at 300 DPI is 26 MP).
 * Bigger pages render at a lower DPI instead of exhausting memory or hitting canvas limits;
 * their physical size is unchanged because the PNG records the DPI used.
 */
export const MAX_PAGE_PIXELS = 30_000_000;

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** DPI to render a page of `widthPt × heightPt` points at: 300, lowered only to stay under `maxPixels`. */
export function pageRenderDpi(widthPt: number, heightPt: number, maxPixels = MAX_PAGE_PIXELS): number {
  const areaIn2 = (widthPt / POINTS_PER_INCH) * (heightPt / POINTS_PER_INCH);
  if (areaIn2 * DPI * DPI <= maxPixels) return DPI;
  return Math.floor(Math.sqrt(maxPixels / areaIn2));
}

/** "stickers.pdf" for a one-page PDF, otherwise "stickers.pdf — page 2 of 5". */
export function pageAssetName(fileName: string, pageNumber: number, pageCount: number): string {
  return pageCount === 1 ? fileName : `${fileName} — page ${pageNumber} of ${pageCount}`;
}

export interface RenderedPage {
  pageNumber: number;
  pageCount: number;
  name: string;
  /** PNG with a pHYs chunk declaring `dpi`, so it imports at the page's true physical size. */
  png: Blob;
  dpi: number;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * Loads pdf.js on first use only (keeps it out of the initial bundle). The legacy build
 * supports older Safari/iPad versions; parsing runs in pdf.js's own Web Worker.
 */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs")
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    })
    .catch((err) => {
      pdfjsPromise = null; // allow a retry, e.g. after a flaky chunk load
      throw err;
    });
  return pdfjsPromise;
}

/** Lets the browser paint and handle input between pages. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
  );
}

/**
 * Renders each page of a PDF to a transparent 300 DPI PNG, one page at a time.
 *
 * Yields pages as they finish so callers can show them immediately. Parsing happens in
 * pdf.js's worker and rendering is chunked by pdf.js, with a yield between pages, so the
 * UI stays responsive even for long documents. Each page's canvas is released before the
 * next one is rendered to keep memory flat.
 */
export interface RenderPdfOptions {
  signal?: AbortSignal;
  /** Called just before each page starts rendering (1-based), e.g. to show progress. */
  onPageStart?: (pageNumber: number, pageCount: number) => void;
}

export async function* renderPdfPages(
  file: File,
  { signal, onPageStart }: RenderPdfOptions = {},
): AsyncGenerator<RenderedPage> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await loadingTask.promise;

  try {
    const pageCount = doc.numPages;
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      signal?.throwIfAborted();
      onPageStart?.(pageNumber, pageCount);
      const page = await doc.getPage(pageNumber);
      const canvas = document.createElement("canvas");
      try {
        const { width: widthPt, height: heightPt } = page.getViewport({ scale: 1 }); // honours /Rotate
        const dpi = pageRenderDpi(widthPt, heightPt);
        const viewport = page.getViewport({ scale: dpi / POINTS_PER_INCH });
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));

        // pdf.js asks for its context with `alpha: false`, which turns the transparent background
        // opaque black. A canvas has only one 2D context and keeps the attributes of the first
        // getContext call, so claiming it here with alpha first makes pdf.js reuse ours.
        if (!canvas.getContext("2d", { alpha: true })) throw new Error("Canvas 2D context unavailable");
        await page.render({
          canvas,
          viewport,
          intent: "print", // include print-only annotations, skip screen-only ones
          background: "rgba(0, 0, 0, 0)", // keep blank areas transparent, like a PNG sticker
        }).promise;

        const raw = await canvasToPng(canvas);
        const png = new Blob([setPngDpi(new Uint8Array(await raw.arrayBuffer()), dpi) as BlobPart], {
          type: "image/png",
        });
        yield { pageNumber, pageCount, name: pageAssetName(file.name, pageNumber, pageCount), png, dpi };
      } finally {
        canvas.width = 0; // free the backing store now rather than at GC
        canvas.height = 0;
        page.cleanup();
      }
      await yieldToBrowser();
    }
  } finally {
    await loadingTask.destroy();
  }
}

/** Human-readable reason a PDF couldn't be opened. */
export function describePdfError(fileName: string, err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "PasswordException") return `${fileName} is password-protected.`;
  if (name === "InvalidPDFException") return `${fileName} isn't a valid PDF.`;
  return `Couldn't read ${fileName}.`;
}
