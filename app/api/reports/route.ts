import { NextResponse } from 'next/server';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { orders, projects, users } from '@/db/schema';
import { requireUserAny } from '@/lib/auth-guard';
import { handleError } from '@/lib/api';

export interface ReportRow {
  orderId: string;
  projectName: string;
  pmName: string;
  installerName: string | null;
  fulfilledAt: string;
  itemCount: number;
  items: { sku: string; barcode: string }[];
}

export async function GET() {
  const auth = await requireUserAny(['pm', 'super_admin', 'logistics']);
  if ('error' in auth) return auth.error;

  try {
    const fulfilledOrders = await db.query.orders.findMany({
      where: and(isNotNull(orders.fulfilledAt), eq(orders.isLogisticsGate, false)),
      with: { items: true, project: true },
      orderBy: [asc(orders.fulfilledAt)],
    });

    const rows: ReportRow[] = [];

    for (const o of fulfilledOrders) {
      let installerName: string | null = null;
      if (o.project?.installerUserId) {
        const installer = await db.query.users.findFirst({
          where: eq(users.id, o.project.installerUserId),
          columns: { name: true },
        });
        installerName = installer?.name ?? null;
      }

      rows.push({
        orderId: o.id,
        projectName: o.project?.name ?? 'Unknown',
        pmName: o.createdBy,
        installerName,
        fulfilledAt: o.fulfilledAt!.toISOString(),
        itemCount: o.items.length,
        items: o.items.map((i) => ({ sku: i.productId, barcode: i.barcode })),
      });
    }

    return NextResponse.json({ rows });
  } catch (err) {
    return handleError(err);
  }
}
