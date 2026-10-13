/** Free zip exports before the paywall. */
export const FREE_EXPORT_LIMIT = 3;

export const EXPORT_QUOTA_STORAGE_KEY = "gangsheet:free-exports-used";

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export interface ExportQuota {
  used(): number;
  remaining(): number;
  /** Records one successful export and returns the new remaining count. */
  record(): number;
}

/** The browser's localStorage, or null where it's unavailable or blocked (SSR, some private modes). */
export function browserStorage(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Client-side counter of free exports. Persists to `store` when it can, and always
 * keeps an in-memory count too, so a blocked or failing store still limits the session.
 *
 * Note: this is a soft gate. Anyone can reset localStorage; real enforcement needs a server.
 */
export function createExportQuota(store: KeyValueStore | null, limit = FREE_EXPORT_LIMIT): ExportQuota {
  let memoryUsed = 0;

  const readStored = (): number => {
    try {
      const n = Number.parseInt(store?.getItem(EXPORT_QUOTA_STORAGE_KEY) ?? "", 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  };

  const used = () => Math.max(readStored(), memoryUsed);
  const remaining = () => Math.max(0, limit - used());

  return {
    used,
    remaining,
    record() {
      memoryUsed = used() + 1;
      try {
        store?.setItem(EXPORT_QUOTA_STORAGE_KEY, String(memoryUsed));
      } catch {
        // Quota exceeded / storage blocked: the in-memory count still applies for this session.
      }
      return remaining();
    },
  };
}
