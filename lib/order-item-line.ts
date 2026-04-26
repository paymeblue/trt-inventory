import { db } from "@/db";
import type { OrderItem } from "@/db/schema";
import { orderItems } from "@/db/schema";
import { generateBarcode } from "@/lib/barcode";

/** Same shape as `db` or a Drizzle transaction client — both expose `.insert`. */
export type OrderItemInserter = { insert: typeof db.insert };

/**
 * Inserts one `order_items` row with a fresh barcode, retrying on the rare
 * global barcode collision. Shared by POST /api/orders (bulk seed) and
 * POST /api/orders/[id]/items (single add).
 */
export async function insertOrderItemLine(
  dbLike: OrderItemInserter,
  orderId: string,
  productSku: string,
): Promise<OrderItem[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const barcode = generateBarcode();
    try {
      return await dbLike
        .insert(orderItems)
        .values({ orderId, productId: productSku, barcode })
        .returning();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("order_items_barcode_unique")) continue;
      throw err;
    }
  }
  throw new Error("Failed to generate a unique barcode");
}
