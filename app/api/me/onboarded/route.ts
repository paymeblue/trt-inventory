import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";

/**
 * Marks the current user as having seen (or skipped) the guided tour.
 * Idempotent — only writes if `onboarded_at` is still null, so re-posting
 * never moves the timestamp forward.
 */
export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const [row] = await db
      .update(users)
      .set({ onboardedAt: new Date() })
      .where(
        and(eq(users.id, auth.actor.userId), isNull(users.onboardedAt)),
      )
      .returning({ onboardedAt: users.onboardedAt });

    // If the row already had onboardedAt, the update-with-isNull above
    // returns nothing — fetch the existing value so callers always see
    // a concrete timestamp.
    if (row) {
      return NextResponse.json({ onboardedAt: row.onboardedAt });
    }
    const [existing] = await db
      .select({ onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.id, auth.actor.userId))
      .limit(1);
    return NextResponse.json({ onboardedAt: existing?.onboardedAt ?? null });
  } catch (err) {
    return handleError(err);
  }
}
