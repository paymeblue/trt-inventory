/**
 * Pure merge logic for GET /api/projects rollups. Extracted so regressions
 * in count/stock/order aggregation are caught by unit tests without DB.
 */

export type ProjectListRow = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
};

export type ItemRollup = {
  projectId: string;
  itemCount: number;
  totalStock: number;
};

export type OrderRollup = {
  projectId: string;
  status: "draft" | "active" | "fulfilled" | "anomaly";
  orderCount: number;
};

export type EnrichedProjectListRow = ProjectListRow & {
  itemCount: number;
  totalStock: number;
  activeOrderCount: number;
  fulfilledOrderCount: number;
};

/** UUID string keys must match case-insensitively (driver / DB casing varies). */
export function rollupKey(id: unknown): string {
  return String(id).toLowerCase();
}

function asNonNegInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

export function enrichProjectsWithRollups(
  projectRows: ProjectListRow[],
  itemRollups: ItemRollup[],
  orderRollups: OrderRollup[],
): EnrichedProjectListRow[] {
  const items = new Map<string, ItemRollup>();
  for (const r of itemRollups) {
    items.set(rollupKey(r.projectId), {
      projectId: r.projectId,
      itemCount: asNonNegInt(r.itemCount),
      totalStock: asNonNegInt(r.totalStock),
    });
  }

  const activeByProject = new Map<string, number>();
  const fulfilledByProject = new Map<string, number>();

  for (const row of orderRollups) {
    const k = rollupKey(row.projectId);
    const n = asNonNegInt(row.orderCount);
    if (row.status === "active") {
      activeByProject.set(k, n);
    } else if (row.status === "fulfilled") {
      fulfilledByProject.set(k, n);
    }
  }

  return projectRows.map((p) => {
    const k = rollupKey(p.id);
    const roll = items.get(k);
    return {
      ...p,
      itemCount: roll?.itemCount ?? 0,
      totalStock: roll?.totalStock ?? 0,
      activeOrderCount: activeByProject.get(k) ?? 0,
      fulfilledOrderCount: fulfilledByProject.get(k) ?? 0,
    };
  });
}
