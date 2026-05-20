import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { loadDisputeBundle } from "@/lib/dispute-bundle";
import {
  buildDisputeDocx,
  buildDisputePdf,
  disputeExportFilename,
} from "@/lib/dispute-export";

/**
 * GET /api/disputes/[id]/export?format=pdf|docx
 * Evidence export for dispute resolution records.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "pdf";
    if (format !== "pdf" && format !== "docx") {
      return jsonError(400, "format must be pdf or docx");
    }

    const bundle = await loadDisputeBundle(id, {
      userId: auth.actor.userId,
      role: auth.actor.role,
      name: auth.actor.name,
    });
    if (!bundle) return jsonError(404, "Dispute not found");

    const filename = disputeExportFilename(id, format);
    if (format === "docx") {
      const buf = await buildDisputeDocx(bundle);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buf = await buildDisputePdf(bundle);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
