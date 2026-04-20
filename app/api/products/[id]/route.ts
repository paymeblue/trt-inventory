import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

const restockSchema = z.object({
  delta: z.number().int(),
  reason: z.string().trim().min(1).max(80).default("adjustment"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    const { delta, reason } = restockSchema.parse(await req.json());
    if (delta === 0) return jsonError(400, "delta must be non-zero");

    const product = await db.query.products.findFirst({
      where: eq(products.id, id),
    });
    if (!product) return jsonError(404, "Product not found");

    const [updated] = await db
      .update(products)
      .set({ stockQuantity: product.stockQuantity + delta })
      .where(eq(products.id, id))
      .returning();

    await db.insert(stockMovements).values({
      productId: id,
      delta,
      reason,
      userId: auth.actor.userId,
    });

    return NextResponse.json({ product: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    await db.delete(products).where(eq(products.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
