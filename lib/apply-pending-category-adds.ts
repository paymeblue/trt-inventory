import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectCategories } from "@/db/schema";
import {
  insertPhysicalUnitsForProject,
  loadProjectSkuSet,
  newBatchId,
} from "@/lib/project-items-create";
import type {
  PendingCategoryAdd,
  PendingCategoryRename,
} from "@/lib/project-pending-patch";

type DbTx = Pick<typeof db, "insert" | "select" | "query">;
type DbTxWithUpdate = DbTx & Pick<typeof db, "update">;

/**
 * Creates categories (if missing) and physical unit rows for queued PM edits.
 */
export async function applyPendingCategoryAdds(
  tx: DbTx,
  params: {
    projectId: string;
    userId: string | null;
    adds: PendingCategoryAdd[];
  },
) {
  for (const add of params.adds) {
    const name = add.name.trim();
    if (!name) continue;

    let cat = await tx.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.projectId, params.projectId),
        sql`lower(${projectCategories.name}) = lower(${name})`,
      ),
    });

    if (!cat) {
      const [row] = await tx
        .insert(projectCategories)
        .values({ projectId: params.projectId, name })
        .returning();
      cat = row!;
    }

    const pool = await loadProjectSkuSet(tx, params.projectId);
    await insertPhysicalUnitsForProject(tx, {
      projectId: params.projectId,
      userId: params.userId,
      quantity: add.quantity,
      categoryId: cat.id,
      batchId: newBatchId(),
      skuLabelSource: cat.name,
      displayNameForUnit: () => cat.name,
      existingSkusLower: pool,
    });
  }
}

/**
 * Applies queued PM category renames once super-admin and logistics have
 * both cleared the change. Skips silently when the category was deleted
 * in the meantime or the new name now clashes — the rest of the patch
 * still applies.
 */
export async function applyPendingCategoryRenames(
  tx: DbTxWithUpdate,
  params: {
    projectId: string;
    renames: PendingCategoryRename[];
  },
) {
  for (const rename of params.renames) {
    const name = rename.name.trim();
    if (!name) continue;

    const cat = await tx.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.id, rename.categoryId),
        eq(projectCategories.projectId, params.projectId),
      ),
    });
    if (!cat) continue;

    const clash = await tx.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.projectId, params.projectId),
        sql`lower(${projectCategories.name}) = lower(${name})`,
      ),
    });
    if (clash && clash.id !== cat.id) continue;

    await tx
      .update(projectCategories)
      .set({ name })
      .where(eq(projectCategories.id, cat.id));
  }
}
