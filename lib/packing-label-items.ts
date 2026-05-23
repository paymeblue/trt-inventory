import type { PackingLabelItem } from "@/lib/packing-label-spec";

type OrderLine = {
  barcode: string;
  productId: string;
  printedScanToken?: string;
  productName?: string | null;
};

type ProductLike = { sku: string; name: string };

/** One packing label row per order line — same shape everywhere we print. */
export function mapOrderItemsToPackingLabels(
  items: OrderLine[],
  productBySku?: Map<string, ProductLike>,
): PackingLabelItem[] {
  return items.map((item) => ({
    barcode: item.barcode,
    productId: item.productId,
    productName:
      item.productName ??
      productBySku?.get(item.productId)?.name ??
      null,
    printedScanToken: item.printedScanToken,
  }));
}
