import { describe, expect, it } from "vitest";
import { computeProgress, resolveScan } from "@/lib/scan";

/**
 * Lightweight stress / throughput checks on the hot path logic (no DB).
 * For database contention and locking behaviour, run a load tool against
 * `/api/orders/:id/scan` with a real Postgres instance.
 */
describe("scan hot-path throughput (in-memory)", () => {
  it("handles many sequential resolveScan + computeProgress cycles quickly", () => {
    const n = 25_000;
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      barcode: `B${i}`,
      scannedAt: null as Date | null,
    }));

    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const barcode = `B${k % 20}`;
      resolveScan({
        barcode,
        items,
        orderStatus: "active",
      });
      computeProgress(items);
    }
    const ms = performance.now() - t0;

    expect(ms).toBeLessThan(2000);
  });

  it("handles burst of parallel in-memory scans without throwing", async () => {
    const batches = 200;
    const perBatch = 50;

    await Promise.all(
      Array.from({ length: batches }, (_, b) =>
        Promise.all(
          Array.from({ length: perBatch }, (_, i) => {
            const items = [
              {
                id: "a",
                barcode: "X",
                scannedAt: null as Date | null,
              },
              {
                id: "b",
                barcode: "Y",
                scannedAt: null as Date | null,
              },
            ];
            return resolveScan({
              barcode: i % 2 === 0 ? "X" : "Y",
              items,
              orderStatus: "active",
            });
          }),
        ),
      ),
    );
  });

  it("simulates full order fulfilment scan-by-scan", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`,
      barcode: `bc-${i}`,
      scannedAt: null as Date | null,
    }));

    for (let i = 0; i < items.length; i++) {
      const { outcome, nextStatus } = resolveScan({
        barcode: items[i].barcode,
        items,
        orderStatus: "active",
      });
      expect(outcome.result).toBe("valid");
      items[i].scannedAt = new Date();
      if (i < items.length - 1) {
        expect(nextStatus).toBeUndefined();
      } else {
        expect(nextStatus).toBe("fulfilled");
      }
    }

    expect(computeProgress(items).percent).toBe(100);
  });
});
