import { describe, expect, it } from "vitest";
import { computeProgress, resolveScan } from "@/lib/scan";
import type { OrderStatus } from "@/db/schema";

type Item = {
  id: string;
  barcode: string;
  scannedAt: Date | null;
};

function item(id: string, barcode: string, scannedAt: Date | null = null): Item {
  return { id, barcode, scannedAt };
}

describe("resolveScan — valid outcomes", () => {
  it("returns valid when the barcode matches an unscanned item", () => {
    const items = [item("1", "TRT-A"), item("2", "TRT-B")];
    const res = resolveScan({ barcode: "TRT-A", items, orderStatus: "active" });
    expect(res.outcome).toEqual({ result: "valid", itemId: "1" });
    expect(res.nextStatus).toBeUndefined();
  });

  it("auto-fulfills the order when the last unscanned item is scanned", () => {
    const items = [
      item("1", "TRT-A", new Date("2024-01-01")),
      item("2", "TRT-B"),
    ];
    const res = resolveScan({ barcode: "TRT-B", items, orderStatus: "active" });
    expect(res.outcome).toEqual({ result: "valid", itemId: "2" });
    expect(res.nextStatus).toBe("fulfilled");
  });

  it("does not fulfill while items remain unscanned", () => {
    const items = [item("1", "TRT-A"), item("2", "TRT-B"), item("3", "TRT-C")];
    const res = resolveScan({ barcode: "TRT-B", items, orderStatus: "active" });
    expect(res.outcome).toEqual({ result: "valid", itemId: "2" });
    expect(res.nextStatus).toBeUndefined();
  });

  it("still flips to fulfilled when the order is currently in anomaly state", () => {
    // Anomaly isn't a dead-end; once the final legit scan lands, the order
    // is genuinely fulfilled.
    const items = [
      item("1", "TRT-A", new Date()),
      item("2", "TRT-B"),
    ];
    const res = resolveScan({
      barcode: "TRT-B",
      items,
      orderStatus: "anomaly",
    });
    expect(res.outcome.result).toBe("valid");
    expect(res.nextStatus).toBe("fulfilled");
  });
});

describe("resolveScan — duplicate outcomes", () => {
  it("returns duplicate when the barcode was already scanned", () => {
    const items = [
      item("1", "TRT-A", new Date("2024-01-01")),
      item("2", "TRT-B"),
    ];
    const res = resolveScan({ barcode: "TRT-A", items, orderStatus: "active" });
    expect(res.outcome).toEqual({ result: "duplicate", itemId: "1" });
    expect(res.nextStatus).toBeUndefined();
  });

  it("duplicate scan never changes the order status", () => {
    const items = [
      item("1", "TRT-A", new Date()),
      item("2", "TRT-B", new Date()),
    ];
    // Even when the order is fulfilled, duplicate must not downgrade it.
    const res = resolveScan({
      barcode: "TRT-A",
      items,
      orderStatus: "fulfilled",
    });
    expect(res.outcome.result).toBe("duplicate");
    expect(res.nextStatus).toBeUndefined();
  });

  it("treats undefined scannedAt the same as null (never yet scanned)", () => {
    // A resilience check: different ORMs/seed paths may produce undefined
    // instead of explicit null.
    const items = [{ id: "1", barcode: "TRT-A", scannedAt: undefined }];
    const res = resolveScan({
      barcode: "TRT-A",
      items: items as unknown as Item[],
      orderStatus: "active",
    });
    expect(res.outcome.result).toBe("valid");
  });
});

describe("resolveScan — invalid outcomes", () => {
  it("flags the order as anomaly when the barcode is not in the order", () => {
    const items = [item("1", "TRT-A"), item("2", "TRT-B")];
    const res = resolveScan({ barcode: "TRT-XXX", items, orderStatus: "active" });
    expect(res.outcome).toEqual({ result: "invalid", barcode: "TRT-XXX" });
    expect(res.nextStatus).toBe("anomaly");
  });

  it("does not flip a fulfilled order back to anomaly on invalid scan", () => {
    const items = [
      item("1", "TRT-A", new Date()),
      item("2", "TRT-B", new Date()),
    ];
    const res = resolveScan({
      barcode: "TRT-XXX",
      items,
      orderStatus: "fulfilled",
    });
    expect(res.outcome.result).toBe("invalid");
    expect(res.nextStatus).toBe("fulfilled");
  });

  it("keeps an already-anomalous order in anomaly on another invalid scan", () => {
    const items = [item("1", "TRT-A")];
    const res = resolveScan({
      barcode: "TRT-ZZZ",
      items,
      orderStatus: "anomaly",
    });
    expect(res.outcome.result).toBe("invalid");
    expect(res.nextStatus).toBe("anomaly");
  });

  it("handles an empty order — any scan is invalid", () => {
    const res = resolveScan({
      barcode: "TRT-A",
      items: [],
      orderStatus: "active",
    });
    expect(res.outcome.result).toBe("invalid");
    // Empty order + invalid scan should still mark as anomaly so PMs notice.
    expect(res.nextStatus).toBe("anomaly");
  });
});

describe("resolveScan — concurrent-scan safety (SELECT FOR UPDATE simulation)", () => {
  it("the second concurrent scan of the same barcode is classified as duplicate", () => {
    const items = [
      { id: "1", barcode: "TRT-A", scannedAt: null as Date | null },
      { id: "2", barcode: "TRT-B", scannedAt: null as Date | null },
    ];

    const first = resolveScan({
      barcode: "TRT-A",
      items,
      orderStatus: "active",
    });
    expect(first.outcome.result).toBe("valid");

    const committed = items.map((it) =>
      it.id === "1" ? { ...it, scannedAt: new Date() } : it,
    );

    const second = resolveScan({
      barcode: "TRT-A",
      items: committed,
      orderStatus: "active",
    });
    expect(second.outcome.result).toBe("duplicate");
    expect(second.nextStatus).toBeUndefined();
  });
});

