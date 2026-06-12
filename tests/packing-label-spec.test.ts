import { describe, expect, it } from "vitest";
import { mapOrderItemsToPackingLabels } from "@/lib/packing-label-items";
import { canPrintPackingLabels } from "@/lib/packing-label-access";
import { PACKING_LABEL } from "@/lib/packing-label-spec";

describe("PACKING_LABEL", () => {
  it("matches Xprinter XP-365B 1.5×1 in stock", () => {
    expect(PACKING_LABEL.widthIn).toBe(1.5);
    expect(PACKING_LABEL.heightIn).toBe(1);
    expect(PACKING_LABEL.printerModel).toContain("XP-365B");
    expect(PACKING_LABEL.css.width).toBe("1.5in");
    expect(PACKING_LABEL.css.height).toBe("1in");
  });
});

describe("packing label access", () => {
  it("allows only pm and super_admin to print — stickers are hidden from logistics and receivers", () => {
    expect(canPrintPackingLabels("pm")).toBe(true);
    expect(canPrintPackingLabels("super_admin")).toBe(true);
    expect(canPrintPackingLabels("logistics")).toBe(false);
    expect(canPrintPackingLabels("installer")).toBe(false);
  });
});

describe("mapOrderItemsToPackingLabels", () => {
  it("maps lines with product names from catalog", () => {
    const items = mapOrderItemsToPackingLabels(
      [
        {
          barcode: "TRT-A",
          productId: "na-il-001",
          printedScanToken: "tok",
        },
      ],
      new Map([["na-il-001", { sku: "na-il-001", name: "Network item" }]]),
    );

    expect(items).toEqual([
      {
        barcode: "TRT-A",
        productId: "na-il-001",
        productName: "Network item",
        printedScanToken: "tok",
      },
    ]);
  });
});
