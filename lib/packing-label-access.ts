import type { Role } from "@/db/schema";

/** Roles that may print XP-365B packing labels from order or logistics views. */
export function canPrintPackingLabels(role: Role): boolean {
  return role === "pm" || role === "super_admin" || role === "logistics";
}