describe("resolveScan — end-to-end delivery simulations", () => {
  it("simulates a full delivery with a mix of valid / duplicate / invalid scans", () => {
    let items = [item("1", "TRT-A"), item("2", "TRT-B"), item("3", "TRT-C")];
    let status: OrderStatus = "active";

    const scans = ["TRT-A", "TRT-A", "TRT-Z", "TRT-B", "TRT-C"];
    const results: string[] = [];

    for (const barcode of scans) {
      const r = resolveScan({ barcode, items, orderStatus: status });
      results.push(r.outcome.result);
      if (r.outcome.result === "valid") {
        const matchedId = r.outcome.itemId;
        items = items.map((it) =>
          it.id === matchedId ? { ...it, scannedAt: new Date() } : it,
        );
      }
      if (r.nextStatus) status = r.nextStatus;
    }

    expect(results).toEqual([
      "valid",
      "duplicate",
      "invalid",
      "valid",
      "valid",
    ]);
    expect(status).toBe("fulfilled");
    expect(items.every((i) => i.scannedAt)).toBe(true);
  });

  it("simulates an anomaly-then-recovery flow: invalid scan first, then all valid", () => {
    let items = [item("1", "TRT-A"), item("2", "TRT-B")];
    let status: OrderStatus = "active";

    const scans = [
      "TRT-BOGUS", // invalid -> anomaly
      "TRT-A", // valid
      "TRT-B", // valid -> fulfilled (from anomaly)
    ];
    const transitions: OrderStatus[] = [status];

    for (const barcode of scans) {
      const r = resolveScan({ barcode, items, orderStatus: status });
      const outcome = r.outcome;
      if (outcome.result === "valid") {
        const matchedId = outcome.itemId;
        items = items.map((it) =>
          it.id === matchedId ? { ...it, scannedAt: new Date() } : it,
        );
      }
      if (r.nextStatus) status = r.nextStatus;
      transitions.push(status);
    }

    expect(transitions).toEqual(["active", "anomaly", "anomaly", "fulfilled"]);
    expect(items.every((i) => i.scannedAt)).toBe(true);
  });

  it("a fulfilled order that receives a stray scan stays fulfilled", () => {
    let items = [item("1", "TRT-A", new Date())];
    let status: OrderStatus = "fulfilled";

    for (const barcode of ["TRT-A", "TRT-Z", "TRT-A"]) {
      const r = resolveScan({ barcode, items, orderStatus: status });
      const outcome = r.outcome;
      if (outcome.result === "valid") {
        const matchedId = outcome.itemId;
        items = items.map((it) =>
          it.id === matchedId ? { ...it, scannedAt: new Date() } : it,
        );
      }
      if (r.nextStatus) status = r.nextStatus;
    }

    expect(status).toBe("fulfilled");
  });

  it("large order (50 items) fulfils exactly on the final scan", () => {
    let items = Array.from({ length: 50 }, (_, i) =>
      item(`${i}`, `TRT-${String(i).padStart(12, "0")}`),
    );
    let status: OrderStatus = "active";

    for (let i = 0; i < items.length; i++) {
      const barcode = items[i].barcode;
      const r = resolveScan({ barcode, items, orderStatus: status });
      const outcome = r.outcome;
      expect(outcome.result).toBe("valid");
      if (outcome.result === "valid") {
        const matchedId = outcome.itemId;
        items = items.map((it) =>
          it.id === matchedId ? { ...it, scannedAt: new Date() } : it,
        );
      }
      if (r.nextStatus) status = r.nextStatus;

      // Status must only flip on the very last scan.
      if (i < items.length - 1) {
        expect(status).toBe("active");
      } else {
        expect(status).toBe("fulfilled");
      }
    }
  });
});

describe("computeProgress", () => {
  it("reports 0% when no items exist", () => {
    expect(computeProgress([])).toEqual({
      total: 0,
      scanned: 0,
      remaining: 0,
      percent: 0,
    });
  });

  it("reports ratios correctly", () => {
    expect(
      computeProgress([
        { scannedAt: new Date() },
        { scannedAt: new Date() },
        { scannedAt: null },
        { scannedAt: null },
      ]),
    ).toEqual({ total: 4, scanned: 2, remaining: 2, percent: 50 });
  });

  it("reports 100% when every item has been scanned", () => {
    expect(
      computeProgress([{ scannedAt: new Date() }, { scannedAt: new Date() }]),
    ).toEqual({ total: 2, scanned: 2, remaining: 0, percent: 100 });
  });

  it("rounds to whole percentages", () => {
    // 1/3 -> 33, 2/3 -> 67
    expect(
      computeProgress([
        { scannedAt: new Date() },
        { scannedAt: null },
        { scannedAt: null },
      ]).percent,
    ).toBe(33);
    expect(
      computeProgress([
        { scannedAt: new Date() },
        { scannedAt: new Date() },
        { scannedAt: null },
      ]).percent,
    ).toBe(67);
  });

  it("treats undefined scannedAt as unscanned too", () => {
    expect(
      computeProgress([
        { scannedAt: undefined as unknown as null },
        { scannedAt: new Date() },
      ]),
    ).toEqual({ total: 2, scanned: 1, remaining: 1, percent: 50 });
  });
});
