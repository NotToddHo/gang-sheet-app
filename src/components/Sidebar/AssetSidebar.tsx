"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { AlertTriangle, FileArchive, ImagePlus, LayoutGrid, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import type { SheetAsset } from "@/lib/assets";
import type { SheetPreset } from "@/lib/sheetPresets";
import PaywallModal from "./PaywallModal";

export interface ArrangeStatus {
  sheets: number;
  placed: number;
  /** Copies bigger than an empty sheet's safe area. */
  tooLarge: number;
  /** Copies left over after hitting the sheet cap. */
  overflow: number;
  maxSheets: number;
  stale: boolean;
}

interface AssetSidebarProps {
  assets: readonly SheetAsset[];
  /** Error message per asset id, e.g. when its size exceeds the printable area. */
  assetErrors: Readonly<Record<string, string>>;
  /** Printable (usable) area in inches, shown alongside size errors. */
  printable: { width: number; height: number };
  sheetPresets: readonly SheetPreset[];
  sheetId: string;
  onSheetChange: (id: string) => void;
  loading: boolean;
  error: string | null;
  status: ArrangeStatus | null;
  onAddFiles: (files: File[]) => void;
  onResize: (id: string, width: number) => void;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onArrange: () => void;
  canExport: boolean;
  /** Export progress, or null when idle. */
  exporting: { done: number; total: number } | null;
  onDownloadZip: () => void;
  /** Free exports left, or null before it's known (first client render). */
  freeExportsRemaining: number | null;
  paywallOpen: boolean;
  onOpenPaywall: () => void;
  onClosePaywall: () => void;
}

