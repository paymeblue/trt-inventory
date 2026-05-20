import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { disputes, orders, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  disputeOrderScopeProject,
  disputesVisibleWhere,
} from "@/lib/dispute-access";

import { DISPUTE_UPLOAD_REL } from "@/lib/dispute-photo";

const MIME_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bin: "application/octet-stream",
};

async function disputeVisibleToViewer(
  disputeId: string,
  viewerRole: Parameters<typeof disputesVisibleWhere>[0],
  viewerId: string,
): Promise<boolean> {
  const vis = disputesVisibleWhere(viewerRole, viewerId);
  const whereClause = vis
    ? and(eq(disputes.id, disputeId), vis)
    : eq(disputes.id, disputeId);

  const row = await db
    .select({ one: disputes.id })
    .from(disputes)
    .leftJoin(projects, eq(disputes.projectId, projects.id))
    .leftJoin(orders, eq(disputes.orderId, orders.id))
    .leftJoin(
      disputeOrderScopeProject,
      eq(orders.projectId, disputeOrderScopeProject.id),
    )
    .where(whereClause)
    .limit(1);
  return row.length > 0;
}

function extFromStoredName(fname: string): string {
  const m = /\.([^.]+)$/.exec(fname);
  return m?.[1]?.toLowerCase() ?? "bin";
}

/**
 * GET /api/disputes/[id]/photo — serve an uploaded attachment (auth + access).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const ok = await disputeVisibleToViewer(
      id,
      auth.actor.role,
      auth.actor.userId,
    );
    if (!ok) return jsonError(404, "Not found");

    const d = await db.query.disputes.findFirst({
      where: eq(disputes.id, id),
      columns: { photoPath: true },
    });
    if (!d?.photoPath) return jsonError(404, "No photo");

    const safe = d.photoPath.replace(/[/\\]/g, "");
    const abs = join(process.cwd(), DISPUTE_UPLOAD_REL, safe);
    const buf = await readFile(abs).catch(() => null);
    if (!buf) return jsonError(404, "File missing");

    const ext = extFromStoredName(safe);
    const contentType = MIME_EXT[ext] ?? MIME_EXT.bin;
    return new NextResponse(buf, {
      headers: { "content-type": contentType },
    });
  } catch (err) {
    return handleError(err);
  }
}
