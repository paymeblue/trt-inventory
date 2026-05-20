import type { Role } from "@/db/schema";
import { roleShortLabel } from "@/lib/role-label";

/**
 * User-facing copy when an authenticated user lacks permission for an API action.
 * Never exposes internal role slugs like `super_admin` in the message body.
 */
export function friendlyRoleDeniedMessage(
  actorRole: Role,
  allowed: readonly Role[],
): string {
  if (allowed.length === 1) {
    const required = allowed[0];
    if (required === "super_admin") {
      switch (actorRole) {
        case "pm":
          return "This step is handled by your super-admin team. Check Projects for your submission status, or wait for approval in Pending approval.";
        case "logistics":
          return "This is the super-admin approval queue. For warehouse scans, open Awaiting logistics and use Warehouse scan.";
        case "installer":
          return "Receivers verify deliveries on site after logistics activates the project. You do not have access to the approval queue.";
        default:
          return "You do not have access to this super-admin action.";
      }
    }
    if (required === "logistics") {
      switch (actorRole) {
        case "pm":
          return "Warehouse verification is done by logistics. Ask your logistics team to scan packing QRs under Awaiting logistics.";
        case "super_admin":
          return "Open Awaiting logistics → Warehouse scan to verify packing QRs, or use a logistics account.";
        case "installer":
          return "Logistics must scan each box in the warehouse before you can verify on site. Ask logistics to complete Warehouse scan first.";
        default:
          return "You do not have access to logistics warehouse actions.";
      }
    }
    if (required === "installer") {
      return "Only receiver accounts can verify deliveries here. Use the printed QR on the box, or ask your PM to assign you to this project.";
    }
    if (required === "pm") {
      return "This action is for project manager accounts only.";
    }
    return `This action is for ${roleShortLabel(required)} accounts only.`;
  }

  const labels = allowed.map(roleShortLabel);
  if (allowed.includes("pm") && allowed.includes("super_admin") && allowed.length === 2) {
    return "This action is for project managers or super admins only.";
  }
  if (allowed.includes("logistics") && allowed.includes("super_admin")) {
    return "This action is for logistics or super-admin accounts only.";
  }

  return `This action is for ${labels.join(" or ")} accounts only. Your account (${roleShortLabel(actorRole)}) cannot perform it here.`;
}
