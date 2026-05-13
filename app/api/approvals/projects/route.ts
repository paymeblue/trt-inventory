import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";

/**
 * GET /api/approvals/projects?queue=super_admin|logistics
 * Lightweight queues for approval dashboards (React Query + invalidate).
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("queue");
    if (q === "super_admin") {
      const auth = await requireUserAny(["super_admin"]);
      if ("error" in auth) return auth.error;
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          approvalStatus: projects.approvalStatus,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .where(eq(projects.approvalStatus, "pending_super_admin"))
        .orderBy(asc(projects.createdAt));
      return NextResponse.json({ projects: rows });
    }
    if (q === "logistics") {
      const auth = await requireUserAny(["logistics"]);
      if ("error" in auth) return auth.error;
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          approvalStatus: projects.approvalStatus,
          projectBarcode: projects.projectBarcode,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .where(eq(projects.approvalStatus, "pending_logistics"))
        .orderBy(asc(projects.createdAt));
      return NextResponse.json({ projects: rows });
    }
    const auth = await requireUserAny(["super_admin", "logistics"]);
    if ("error" in auth) return auth.error;
    return NextResponse.json(
      { error: "Set ?queue=super_admin or ?queue=logistics" },
      { status: 400 },
    );
  } catch (err) {
    return handleError(err);
  }
}
