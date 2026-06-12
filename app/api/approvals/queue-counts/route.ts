import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
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

    const [{ disputesOpen }] = await db
      .select({ disputesOpen: sql<number>`count(*)::int` })
      .from(disputes)
      .where(
        inArray(disputes.status, [
          "open",
          "under_review",
          "awaiting_response",
        ]),
      );

    const nSa = (saNew ?? 0) + (saMeta ?? 0);
    const nLog = (logisticsNew ?? 0) + (logisticsMeta ?? 0);

    return NextResponse.json({
      superAdminProjects: nSa,
      logisticsProjects: nLog,
      /** pending_logistics count — PMs use this to know they must print barcodes. */
      pmPrintQueue: logisticsNew ?? 0,
      /** Open disputes needing triage (badge on Disputes nav). */
      superAdminDisputes: disputesOpen ?? 0,
      breakdown: {
        newPendingSuperAdmin: saNew ?? 0,
        updatesPendingSuperAdmin: saMeta ?? 0,
        newPendingLogistics: logisticsNew ?? 0,
        updatesPendingLogistics: logisticsMeta ?? 0,
        disputesOpen: disputesOpen ?? 0,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
