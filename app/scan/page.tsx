"use client";

import Link from "next/link";
import useSWR from "@/lib/swr";
import { StatusPill } from "@/components/status-pill";
import type { OrderStatus } from "@/db/schema";

interface OrdersResponse {
  orders: {
    id: string;
    projectName: string;
    status: OrderStatus;
    createdBy: string;
    createdAt: string;
    total: number;
    scanned: number;
  }[];
}

export default function ScanLandingPage() {
  const { data, isLoading } = useSWR<OrdersResponse>("/api/orders");
  const scannable = (data?.orders ?? []).filter(
    (o) => o.status === "active" || o.status === "anomaly",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Verify deliveries</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Pick the order matching the goods you&apos;re receiving. Open it to
          verify each item by scanning its barcode or QR code.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-[color:var(--text-muted)]">Loading…</div>
      ) : scannable.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
          No deliveries awaiting verification. Ask the PM to create one.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scannable.map((o) => {
            const pct =
              o.total === 0 ? 0 : Math.round((o.scanned / o.total) * 100);
            return (
              <li key={o.id} className="card flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <StatusPill status={o.status} />
                  <span className="text-xs text-[color:var(--text-muted)]">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <div className="text-base font-semibold">{o.projectName}</div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    by {o.createdBy}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
                    <span>
                      {o.scanned}/{o.total} items
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
                    <div
                      className="h-full bg-[color:var(--primary)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <Link href={`/orders/${o.id}`} className="btn btn-primary">
                  Verify delivery →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
