import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, projectCategories, projects } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

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
