"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface SheetPagerProps {
  count: number;
  /** 0-based. */
  current: number;
  /** Placed copies per sheet, for the tooltips. */
  itemCounts: readonly number[];
  onChange: (index: number) => void;
}

/** Show a numbered tab per sheet up to this many; beyond that, just prev/next. */
const MAX_TABS = 12;

export default function SheetPager({ count, current, itemCounts, onChange }: SheetPagerProps) {
  const go = (i: number) => onChange(Math.min(count - 1, Math.max(0, i)));

  return (
    <nav
      aria-label="Sheets"
      className="flex shrink-0 items-center justify-center gap-2 border-t border-zinc-200 bg-white px-4 py-2.5"
    >
      <button
        type="button"
        onClick={() => go(current - 1)}
        disabled={current === 0}
        aria-label="Previous sheet"
        className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {count <= MAX_TABS ? (
        <div className="flex items-center gap-1">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-current={i === current ? "page" : undefined}
              title={`Sheet ${i + 1} · ${itemCounts[i] ?? 0} items`}
              className={`min-w-8 rounded-md px-2 py-1 text-xs font-medium ${
                i === current ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              Sheet {i + 1}
            </button>
          ))}
        </div>
      ) : (
        <span className="min-w-28 text-center text-xs font-medium text-zinc-700" aria-live="polite">
          Sheet {current + 1} of {count}
        </span>
      )}

      <button
        type="button"
        onClick={() => go(current + 1)}
        disabled={current === count - 1}
        aria-label="Next sheet"
        className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
