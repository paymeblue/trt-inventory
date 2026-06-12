import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, projectCategories, projects } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { METADATA_PENDING_SUPER_ADMIN } from "@/lib/metadata-stages";
import { projectLivesOnSite } from "@/lib/project-live";
import { mergeProjectPendingPatch } from "@/lib/project-pending-patch";

const renameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

/**
 * PATCH /api/projects/[id]/categories/[categoryId] — rename a category.
 * On live projects the rename queues for super-admin approval (then
 * logistics confirms); otherwise it applies immediately.
 */
export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; categoryId: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId, categoryId } = await params;
    const body = renameSchema.parse(await req.json());
    const name = body.name.trim();

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");

    const category = await db.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.id, categoryId),
        eq(projectCategories.projectId, projectId),
      ),
    });
    if (!category) return jsonError(404, "Category not found");

    if (category.name === name) {
      return jsonError(400, "The category already has that name");
    }

    const clash = await db.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.projectId, projectId),
        sql`lower(${projectCategories.name}) = lower(${name})`,
        ne(projectCategories.id, categoryId),
      ),
    });
    if (clash) {
      return jsonError(
        409,
        `A category named "${name}" already exists in this project`,
      );
    }

    if (projectLivesOnSite(project.approvalStatus)) {
      const merged = mergeProjectPendingPatch(project.pendingPatch, {
        categoryRenames: [
          { categoryId, fromName: category.name, name },
        ],
      });
      const [updated] = await db
        .update(projects)
        .set({
          pendingPatch: merged,
          metadataChangeStage: METADATA_PENDING_SUPER_ADMIN,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();
      return NextResponse.json({
        queuedForApproval: true as const,
        project: updated,
      });
    }

    const [updated] = await db
      .update(projectCategories)
      .set({ name })
      .where(eq(projectCategories.id, categoryId))
      .returning();
    return NextResponse.json({ category: updated });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/projects/[id]/categories/[categoryId] — remove a label only
 * when no product row still references it.
 */
export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ id: string; categoryId: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId, categoryId } = await params;
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");

    const category = await db.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.id, categoryId),
        eq(projectCategories.projectId, projectId),
      ),
    });
    if (!category) return jsonError(404, "Category not found");

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.categoryId, categoryId));

    if ((count ?? 0) > 0) {
      return jsonError(
        409,
        "This category still has items. Reassign or remove those items first.",
      );
    }

    await db
      .delete(projectCategories)
      .where(
        and(
          eq(projectCategories.id, categoryId),
          eq(projectCategories.projectId, projectId),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
