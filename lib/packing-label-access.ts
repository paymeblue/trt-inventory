import type { Role } from "@/db/schema";

/**
 * Roles that may see and print XP-365B packing labels (stickers). Only the
 * PM and super-admin handle stickers — logistics and receivers scan the
 * physical boxes, they never see the label artwork in the app.
 */
export function canPrintPackingLabels(role: Role): boolean {
  return role === "pm" || role === "super_admin";
}
