import { describe, it, expect, beforeEach, vi } from "vitest";

const SECRET = "0123456789abcdef0123456789abcdef";
const ALT_SECRET = "ffffffffffffffffffffffffffffffff";

/**
 * Printed-sticker tokens are what make the QR/CODE128 stickers self-
 * authorising — a 3rd-party phone scanner like QR Bot can open the URL
 * directly, no login needed. Getting these tests right is load-bearing:
 * a regression that lets a leaked sticker authorise scans on *other*
 * items would broaden the blast radius of any sticker exposure.
 */
describe("printed-scan token", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.unstubAllEnvs();
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.resetModules();
  });

  it("round-trips a barcode before expiry", async () => {
    const { signPrintedScanToken, verifyPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    const t = signPrintedScanToken("TRT-ABC123DEF456", 60_000);
    const out = verifyPrintedScanToken(t, "TRT-ABC123DEF456");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.barcode).toBe("TRT-ABC123DEF456");
      expect(typeof out.exp).toBe("number");
    }
  });

  it("supports never-expiring tokens (the sticker-friendly default)", async () => {
    const { signPrintedScanToken, verifyPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    const t = signPrintedScanToken("TRT-FOREVER0001");
    const out = verifyPrintedScanToken(t, "TRT-FOREVER0001");
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.exp).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const { signPrintedScanToken, verifyPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const t = signPrintedScanToken("TRT-PAST00000001", 60_000);
      vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
      expect(verifyPrintedScanToken(t, "TRT-PAST00000001")).toEqual({
        ok: false,
        reason: "expired",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects tokens whose signature has been tampered with", async () => {
    const { signPrintedScanToken, verifyPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    const t = signPrintedScanToken("TRT-TAMPER000001", 60_000);
    const tampered = `${t.slice(0, -2)}xx`;
    const out = verifyPrintedScanToken(tampered, "TRT-TAMPER000001");
    expect(out).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects tokens whose body has been swapped to point at another barcode", async () => {
    const { signPrintedScanToken, verifyPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    const t = signPrintedScanToken("TRT-MINE00000001", 60_000);
    // Same valid signature for "MINE", but checked against another barcode
    const out = verifyPrintedScanToken(t, "TRT-OTHER0000001");
    expect(out).toEqual({ ok: false, reason: "wrong_barcode" });
  });

  it("rejects malformed tokens (missing dot)", async () => {
    const { verifyPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    expect(verifyPrintedScanToken("nodothere", "TRT-X")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifyPrintedScanToken("", "TRT-X")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects tokens minted with a different SESSION_SECRET", async () => {
    // Sign with one secret, verify under another — a leaked token from a
    // dev environment must NOT validate against the production secret.
    const { signPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    const t = signPrintedScanToken("TRT-SECRETSWAP01", 60_000);

    vi.stubEnv("SESSION_SECRET", ALT_SECRET);
    vi.resetModules();
    const { verifyPrintedScanToken } = await import(
      "@/lib/printed-scan-token"
    );
    const out = verifyPrintedScanToken(t, "TRT-SECRETSWAP01");
    expect(out).toEqual({ ok: false, reason: "bad_signature" });
  });
});

describe("printedScanTokenTtlMs", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.resetModules();
  });

  it("returns 0 (no expiry) when env is unset", async () => {
    const { printedScanTokenTtlMs } = await import(
      "@/lib/printed-scan-token"
    );
    expect(printedScanTokenTtlMs()).toBe(0);
  });

  it("parses a positive integer value", async () => {
    vi.stubEnv("PRINTED_SCAN_TOKEN_TTL_MS", "86400000");
    vi.resetModules();
    const { printedScanTokenTtlMs } = await import(
      "@/lib/printed-scan-token"
    );
    expect(printedScanTokenTtlMs()).toBe(86_400_000);
  });

  it("treats non-numeric / non-positive values as 'no expiry'", async () => {
    vi.stubEnv("PRINTED_SCAN_TOKEN_TTL_MS", "abc");
    vi.resetModules();
    let mod = await import("@/lib/printed-scan-token");
    expect(mod.printedScanTokenTtlMs()).toBe(0);

    vi.stubEnv("PRINTED_SCAN_TOKEN_TTL_MS", "-5");
    vi.resetModules();
    mod = await import("@/lib/printed-scan-token");
    expect(mod.printedScanTokenTtlMs()).toBe(0);
  });
});
