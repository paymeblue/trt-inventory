import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { disputes, orders, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import {
  disputeOrderScopeProject,
  disputesVisibleWhere,
} from "@/lib/dispute-access";

const DISPUTE_UPLOAD_REL = ".data/dispute-photos";

const createJsonSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(8000),
    projectId: z.string().uuid().nullable().optional(),
    orderId: z.string().uuid().nullable().optional(),
  })
  .refine((x) => Boolean(x.projectId) || Boolean(x.orderId), {
    message: "Link at least a project or an order",
    path: ["projectId"],
  });

async function enforceContextConsistency(
  projectId: string | null,
  orderId: string | null,
) {
  if (!orderId) return;
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { projectId: true },
  });
  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }
  if (projectId && order.projectId !== projectId) {
    throw new Error("ORDER_PROJECT_MISMATCH");
  }
}

/**
 * GET /api/disputes — threads visible to the signed-in user.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const vis = disputesVisibleWhere(auth.actor.role, auth.actor.userId);
    const base = db
      .select({
        id: disputes.id,
        title: disputes.title,
        description: disputes.description,
        photoPath: disputes.photoPath,
        projectId: disputes.projectId,
        orderId: disputes.orderId,
        createdAt: disputes.createdAt,
        createdById: disputes.createdById,
        creatorName: users.name,
      })
      .from(disputes)
      .leftJoin(users, eq(disputes.createdById, users.id))
      .leftJoin(projects, eq(disputes.projectId, projects.id))
      .leftJoin(orders, eq(disputes.orderId, orders.id))
      .leftJoin(
        disputeOrderScopeProject,
        eq(orders.projectId, disputeOrderScopeProject.id),
      )
      .orderBy(desc(disputes.createdAt));

    const rows = vis ? await base.where(vis) : await base;
    return NextResponse.json({ disputes: rows });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/disputes — JSON or multipart (optional `photo` file field).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const ct = req.headers.get("content-type") ?? "";
    let title: string;
    let description: string;
    let projectId: string | null = null;
    let orderId: string | null = null;
    let photoFile: File | null = null;

    if (ct.includes("multipart/form-data")) {
      const raw = await req.formData();
      const formData = raw as unknown as {
        get(name: string): unknown;
      };
      title = String(formData.get("title") ?? "").trim();
      description = String(formData.get("description") ?? "").trim();
      const p = formData.get("projectId");
      const o = formData.get("orderId");
      projectId = typeof p === "string" && p ? p : null;
      orderId = typeof o === "string" && o ? o : null;
      const f = formData.get("photo");
      photoFile =
        typeof File !== "undefined" && f instanceof File && f.size > 0
          ? f
          : null;
    } else {
      const body = createJsonSchema.parse(await req.json());
      title = body.title;
      description = body.description;
      projectId = body.projectId ?? null;
      orderId = body.orderId ?? null;
    }

    if (!title || !description) {
      return jsonError(400, "Title and description are required");
    }
    if (!projectId && !orderId) {
      return jsonError(400, "Link at least a project or an order");
    }

    if (orderId && !z.string().uuid().safeParse(orderId).success) {
      return jsonError(
        400,
        "That order identifier is not a valid UUID — pick one from the order picker in the form.",
      );
    }

    if (projectId) {
      const p = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      if (!p) return jsonError(400, "Project not found");
    }

    try {
      await enforceContextConsistency(projectId, orderId);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "ORDER_NOT_FOUND") {
        return jsonError(
          400,
          "No order exists with that ID, or your account can't see it. Pick an order from the list.",
        );
      }
      if (msg === "ORDER_PROJECT_MISMATCH") {
        return jsonError(
          400,
          "Order does not belong to the selected project",
        );
      }
      throw e;
    }

    let photoPath: string | null = null;
    if (photoFile && photoFile.size > 2_500_000) {
      return jsonError(400, "Photo must be under 2.5 MB");
    }

    const [created] = await db
      .insert(disputes)
      .values({
        title,
        description,
        createdById: auth.actor.userId,
        projectId,
        orderId,
        photoPath,
      })
      .returning();

    if (!created) return jsonError(500, "Failed to create dispute");

    if (photoFile) {
      const absDir = join(process.cwd(), DISPUTE_UPLOAD_REL);
      await mkdir(absDir, { recursive: true });
      const ext =
        photoFile.name && /\.[a-z0-9]+$/i.test(photoFile.name)
          ? photoFile.name.match(/\.([a-z0-9]+)$/i)![1]!.toLowerCase()
          : "bin";
      const fname = `${created.id}.${ext}`;
      const buf = Buffer.from(await photoFile.arrayBuffer());
      await writeFile(join(absDir, fname), buf);
      photoPath = fname;
      await db
        .update(disputes)
        .set({ photoPath, updatedAt: new Date() })
        .where(eq(disputes.id, created.id));
    }

    return NextResponse.json(
      { dispute: { ...created, photoPath } },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
