import { describe, expect, it } from "vitest";
import { DPI } from "@/lib/packing/rectPacker";
import { describePdfError, isPdf, MAX_PAGE_PIXELS, pageAssetName, pageRenderDpi } from "@/lib/pdf";

const pt = (inches: number) => inches * 72;

describe("pageRenderDpi", () => {
  it("renders normal pages at 300 DPI", () => {
    expect(pageRenderDpi(pt(8.5), pt(11))).toBe(DPI);
    expect(pageRenderDpi(pt(2), pt(3))).toBe(DPI);
    expect(pageRenderDpi(pt(12), pt(24))).toBe(DPI); // largest sheet preset: 25.9 MP
  });

  it("lowers DPI for huge pages so they stay under the pixel cap", () => {
    const dpi = pageRenderDpi(pt(24), pt(36)); // 24x36 poster would be 77.8 MP at 300 DPI
    expect(dpi).toBeLessThan(DPI);
    expect(24 * dpi * 36 * dpi).toBeLessThanOrEqual(MAX_PAGE_PIXELS);
    expect(24 * (dpi + 1) * 36 * (dpi + 1)).toBeGreaterThan(MAX_PAGE_PIXELS); // as high as allowed
  });
});

describe("pageAssetName", () => {
  it("uses the plain file name for single-page PDFs", () => {
    expect(pageAssetName("logo.pdf", 1, 1)).toBe("logo.pdf");
  });

  it("numbers pages of multi-page PDFs", () => {
    expect(pageAssetName("stickers.pdf", 2, 5)).toBe("stickers.pdf — page 2 of 5");
  });
});

describe("isPdf", () => {
  it("accepts PDFs by MIME type or extension", () => {
    expect(isPdf(new File([], "a.pdf", { type: "application/pdf" }))).toBe(true);
    expect(isPdf(new File([], "A.PDF"))).toBe(true); // some OSes send no MIME type on drop
    expect(isPdf(new File([], "a.png", { type: "image/png" }))).toBe(false);
  });
});

describe("describePdfError", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("explains password-protected and corrupt files", () => {
    expect(describePdfError("a.pdf", named("PasswordException"))).toBe("a.pdf is password-protected.");
    expect(describePdfError("a.pdf", named("InvalidPDFException"))).toBe("a.pdf isn't a valid PDF.");
  });

  it("falls back to a generic message", () => {
    expect(describePdfError("a.pdf", new Error("boom"))).toBe("Couldn't read a.pdf.");
    expect(describePdfError("a.pdf", "weird")).toBe("Couldn't read a.pdf.");
  });
});
