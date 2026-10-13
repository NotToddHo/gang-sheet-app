import { describe, expect, it } from "vitest";
import { createExportQuota, EXPORT_QUOTA_STORAGE_KEY, FREE_EXPORT_LIMIT } from "@/lib/exportQuota";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("export quota", () => {
  it("allows exactly 3 free exports", () => {
    expect(FREE_EXPORT_LIMIT).toBe(3);
    const quota = createExportQuota(memoryStore());

    expect(quota.remaining()).toBe(3);
    expect(quota.record()).toBe(2);
    expect(quota.record()).toBe(1);
    expect(quota.record()).toBe(0);
    expect(quota.remaining()).toBe(0); // 4th attempt is blocked by the caller
  });

  it("persists across page loads via the store", () => {
    const store = memoryStore();
    createExportQuota(store).record();
    createExportQuota(store).record();

    expect(store.data.get(EXPORT_QUOTA_STORAGE_KEY)).toBe("2");
    expect(createExportQuota(store).remaining()).toBe(1);
  });

  it("treats missing or garbage stored values as zero used", () => {
    expect(createExportQuota(memoryStore({ [EXPORT_QUOTA_STORAGE_KEY]: "abc" })).remaining()).toBe(3);
    expect(createExportQuota(memoryStore({ [EXPORT_QUOTA_STORAGE_KEY]: "-5" })).remaining()).toBe(3);
    expect(createExportQuota(memoryStore({ [EXPORT_QUOTA_STORAGE_KEY]: "99" })).remaining()).toBe(0);
  });

  it("still limits the session when storage is unavailable or throws", () => {
    for (const store of [
      null,
      {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    ]) {
      const quota = createExportQuota(store);
      quota.record();
      quota.record();
      quota.record();
      expect(quota.remaining()).toBe(0);
    }
  });

  it("picks up exports made in another tab", () => {
    const store = memoryStore();
    const tabA = createExportQuota(store);
    const tabB = createExportQuota(store);
    tabA.record();
    tabA.record();
    expect(tabB.remaining()).toBe(1);
    expect(tabB.record()).toBe(0);
  });
});
