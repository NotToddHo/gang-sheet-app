"use client";

import { useEffect, useRef } from "react";
import { Check, Clock, X } from "lucide-react";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  cadence: string;
  note: string;
  href: string;
  highlight?: string;
}

// Placeholder Stripe Payment Links — swap for live links before launch.
const PLANS: readonly Plan[] = [
  {
    id: "monthly",
    name: "Pro Monthly",
    price: "$12",
    cadence: "/month",
    note: "Cancel anytime",
    href: "https://buy.stripe.com/test_monthly",
  },
  {
    id: "lifetime",
    name: "Lifetime Pass",
    price: "$49",
    cadence: "one-time",
    note: "Pay once, export forever",
    href: "https://buy.stripe.com/test_lifetime",
    highlight: "Best value",
  },
];

const FEATURES = [
  "Unlimited Print + Cut exports",
  "Auto-arrange with exact 2 mm cut spacing",
  "Multi-sheet layouts bundled in one zip",
  "Letter, Tabloid, Super B and Cameo mat sizes",
];

/** Upgrade prompt shown when the free exports are used up. Uses <dialog> for focus trapping and Esc-to-close. */
export default function PaywallModal({ open, onClose }: PaywallModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="paywall-title"
      aria-describedby="paywall-desc"
      onClose={onClose}
      // Clicking the backdrop (the dialog element itself, outside the content) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/50 backdrop:backdrop-blur-[2px] dark:bg-zinc-900 dark:text-zinc-100 dark:ring-1 dark:ring-zinc-800 dark:backdrop:bg-black/70"
    >
      <div className="relative p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
          <Clock className="h-4 w-4" />
          You&apos;ve used your free exports
        </div>
        <h2 id="paywall-title" className="mt-2 text-xl font-semibold">
          Save hours of manual layout
        </h2>
        <p id="paywall-desc" className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          Go Pro to keep exporting print-ready sheets and matching cut files — packed, marked and aligned for your
          cutter in seconds, not an afternoon in design software.
        </p>

        <ul className="mt-4 space-y-1.5">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border p-4 ${
                plan.highlight
                  ? "border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                  : "border-zinc-200 dark:border-zinc-700"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {plan.highlight}
                </span>
              )}
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{plan.name}</p>
              <p className="mt-1">
                <span className="text-2xl font-semibold">{plan.price}</span>{" "}
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{plan.cadence}</span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{plan.note}</p>
              <a
                href={plan.href}
                // New tab: the user's uploads live only in this tab's memory.
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-4 rounded-lg px-3 py-2 text-center text-sm font-medium ${
                  plan.highlight
                    ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    : "border border-zinc-300 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {plan.id === "lifetime" ? "Get lifetime access" : "Subscribe monthly"}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Secure checkout by Stripe. Opens in a new tab.</p>
      </div>
    </dialog>
  );
}
