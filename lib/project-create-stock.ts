/**
 * When a project is created with line items, each inserted product row must
 * be paired back to the request line (by SKU, case-insensitive) so initial
 * stock movements match the intended quantities even if the DB reorders
 * `RETURNING` rows.
 */
export type InsertedProductRow = { id: string; sku: string };
export type RequestedLine = { sku: string; stockQuantity: number };

export function buildInitialStockMovementInserts(
  insertedRows: InsertedProductRow[],
  requestedLines: RequestedLine[],
  userId: string,
): { productId: string; delta: number; reason: "initial"; userId: string }[] {
  return insertedRows
    .map((row) => {
      const src = requestedLines.find(
        (i) => i.sku.trim().toLowerCase() === row.sku.trim().toLowerCase(),
      );
      const qty = src?.stockQuantity ?? 0;
      return qty > 0
        ? {
            productId: row.id,
            delta: qty,
            reason: "initial" as const,
            userId,
          }
        : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
}
