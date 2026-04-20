import { describe, expect, it } from "vitest";
import { buildScanUrl } from "@/lib/scan-url";

/**
 * Verifies the QR URL builder. Getting this right is critical: every item
 * sticker encodes the output of `buildScanUrl`, so a regression that
 * ships the wrong origin or mangles the barcode breaks every printed
 * label in circulation.
 */
describe("buildScanUrl", () => {
  it("prefers envOrigin over windowOrigin", () => {
    expect(
      buildScanUrl("TRT-ABC", {
        envOrigin: "https://app.example.com",
        windowOrigin: "http://localhost:3000",
      }),
    ).toBe("https://app.example.com/s/TRT-ABC");
  });

  it("falls back to windowOrigin when envOrigin is absent", () => {
    expect(
      buildScanUrl("TRT-XYZ", {
        envOrigin: undefined,
        windowOrigin: "https://trt.app",
      }),
    ).toBe("https://trt.app/s/TRT-XYZ");
  });

  it("strips a single trailing slash on envOrigin", () => {
    expect(
      buildScanUrl("TRT-ABC", { envOrigin: "https://app.example.com/" }),
    ).toBe("https://app.example.com/s/TRT-ABC");
  });

  it("strips multiple trailing slashes", () => {
    expect(
      buildScanUrl("TRT-ABC", { envOrigin: "https://app.example.com///" }),
    ).toBe("https://app.example.com/s/TRT-ABC");
  });

  it("returns a bare relative path when no origin is supplied", () => {
    expect(buildScanUrl("TRT-ABC")).toBe("/s/TRT-ABC");
    expect(
      buildScanUrl("TRT-ABC", { envOrigin: "", windowOrigin: "" }),
    ).toBe("/s/TRT-ABC");
    expect(
      buildScanUrl("TRT-ABC", { envOrigin: null, windowOrigin: null }),
    ).toBe("/s/TRT-ABC");
  });

  it("percent-encodes characters that are unsafe in a URL path", () => {
    // CODE128 barcodes are alphanumeric + dashes in this app, but the
    // helper must still encode defensively so that if a rogue barcode
    // slips through it doesn't break the URL structure.
    expect(
      buildScanUrl("A B/C?D", { envOrigin: "https://a.io" }),
    ).toBe("https://a.io/s/A%20B%2FC%3FD");
  });

  it("treats whitespace-only origins as absent", () => {
    expect(
      buildScanUrl("TRT-ABC", { envOrigin: "   ", windowOrigin: "  " }),
    ).toBe("/s/TRT-ABC");
  });
});
