import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";

const createOrderSchema = z.object({
  projectName: z.string().trim().min(1, "Project name is required").max(120),
});

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const rows = await db.query.orders.findMany({
      with: { items: true },
      orderBy: [desc(orders.createdAt)],
    });

    const payload = rows.map((o) => {
      const total = o.items.length;
      const scanned = o.items.filter((i) => i.scannedAt !== null).length;
      return {
        id: o.id,
        projectName: o.projectName,
        status: o.status,
        createdBy: o.createdBy,
        createdAt: o.createdAt,
        completedAt: o.completedAt,
        fulfilledAt: o.fulfilledAt,
        total,
        scanned,
      };
    });

    return NextResponse.json({ orders: payload });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { projectName } = createOrderSchema.parse(await req.json());
    const [row] = await db
      .insert(orders)
      .values({
        projectName,
        createdBy: auth.actor.name,
        createdById: auth.actor.userId,
        status: "active",
      })
      .returning();

    return NextResponse.json({ order: row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
