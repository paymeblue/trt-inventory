import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const [orderCounts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where status = 'active')::int`,
        fulfilled: sql<number>`count(*) filter (where status = 'fulfilled')::int`,
        anomaly: sql<number>`count(*) filter (where status = 'anomaly')::int`,
      })
      .from(orders);

    const [itemCounts] = await db
      .select({
        totalItems: sql<number>`count(*)::int`,
        scannedItems: sql<number>`count(*) filter (where scanned_at is not null)::int`,
      })
      .from(orderItems);

    const [warehouse] = await db
      .select({
        skus: sql<number>`count(*)::int`,
        totalStock: sql<number>`coalesce(sum(stock_quantity), 0)::int`,
        negative: sql<number>`count(*) filter (where stock_quantity < 0)::int`,
      })
      .from(products);

    const recent = await db.query.orders.findMany({
      with: { items: true },
      orderBy: [desc(orders.createdAt)],
      limit: 5,
    });

    return NextResponse.json({
      orders: orderCounts,
      items: itemCounts,
      warehouse,
      recent: recent.map((o) => ({
        id: o.id,
        projectName: o.projectName,
        status: o.status,
        createdBy: o.createdBy,
        createdAt: o.createdAt,
        total: o.items.length,
        scanned: o.items.filter((i) => i.scannedAt !== null).length,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