export default function AssetSidebar({
  assets,
  assetErrors,
  printable,
  sheetPresets,
  sheetId,
  onSheetChange,
  loading,
  error,
  status,
  onAddFiles,
  onResize,
  onQuantityChange,
  onRemove,
  onArrange,
  canExport,
  exporting,
  onDownloadZip,
  freeExportsRemaining,
  paywallOpen,
  onOpenPaywall,
  onClosePaywall,
}: AssetSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const canArrange = assets.some((a) => a.quantity > 0);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    onAddFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <header className="border-b border-zinc-200 px-5 py-4">
        <h1 className="text-sm font-semibold text-zinc-900">Gang Sheet Builder</h1>
        <p className="mt-0.5 text-xs text-zinc-500">300 DPI · 2 mm cut spacing · Silhouette marks</p>
        <label className="mt-3 block text-xs font-medium text-zinc-600">
          Sheet Size
          <select
            value={sheetId}
            onChange={(e) => onSheetChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 outline-none focus:border-blue-500"
          >
            {sheetPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.width} x {p.height} in)
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="p-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50"
          }`}
        >
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          ) : (
            <ImagePlus className="h-6 w-6 text-zinc-400" />
          )}
          <span className="text-sm font-medium text-zinc-700">Drop PNGs here</span>
          <span className="text-xs text-zinc-500">or click to browse</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          multiple
          hidden
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {error && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {assets.length === 0 && <li className="py-8 text-center text-xs text-zinc-400">No artwork yet</li>}
        {assets.map((asset) => {
          const assetError = assetErrors[asset.id];
          const errorId = `${asset.id}-size-error`;
          return (
            <li
              key={asset.id}
              className={`rounded-lg border p-3 ${assetError ? "border-red-300 bg-red-50/40" : "border-zinc-200"}`}
            >
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img
                  src={asset.url}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded bg-[conic-gradient(#e4e4e7_25%,#fff_0_50%,#e4e4e7_0_75%,#fff_0)] bg-[length:8px_8px] object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-800" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {asset.pxWidth} × {asset.pxHeight} px
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(asset.id)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                  aria-label={`Remove ${asset.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3">
                <label className="text-xs text-zinc-500">
                  Size (in)
                  <div className="mt-1 flex items-center gap-1 text-zinc-700">
                    <InchField
                      value={asset.width}
                      onCommit={(w) => onResize(asset.id, w)}
                      ariaLabel="Width in inches"
                      errorId={assetError ? errorId : undefined}
                    />
                    <span className="text-zinc-400">×</span>
                    <InchField
                      value={asset.height}
                      onCommit={(h) => onResize(asset.id, (h * asset.pxWidth) / asset.pxHeight)}
                      ariaLabel="Height in inches"
                      errorId={assetError ? errorId : undefined}
                    />
                  </div>
                </label>

                <div className="text-xs text-zinc-500">
                  Qty
                  <div className="mt-1 flex items-center rounded-md border border-zinc-300">
                    <button
                      type="button"
                      onClick={() => onQuantityChange(asset.id, asset.quantity - 1)}
                      disabled={asset.quantity <= 0}
                      className="px-1.5 py-1 text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={asset.quantity}
                      onChange={(e) => onQuantityChange(asset.id, Number(e.target.value))}
                      className="w-10 [appearance:textfield] bg-transparent text-center text-sm text-zinc-800 outline-none [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Quantity"
                    />
                    <button
                      type="button"
                      onClick={() => onQuantityChange(asset.id, asset.quantity + 1)}
                      className="px-1.5 py-1 text-zinc-500 hover:text-zinc-900"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              {assetError && (
                <p
                  id={errorId}
                  role="alert"
                  className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700"
                >
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    {assetError}
                    <span className="mt-0.5 block text-red-600/80">
                      Max {floor2(printable.width)} × {floor2(printable.height)} in (either orientation).
                    </span>
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="space-y-3 border-t border-zinc-200 p-4">
        {status && (
          <div className="space-y-1 text-xs">
            <p className="text-zinc-600">
              {status.placed} {plural(status.placed, "copy", "copies")} on {status.sheets}{" "}
              {plural(status.sheets, "sheet", "sheets")}
            </p>
            {status.tooLarge > 0 && (
              <p className="flex items-start gap-1.5 text-amber-600">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                {status.tooLarge} {plural(status.tooLarge, "copy is", "copies are")} too large for the sheet — reduce
                the size to place {plural(status.tooLarge, "it", "them")}.
              </p>
            )}
            {status.overflow > 0 && (
              <p className="flex items-start gap-1.5 text-amber-600">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Stopped at {status.maxSheets} sheets; {status.overflow} {plural(status.overflow, "copy", "copies")} not
                placed.
              </p>
            )}
            {status.stale && <p className="text-blue-600">Changes since last arrange — run it again to update.</p>}
          </div>
        )}
        <button
          type="button"
          onClick={onArrange}
          disabled={!canArrange}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          <LayoutGrid className="h-4 w-4" />
          Auto-Arrange
        </button>
        <button
          type="button"
          onClick={onDownloadZip}
          disabled={!canExport || exporting !== null}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exporting {Math.min(exporting.done + 1, exporting.total)} of {exporting.total}…
            </>
          ) : (
            <>
              <FileArchive className="h-4 w-4" />
              Download Print + Cut (.zip)
            </>
          )}
        </button>
        <ExportQuotaNote remaining={freeExportsRemaining} onUpgrade={onOpenPaywall} />
      </footer>
      <PaywallModal open={paywallOpen} onClose={onClosePaywall} />
    </aside>
  );
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Subtle free-export counter under the download button. */
function ExportQuotaNote({ remaining, onUpgrade }: { remaining: number | null; onUpgrade: () => void }) {
  if (remaining === null) return <p className="h-4" aria-hidden />; // reserve space until known
  if (remaining > 0) {
    return (
      <p className="h-4 text-center text-[11px] text-zinc-400" aria-live="polite">
        {remaining} free {plural(remaining, "export", "exports")} remaining
      </p>
    );
  }
  return (
    <p className="h-4 text-center text-[11px] text-zinc-400" aria-live="polite">
      No free exports left ·{" "}
      <button type="button" onClick={onUpgrade} className="font-medium text-zinc-600 underline-offset-2 hover:underline">
        Go Pro
      </button>
    </p>
  );
}

/** Rounds down to 0.01 so the displayed max is never larger than what actually fits. */
const floor2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100;

/** Number input that only commits on blur / Enter, so partially typed values like "1." aren't clobbered. */
function InchField({
  value,
  onCommit,
  ariaLabel,
  errorId,
}: {
  value: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
  /** When set, the field is marked invalid and described by this element. */
  errorId?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed);
    setDraft(null);
  };

  return (
    <input
      type="number"
      step={0.05}
      min={0.1}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
      }}
      aria-label={ariaLabel}
      aria-invalid={errorId ? true : undefined}
      aria-describedby={errorId}
      className={`w-16 rounded-md border px-1.5 py-1 text-sm outline-none ${
        errorId ? "border-red-400 text-red-700 focus:border-red-500" : "border-zinc-300 focus:border-blue-500"
      }`}
    />
  );
}
