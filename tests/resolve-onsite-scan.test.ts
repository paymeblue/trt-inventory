import { describe, expect, it } from "vitest";
import type { BarcodeLookupRow } from "@/lib/resolve-onsite-scan";

/** Documents gate-sticker → delivery-line routing (see resolveOnSiteScanTarget). */
describe("on-site scan routing", () => {
  it("prefers delivery order row over gate when both share lookup", () => {
    const rows: BarcodeLookupRow[] = [
      {
        itemId: "gate-1",
        itemBarcode: "TRT-GATE",
        itemScannedAt: null,
        orderId: "gate-order",
        orderStatus: "active",
        orderIsLogisticsGate: true,
        productId: "SKU-1",
        projectId: "proj",
        projectName: "Demo",
        projectApprovalStatus: "active",
      },
      {
        itemId: "del-1",
        itemBarcode: "TRT-DEL",
        itemScannedAt: null,
        orderId: "del-order",
        orderStatus: "active",
        orderIsLogisticsGate: false,
        productId: "SKU-1",
        projectId: "proj",
        projectName: "Demo",
        projectApprovalStatus: "active",
      },
    ];
    const deliveryHit = rows.find((r) => !r.orderIsLogisticsGate);
    expect(deliveryHit?.orderId).toBe("del-order");
  });
});
