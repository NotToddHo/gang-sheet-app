"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SheetPager from "@/components/Canvas/SheetPager";
import AssetSidebar, { type ArrangeStatus } from "@/components/Sidebar/AssetSidebar";
import { isPng, loadPngAsset, roundIn, type SheetAsset } from "@/lib/assets";
import { downloadBlob, fileStamp } from "@/lib/exporter/download";
import { exportSheetsZip } from "@/lib/exporter/exportZip";
import { browserStorage, createExportQuota, EXPORT_QUOTA_STORAGE_KEY, type ExportQuota } from "@/lib/exportQuota";
import type { SheetPlacement } from "@/lib/exporter/types";
import { fitsOnSheet, packSheets, type MultiPackResult } from "@/lib/packing/rectPacker";
import { describePdfError, isPdf, renderPdfPages } from "@/lib/pdf";
import {
  DEFAULT_SHEET_PRESET,
  findSheetPreset,
  SHEET_PRESETS,
  sheetSetup,
  type SheetSetup,
} from "@/lib/sheetPresets";

// Konva needs the DOM, so the canvas is client-only.
const WorkspaceCanvas = dynamic(() => import("@/components/Canvas/WorkspaceCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-zinc-100 dark:bg-zinc-950" />,
});

const OVERSIZE_ERROR = "Image exceeds printable area. Reduce size or select a larger sheet.";
const MIN_SIZE_IN = 0.1;
/** Safety cap so a typo like qty 100000 can't lock up the tab. */
const MAX_SHEETS = 100;

interface Layout {
  result: MultiPackResult;
  /** Snapshot of the inputs the layout was computed from, to detect edits. */
  signature: string;
}

const signatureOf = (assets: readonly SheetAsset[]) =>
  JSON.stringify(assets.map((a) => [a.id, a.width, a.height, a.quantity]));

function packAssets(assets: readonly SheetAsset[], setup: SheetSetup): Layout {
  const result = packSheets(
    assets.map((a) => ({ id: a.id, width: a.width, height: a.height, quantity: a.quantity })),
    { ...setup.packOptions, maxSheets: MAX_SHEETS },
  );
  return { result, signature: signatureOf(assets) };
}

