import { describe, expect, it } from "vitest";
import {
  classifyNetworkError,
  classifyScanResponse,
} from "@/lib/scan-client";
import { resolveScan } from "@/lib/scan";

describe("classifyScanResponse", () => {
  it("returns outcome when response is ok", () => {
    const r = classifyScanResponse(
      { ok: true, status: 200 },
      { outcome: { result: "valid", itemId: "abc" }, stock: { sku: "SKU", stockQuantity: 9 } },
    );
    expect(r.kind).toBe("outcome");
    if (r.kind === "outcome") {
      expect(r.outcome).toEqual({ result: "valid", itemId: "abc" });
      expect(r.stock).toEqual({ sku: "SKU", stockQuantity: 9 });
    }
  });

  it("maps 401 to auth", () => {
    const r = classifyScanResponse(
      { ok: false, status: 401 },
      { error: "Not signed in" },
    );
    expect(r.kind).toBe("auth");
    if (r.kind === "auth") expect(r.message).toBe("Not signed in");
  });

  it("maps 403 to auth as well", () => {
    const r = classifyScanResponse({ ok: false, status: 403 }, { error: "forbidden" });
    expect(r.kind).toBe("auth");
  });

  it("maps 404 to conflict (order gone)", () => {
    const r = classifyScanResponse(
      { ok: false, status: 404 },
      { error: "Order not found" },
    );
    expect(r.kind).toBe("conflict");
  });

  it("maps 409 to conflict (SKU missing in warehouse)", () => {
    const r = classifyScanResponse(
      { ok: false, status: 409 },
      { error: "SKU missing" },
    );
    expect(r.kind).toBe("conflict");
  });

  it("maps 500 to server error", () => {
    const r = classifyScanResponse(
      { ok: false, status: 500 },
      { error: "boom" },
    );
    expect(r.kind).toBe("server");
    if (r.kind === "server") {
      expect(r.status).toBe(500);
      expect(r.message).toBe("boom");
    }
  });

  it("falls back to a sensible message when the server omits one", () => {
    const r = classifyScanResponse({ ok: false, status: 502 }, {});
    expect(r.kind).toBe("server");
    if (r.kind === "server") expect(r.message).toMatch(/502/);
  });

  it("never returns 'outcome' for non-2xx responses (no silent invalid)", () => {
    // A regression against the old behavior where any non-ok response was
    // rendered as an invalid-barcode red card — which lied about what happened.
    for (const status of [400, 401, 403, 404, 409, 500, 502, 503]) {
      const r = classifyScanResponse(
        { ok: false, status },
        { error: "x" },
      );
      expect(r.kind).not.toBe("outcome");
    }
  });
});

describe("classifyNetworkError", () => {
  it("wraps an Error instance", () => {
    const r = classifyNetworkError(new TypeError("Failed to fetch"));
    expect(r.kind).toBe("network");
    if (r.kind === "network") expect(r.message).toBe("Failed to fetch");
  });

  it("handles non-Error throws", () => {
    const r = classifyNetworkError("weird");
    expect(r.kind).toBe("network");
    if (r.kind === "network") expect(r.message).toBe("Network request failed");
  });
});

describe("resolveScan — concurrent-scan safety", () => {
  // Simulates what happens if two scan transactions read the same snapshot of
  // items (the FOR UPDATE lock we added on the server is what actually
  // prevents this in practice, but the resolver has to stay idempotent for
  // duplicates too).
  it("the second concurrent scan of the same barcode is classified as duplicate", () => {
    const items = [
      { id: "1", barcode: "TRT-A", scannedAt: null as Date | null },
      { id: "2", barcode: "TRT-B", scannedAt: null as Date | null },
    ];

    // First scan wins.
    const first = resolveScan({
      barcode: "TRT-A",
      items,
      orderStatus: "active",
    });
    expect(first.outcome.result).toBe("valid");

    // Apply the commit of the first transaction before the second one reads.
    // (This is what SELECT ... FOR UPDATE forces at the DB layer.)
    const nowItems = items.map((it) =>
      it.id === "1" ? { ...it, scannedAt: new Date() } : it,
    );

    const second = resolveScan({
      barcode: "TRT-A",
      items: nowItems,
      orderStatus: "active",
    });
    expect(second.outcome.result).toBe("duplicate");
    expect(second.nextStatus).toBeUndefined();
  });
});
