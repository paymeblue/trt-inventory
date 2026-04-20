import { describe, expect, it } from "vitest";
import { extractScanDeepLink } from "@/lib/scan-deep-link";

/**
 * These tests cover the logic that decides whether a scanned payload is a
 * deep-link (open URL → auto-complete) or a plain barcode (send to the
 * order's manual /scan API). Getting this right is load-bearing: a
 * mis-classification either breaks existing USB scanners or skips the
 * auto-complete happy path that the QR stickers enable.
 */
describe("extractScanDeepLink", () => {
  it("returns the path for an absolute https URL", () => {
    expect(extractScanDeepLink("https://app.example.com/s/TRT-ABC")).toBe(
      "/s/TRT-ABC",
    );
  });

  it("returns the path for an absolute http URL", () => {
    expect(extractScanDeepLink("http://localhost:3000/s/TRT-XYZ")).toBe(
      "/s/TRT-XYZ",
    );
  });

  it("preserves the query string so future deep links can carry context", () => {
    expect(
      extractScanDeepLink("https://app.example.com/s/TRT-ABC?ref=sticker"),
    ).toBe("/s/TRT-ABC?ref=sticker");
  });

  it("accepts relative /s/<barcode> paths too", () => {
    expect(extractScanDeepLink("/s/TRT-REL")).toBe("/s/TRT-REL");
  });

  it("returns null for a bare barcode string (USB scanner path)", () => {
    expect(extractScanDeepLink("TRT-ABC123DEF456")).toBeNull();
  });

  it("returns null for an unrelated URL (e.g. another site's QR)", () => {
    expect(extractScanDeepLink("https://evil.example.com/x")).toBeNull();
  });

  it("returns null for empty / whitespace payloads", () => {
    expect(extractScanDeepLink("")).toBeNull();
    expect(extractScanDeepLink("   ")).toBeNull();
  });

  it("trims leading/trailing whitespace before classifying", () => {
    expect(extractScanDeepLink("  https://app.example.com/s/TRT-A  ")).toBe(
      "/s/TRT-A",
    );
    expect(extractScanDeepLink("  TRT-BARE  ")).toBeNull();
  });

  it("does not confuse /s paths with /settings or /search", () => {
    expect(extractScanDeepLink("https://app.example.com/settings")).toBeNull();
    expect(extractScanDeepLink("https://app.example.com/search/s/foo")).toBeNull();
    expect(extractScanDeepLink("/settings")).toBeNull();
  });

  it("ignores URLs with different prefix even if they contain /s/", () => {
    expect(
      extractScanDeepLink("https://app.example.com/x/s/TRT-ABC"),
    ).toBeNull();
  });
});
