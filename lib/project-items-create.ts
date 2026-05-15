import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import {
  formatSkuSequence,
  nextSkuIndexForBase,
  skuBaseFromLabel,
} from "@/lib/sku-from-label";

type DbLike = Pick<typeof db, "insert" | "select">;

/**
 * Insert N distinct `products` rows (stock 1 each), sharing `batchId` and optional `categoryId`.
 * SKUs are sequential under a base derived from `skuLabelSource`. `existingSkusLower` must
 * contain every SKU already used in the project (lowercase).
 */
export async function insertPhysicalUnitsForProject(
  tx: DbLike,
  params: {
    projectId: string;
    userId: string | null;
    quantity: number;
    categoryId: string | null;
    batchId: string;
    /** Used for SKU base + default display name (category title or custom item name). */
    skuLabelSource: string;
    /** Final `name` on each row; if several units, we suffix "· 1 of N" when quantity > 1 only for custom names. */
    displayNameForUnit: (unitIndex: number, total: number) => string;
    existingSkusLower: Set<string>;
  },
): Promise<{ id: string; sku: string; name: string }[]> {
  const base = skuBaseFromLabel(params.skuLabelSource);
  const pool = new Set(params.existingSkusLower);

  const created: { id: string; sku: string; name: string }[] = [];

  for (let unitIndex = 1; unitIndex <= params.quantity; unitIndex++) {
    let idx = nextSkuIndexForBase(base, [...pool]);
    let sku = formatSkuSequence(base, idx);
    while (pool.has(sku.toLowerCase())) {
      idx += 1;
      sku = formatSkuSequence(base, idx);
    }
    pool.add(sku.toLowerCase());

    const name = params.displayNameForUnit(unitIndex, params.quantity);

    const [row] = await tx
      .insert(products)
      .values({
        projectId: params.projectId,
        sku,
        name,
        stockQuantity: 1,
        categoryId: params.categoryId,
        batchId: params.batchId,
      })
      .returning();

    if (!row) throw new Error("Insert failed");
    await tx.insert(stockMovements).values({
      productId: row.id,
      delta: 1,
      reason: "initial",
      userId: params.userId,
    });
    created.push({ id: row.id, sku: row.sku, name: row.name });
  }

  return created;
}

/** Load lowercase SKUs for collision avoidance. */
export async function loadProjectSkuSet(
  tx: DbLike,
  projectId: string,
): Promise<Set<string>> {
  const rows = await tx
    .select({ sku: products.sku })
    .from(products)
    .where(eq(products.projectId, projectId));
  return new Set(rows.map((r) => r.sku.toLowerCase()));
}

export function newBatchId(): string {
  return randomUUID();
}

export { skuBaseFromLabel, formatSkuSequence, nextSkuIndexForBase };
