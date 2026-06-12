import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projectCategories, projects } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

/**
 * GET /api/projects/[id]/categories — list category labels for this project.
 * POST — create a reusable category (PM picks it when adding physical units).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin", "logistics"]);
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId } = await params;
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");

    const rows = await db
      .select({
        id: projectCategories.id,
        name: projectCategories.name,
        createdAt: projectCategories.createdAt,
      })
      .from(projectCategories)
      .where(eq(projectCategories.projectId, projectId))
      .orderBy(asc(projectCategories.name));

    return NextResponse.json({ categories: rows });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const { id: projectId } = await params;
    const body = createSchema.parse(await req.json());

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return jsonError(404, "Project not found");

    const dupe = await db.query.projectCategories.findFirst({
      where: and(
        eq(projectCategories.projectId, projectId),
        sql`lower(${projectCategories.name}) = lower(${body.name})`,
      ),
    });
    if (dupe) {
      return jsonError(
        409,
        `A category named "${body.name}" already exists in this project`,
      );
    }

    const [row] = await db
      .insert(projectCategories)
      .values({ projectId, name: body.name.trim() })
      .returning();

    return NextResponse.json({ category: row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
