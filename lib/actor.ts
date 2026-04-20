import { headers } from "next/headers";

export type Role = "pm" | "installer";

export interface Actor {
  role: Role;
  name: string;
}

/**
 * Reads the acting user from request headers. The UI sends these alongside
 * every mutating request. No real auth in this app — keep it stupid simple.
 */
/**
 * Pure version of the header -> Actor coercion. Exported so it can be
 * unit-tested without faking Next's request-scoped headers().
 */
export function resolveActor(
  rawRole: string | null | undefined,
  rawName: string | null | undefined,
): Actor {
  const role: Role = rawRole === "installer" ? "installer" : "pm";
  const name =
    rawName?.trim() || (role === "pm" ? "Project Manager" : "Installer");
  return { role, name };
}

export async function getActorFromHeaders(): Promise<Actor> {
  const h = await headers();
  return resolveActor(h.get("x-actor-role"), h.get("x-actor-name"));
}
