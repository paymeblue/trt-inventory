import { describe, expect, it } from "vitest";
import { patchOrderDetailFromScan } from "@/lib/patch-order-detail-from-scan";
import type { Order } from "@/db/schema";

const baseOrder: Order = {
  id: "ord-1",
  projectId: "proj-1",
  status: "active",
  createdBy: "PM",
  createdById: null,
  createdAt: new Date("2026-05-20"),
  completedAt: null,
  fulfilledAt: null,
  isLogisticsGate: false,
};

describe("patchOrderDetailFromScan", () => {
  it("marks item scanned and applies fulfilled order from API", () => {
    const prev = {
      order: baseOrder,
      items: [
        { id: "a", scannedAt: null },
        { id: "b", scannedAt: null },
      ],
      progress: { total: 2, scanned: 0, remaining: 2, percent: 0 },
    };

    const next = patchOrderDetailFromScan(prev, {
      outcome: { result: "valid", itemId: "b" },
      order: {
        ...baseOrder,
        status: "fulfilled",
        fulfilledAt: new Date("2026-05-20T12:00:00Z"),
      },
      progress: { total: 2, scanned: 2, remaining: 0, percent: 100 },
    });

    expect(next?.items.find((i) => i.id === "b")?.scannedAt).toBeTruthy();
    expect(next?.order.status).toBe("fulfilled");
    expect(next?.progress.percent).toBe(100);
  });
});
