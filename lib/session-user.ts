import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AuthenticatedActor } from "@/lib/auth-guard";
import type { SessionUser } from "@/components/session-context";

/**
 * Builds the client-side `SessionUser` shape from the authenticated actor,
 * pulling `onboardedAt` from the database. Kept out of auth-guard so that
 * module stays pure (and easy to unit test) while this helper owns the DB
 * lookup the tour needs.
 */
export async function getSessionUser(
  actor: AuthenticatedActor,
): Promise<SessionUser> {
  const [row] = await db
    .select({ onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);

  return {
    id: actor.userId,
    email: actor.email,
    role: actor.role,
    name: actor.name,
    onboardedAt: row?.onboardedAt ? row.onboardedAt.toISOString() : null,
  };
}
