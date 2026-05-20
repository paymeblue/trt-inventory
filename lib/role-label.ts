import type { Role } from "@/db/schema";

export function roleShortLabel(role: Role): string {
  switch (role) {
    case "pm":
      return "PM";
    case "installer":
      return "Receiver";
    case "logistics":
      return "Logistics";
    case "super_admin":
      return "Super admin";
    default:
      return role;
  }
}

/** Suffix class for `pill` (e.g. `pill-active`, `pill-fulfilled`). */
export function rolePillModifier(role: Role): string {
  switch (role) {
    case "pm":
    case "super_admin":
      return "pill-active";
    case "installer":
      return "pill-fulfilled";
    case "logistics":
      return "pill-anomaly";
    default:
      return "pill-fulfilled";
  }
}
