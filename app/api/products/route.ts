import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";

const createSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  stockQuantity: z.number().int().min(0).default(0),
});

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const rows = await db.select().from(products).orderBy(asc(products.sku));
    return NextResponse.json({ products: rows });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const body = createSchema.parse(await req.json());
    const existing = await db.query.products.findFirst({
      where: eq(products.sku, body.sku),
    });
    if (existing) {
      return jsonError(409, `SKU "${body.sku}" already exists`);
    }

    const [row] = await db
      .insert(products)
      .values({
        sku: body.sku,
        name: body.name,
        stockQuantity: body.stockQuantity,
      })
      .returning();

    if (body.stockQuantity > 0) {
      await db.insert(stockMovements).values({
        productId: row.id,
        delta: body.stockQuantity,
        reason: "initial",
        userId: auth.actor.userId,
      });
    }

    return NextResponse.json({ product: row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
