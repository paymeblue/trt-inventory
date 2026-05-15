import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { disputes, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";
import {
  METADATA_PENDING_LOGISTICS,
  METADATA_PENDING_SUPER_ADMIN,
} from "@/lib/metadata-stages";

/**
 * GET /api/approvals/queue-counts — sidebar badges (distinct **projects**).
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const [{ saNew }] = await db
      .select({ saNew: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.approvalStatus, "pending_super_admin"));

    const [{ logisticsNew }] = await db
      .select({ logisticsNew: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.approvalStatus, "pending_logistics"));

    const [{ saMeta }] = await db
      .select({ saMeta: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.metadataChangeStage, METADATA_PENDING_SUPER_ADMIN));

    const [{ logisticsMeta }] = await db
      .select({ logisticsMeta: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.metadataChangeStage, METADATA_PENDING_LOGISTICS));

    const [{ disputesTotal }] = await db
      .select({ disputesTotal: sql<number>`count(*)::int` })
      .from(disputes);

    const nSa = (saNew ?? 0) + (saMeta ?? 0);
    const nLog = (logisticsNew ?? 0) + (logisticsMeta ?? 0);

    return NextResponse.json({
      superAdminProjects: nSa,
      logisticsProjects: nLog,
      /** All dispute threads (super-admin triage — badge on Disputes nav). */
      superAdminDisputes: disputesTotal ?? 0,
      breakdown: {
        newPendingSuperAdmin: saNew ?? 0,
        updatesPendingSuperAdmin: saMeta ?? 0,
        newPendingLogistics: logisticsNew ?? 0,
        updatesPendingLogistics: logisticsMeta ?? 0,
        disputesTotal: disputesTotal ?? 0,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