export default function Workspace() {
  const [sheetId, setSheetId] = useState(DEFAULT_SHEET_PRESET.id);
  const setup = useMemo(() => sheetSetup(findSheetPreset(sheetId)), [sheetId]);
  const [assets, setAssets] = useState<SheetAsset[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  /** Number of uploads still being processed (drops can overlap). */
  const [importsInFlight, setImportsInFlight] = useState(0);
  /** Progress line shown under the drop zone, e.g. "Rendering a.pdf — page 2 of 9". */
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Assets whose most recent resize was rejected for being too large. */
  const [rejectedResizes, setRejectedResizes] = useState<ReadonlySet<string>>(new Set());
  const [currentSheet, setCurrentSheet] = useState(0);
  /** Export progress, or null when idle. */
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  /** Free exports left; null until read from localStorage on the client (avoids a hydration mismatch). */
  const [freeExportsRemaining, setFreeExportsRemaining] = useState<number | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const quotaRef = useRef<ExportQuota | null>(null);
  const getQuota = useCallback(() => (quotaRef.current ??= createExportQuota(browserStorage())), []);

  useEffect(() => {
    setFreeExportsRemaining(getQuota().remaining());
    // Keep the counter in sync when another tab exports.
    const onStorage = (e: StorageEvent) => {
      if (e.key === EXPORT_QUOTA_STORAGE_KEY || e.key === null) setFreeExportsRemaining(getQuota().remaining());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [getQuota]);

  // On unmount: stop any PDF still rendering and revoke remaining object URLs.
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const importAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    // Created here, not in useRef(), so Strict Mode's mount→unmount→mount doesn't leave it aborted.
    const controller = new AbortController();
    importAbortRef.current = controller;
    return () => {
      controller.abort();
      assetsRef.current.forEach((a) => URL.revokeObjectURL(a.url));
    };
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const pngs = files.filter(isPng);
    const pdfs = files.filter((f) => !isPng(f) && isPdf(f));
    const skipped = files.length - pngs.length - pdfs.length;
    const problems: string[] = [];
    if (skipped > 0) problems.push(`Skipped ${skipped} unsupported file${skipped === 1 ? "" : "s"} (PNG and PDF only).`);
    setError(problems.length ? problems.join(" ") : null);
    if (pngs.length === 0 && pdfs.length === 0) return;

    const signal = importAbortRef.current?.signal;
    setImportsInFlight((n) => n + 1);
    try {
      if (pngs.length > 0) {
        setImportStatus(`Loading ${pngs.length} PNG${pngs.length === 1 ? "" : "s"}…`);
        const results = await Promise.allSettled(pngs.map((f) => loadPngAsset(f)));
        const loaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        const failed = results.length - loaded.length;
        if (failed > 0) problems.push(`Couldn't read ${failed} PNG${failed === 1 ? "" : "s"}.`);
        setAssets((prev) => [...prev, ...loaded]);
      }

      // PDFs one at a time, page by page; each page appears in the sidebar as soon as it's ready.
      for (const pdf of pdfs) {
        setImportStatus(`Opening ${pdf.name}…`);
        try {
          const pages = renderPdfPages(pdf, {
            signal,
            onPageStart: (n, total) => setImportStatus(`Rendering ${pdf.name} — page ${n} of ${total}`),
          });
          for await (const page of pages) {
            const asset = await loadPngAsset(new File([page.png], page.name, { type: "image/png" }));
            setAssets((prev) => [...prev, asset]);
          }
        } catch (err) {
          if (signal?.aborted) return;
          problems.push(describePdfError(pdf.name, err));
        }
      }
    } finally {
      setImportsInFlight((n) => n - 1);
      setImportStatus(null);
    }
    if (problems.length > 0) setError(problems.join(" "));
  }, []);

  const resize = useCallback(
    (id: string, width: number) => {
      const asset = assets.find((a) => a.id === id);
      if (!asset) return;
      const w = roundIn(Math.max(width, MIN_SIZE_IN));
      const h = roundIn((w * asset.pxHeight) / asset.pxWidth);

      if (!fitsOnSheet(w, h, setup.packOptions)) {
        // Reject: keep the previous size and flag the asset.
        setRejectedResizes((prev) => new Set(prev).add(id));
        return;
      }
      setRejectedResizes((prev) => withoutId(prev, id));
      setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, width: w, height: h } : a)));
    },
    [assets, setup],
  );

  const setQuantity = useCallback((id: string, quantity: number) => {
    const q = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, quantity: q } : a)));
  }, []);

  const remove = useCallback((id: string) => {
    setAssets((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
    setRejectedResizes((prev) => withoutId(prev, id));
  }, []);

  const arrange = useCallback(() => {
    setLayout(packAssets(assets, setup));
    setCurrentSheet(0);
  }, [assets, setup]);

  // Switching paper re-packs immediately (if there's a layout) so the canvas never shows a stale size.
  const changeSheet = useCallback(
    (id: string) => {
      const next = sheetSetup(findSheetPreset(id));
      setSheetId(next.preset.id);
      setRejectedResizes(new Set()); // a size rejected on the old sheet may fit this one; current sizes are re-checked
      if (layout) {
        setLayout(packAssets(assets, next));
        setCurrentSheet(0);
      }
    },
    [layout, assets],
  );

  /** Per-asset error: the current size is too large (e.g. a big upload), or the last resize was rejected. */
  const assetErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const a of assets) {
      if (rejectedResizes.has(a.id) || !fitsOnSheet(a.width, a.height, setup.packOptions)) {
        errors[a.id] = OVERSIZE_ERROR;
      }
    }
    return errors;
  }, [assets, rejectedResizes, setup]);

  /** Placements for every sheet, resolved to images. */
  const sheets = useMemo<SheetPlacement[][]>(() => {
    if (!layout) return [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    return layout.result.sheets.map((sheet, sheetIndex) =>
      sheet.placements.flatMap((p) => {
        const asset = p.id ? byId.get(p.id) : undefined;
        if (!asset) return []; // removed since the last arrange
        return [{ key: `${sheetIndex}:${asset.id}:${p.copyIndex}`, image: asset.image, ...p.px, rotated: p.rotated }];
      }),
    );
  }, [layout, assets]);

  const sheetIndex = Math.min(currentSheet, Math.max(0, sheets.length - 1));
  const placements = sheets[sheetIndex] ?? [];
  const canExport = sheets.some((s) => s.length > 0);

  const status = useMemo<ArrangeStatus | null>(() => {
    if (!layout) return null;
    const { sheets, tooLarge, overflow } = layout.result;
    const placed = sheets.reduce((n, s) => n + s.placements.length, 0);
    return {
      sheets: sheets.length,
      placed,
      tooLarge: tooLarge.length,
      overflow: overflow.length,
      maxSheets: MAX_SHEETS,
      stale: layout.signature !== signatureOf(assets),
    };
  }, [layout, assets]);

  // Exports exactly what's on the canvas (the last arranged layout), every sheet.
  const downloadZip = useCallback(async () => {
    if (!layout || !canExport) return;
    const quota = getQuota();
    if (quota.remaining() <= 0) {
      setFreeExportsRemaining(0);
      setPaywallOpen(true);
      return;
    }
    setExporting({ done: 0, total: sheets.length });
    setError(null);
    try {
      const blob = await exportSheetsZip({
        sheet: setup.sheet,
        sheets,
        marks: setup.marks,
        gapPx: layout.result.gapPx,
        onProgress: (done, total) => setExporting({ done, total }),
      });
      downloadBlob(blob, `gang-sheets-${setup.preset.id}-${fileStamp()}.zip`);
      // Only successful exports use up a free one.
      setFreeExportsRemaining(quota.record());
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(null);
    }
  }, [layout, sheets, canExport, setup, getQuota]);

  return (
    <div className="flex h-screen w-full bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <AssetSidebar
        assets={assets}
        assetErrors={assetErrors}
        printable={setup.printable}
        sheetPresets={SHEET_PRESETS}
        sheetId={setup.preset.id}
        onSheetChange={changeSheet}
        loading={importsInFlight > 0}
        loadingStatus={importStatus}
        error={error}
        status={status}
        onAddFiles={addFiles}
        onResize={resize}
        onQuantityChange={setQuantity}
        onRemove={remove}
        onArrange={arrange}
        canExport={canExport}
        exporting={exporting}
        onDownloadZip={downloadZip}
        freeExportsRemaining={freeExportsRemaining}
        paywallOpen={paywallOpen}
        onOpenPaywall={() => setPaywallOpen(true)}
        onClosePaywall={() => setPaywallOpen(false)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <WorkspaceCanvas
            sheetWidth={setup.sheet.width}
            sheetHeight={setup.sheet.height}
            safeMargin={setup.safeMargin}
            marks={setup.marks}
            placements={placements}
            label={sheets.length > 0 ? `Sheet ${sheetIndex + 1}` : undefined}
          />
        </div>
        {sheets.length > 0 && (
          <SheetPager
            count={sheets.length}
            current={sheetIndex}
            itemCounts={sheets.map((s) => s.length)}
            onChange={setCurrentSheet}
          />
        )}
      </main>
    </div>
  );
}

function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}
