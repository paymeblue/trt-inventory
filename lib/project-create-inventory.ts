import { and, eq, sql } from "drizzle-orm";
import { projectCategories } from "@/db/schema";
import type { CreateProjectBody } from "@/lib/project-validation";
import {
  insertPhysicalUnitsForProject,
  loadProjectSkuSet,
  newBatchId,
} from "@/lib/project-items-create";

type DbTx = Pick<typeof import("@/db").db, "insert" | "select" | "query">;

/**
 * Inserts category definitions and inventory lines from the create-project payload.
 */
export async function applyCreateProjectInventory(
  tx: DbTx,
  params: {
    projectId: string;
    userId: string | null;
    body: Pick<
      CreateProjectBody,
      "categoryDefinitions" | "inventory" | "categories"
    >;
  },
) {
  const catIdByLocal = new Map<string, string>();

  for (const def of params.body.categoryDefinitions) {
    const name = def.name.trim();
    let row = await tx.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.projectId, params.projectId),
        sql`lower(${projectCategories.name}) = lower(${name})`,
      ),
    });
    if (!row) {
      const [inserted] = await tx
        .insert(projectCategories)
        .values({ projectId: params.projectId, name })
        .returning();
      row = inserted!;
    }
    catIdByLocal.set(def.localId, row.id);
  }

  /** Legacy shorthand: categories[] with name + quantity */
  for (const leg of params.body.categories) {
    const name = leg.name.trim();
    let row = await tx.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.projectId, params.projectId),
        sql`lower(${projectCategories.name}) = lower(${name})`,
      ),
    });
    if (!row) {
      const [inserted] = await tx
        .insert(projectCategories)
        .values({ projectId: params.projectId, name })
        .returning();
      row = inserted!;
    }
    let pool = await loadProjectSkuSet(tx, params.projectId);
    await insertPhysicalUnitsForProject(tx, {
      projectId: params.projectId,
      userId: params.userId,
      quantity: leg.quantity,
      categoryId: row.id,
      batchId: newBatchId(),
      skuLabelSource: row.name,
      displayNameForUnit: () => row!.name,
      existingSkusLower: pool,
    });
    pool = await loadProjectSkuSet(tx, params.projectId);
  }

  let pool = await loadProjectSkuSet(tx, params.projectId);

  for (const line of params.body.inventory) {
    if (line.kind === "category") {
      const catId = catIdByLocal.get(line.categoryLocalId);
      if (!catId) {
        throw new Error(
          "Inventory references a category that was not defined in this request",
        );
      }
      const cat = await tx.query.projectCategories.findFirst({
        where: eq(projectCategories.id, catId),
      });
      if (!cat) throw new Error("Category not found");
      await insertPhysicalUnitsForProject(tx, {
        projectId: params.projectId,
        userId: params.userId,
        quantity: line.quantity,
        categoryId: cat.id,
        batchId: newBatchId(),
        skuLabelSource: cat.name,
        displayNameForUnit: () => cat.name,
        existingSkusLower: pool,
      });
    } else {
      await insertPhysicalUnitsForProject(tx, {
        projectId: params.projectId,
        userId: params.userId,
        quantity: line.quantity,
        categoryId: null,
        batchId: newBatchId(),
        skuLabelSource: line.name,
        displayNameForUnit: (i, total) =>
          total > 1 ? `${line.name} · ${i} of ${total}` : line.name,
        existingSkusLower: pool,
      });
    }
    pool = await loadProjectSkuSet(tx, params.projectId);
  }
}
