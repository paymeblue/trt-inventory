import { eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { disputes, orders, projects } from "@/db/schema";
import type { Role } from "@/db/schema";

/** Project inferred from disputes.order_id → orders.project_id (alias for joins). */
export const disputeOrderScopeProject = alias(projects, "dispute_order_scope");

/**
 * Use with FROM disputes LEFT JOIN … project + orders + disputeOrderScopeProject.
 * Omit from WHERE entirely when super-admin or logistics (see all rows).
 */
export function disputesVisibleWhere(role: Role, viewerId: string) {
  if (role === "super_admin" || role === "logistics") {
    return undefined;
  }
  if (role === "pm") {
    return or(
      eq(disputes.createdById, viewerId),
      eq(projects.createdById, viewerId),
      eq(disputeOrderScopeProject.createdById, viewerId),
    );
  }
  return or(
    eq(disputes.createdById, viewerId),
    eq(projects.installerUserId, viewerId),
    eq(disputeOrderScopeProject.installerUserId, viewerId),
  );
}
