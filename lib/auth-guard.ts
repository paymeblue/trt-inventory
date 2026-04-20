import { getSession, type SessionData } from "./session";
import { jsonError } from "./api";
import type { Role } from "@/db/schema";

export interface AuthenticatedActor {
  userId: string;
  email: string;
  role: Role;
  name: string;
}

/**
 * Pure helper: turns a raw session envelope into an AuthenticatedActor, or
 * null if any required field is missing. Exported so it can be unit-tested
 * without spinning up Next's request context.
 */
export function toActor(session: SessionData): AuthenticatedActor | null {
  if (!session.userId || !session.role || !session.email || !session.name) {
    return null;
  }
  return {
    userId: session.userId,
    email: session.email,
    role: session.role,
    name: session.name,
  };
}

/**
 * Pure helper: decides whether an actor is allowed to perform an action that
 * requires a specific role. Exported for testing.
 */
export function checkRole(
  actor: AuthenticatedActor | null,
  requiredRole?: Role,
): { ok: true; actor: AuthenticatedActor } | { ok: false; status: 401 | 403 } {
  if (!actor) return { ok: false, status: 401 };
  if (requiredRole && actor.role !== requiredRole) {
    return { ok: false, status: 403 };
  }
  return { ok: true, actor };
}

/**
 * Returns the authenticated actor or a 401 JSON response.
 * If `requiredRole` is provided, returns 403 for the wrong role.
 */
export async function requireUser(
  requiredRole?: Role,
): Promise<{ actor: AuthenticatedActor } | { error: Response }> {
  const session = await getSession();
  const actor = toActor(session);
  const check = checkRole(actor, requiredRole);
  if (!check.ok) {
    if (check.status === 401) {
      return { error: jsonError(401, "Not authenticated") };
    }
    return {
      error: jsonError(403, `This action requires the ${requiredRole} role`),
    };
  }
  return { actor: check.actor };
}

/**
 * For server components. Returns the current user or null. Pages typically
 * call this and redirect to `/login` when null.
 */
export async function getCurrentUser(): Promise<AuthenticatedActor | null> {
  const session = await getSession();
  return toActor(session);
}
