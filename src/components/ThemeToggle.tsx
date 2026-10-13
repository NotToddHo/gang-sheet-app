"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Light/dark switch. The icon is chosen by CSS (`dark:` variants), not by reading the
 * theme in render, so it's correct on first paint with no hydration mismatch.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 ${className}`}
    >
      {/* Moon in light mode (click for dark), Sun in dark mode (click for light). */}
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
    </button>
  );
}
