import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/temp-password";
import { handleError, jsonError } from "@/lib/api";

/**
 * POST /api/users/[id]/reset-password (PM only)
 *
 * Issues a brand-new temporary password for another user and returns it
 * in the response payload exactly once. The PM hands it off to the
 * teammate over a secure channel; the user changes it on next sign-in
 * (or the PM does it for them).
 *
 * Refuses to reset the actor's own password — they should use their
 * existing password to log in and change it from a future profile page,
 * never from the privileged PM endpoint.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const { id } = await params;
    if (id === auth.actor.userId) {
      return jsonError(
        400,
        "Use your current password to change it; PMs can't reset their own.",
      );
    }
    const target = await db.query.users.findFirst({
      where: eq(users.id, id),
    });
    if (!target) return jsonError(404, "User not found");

    const tempPassword = generateTempPassword(12);
    const passwordHash = await hashPassword(tempPassword);
    await db
      .update(users)
      .set({ passwordHash, passwordResetRequestedAt: null })
      .where(eq(users.id, id));

    return NextResponse.json({
      user: { id: target.id, email: target.email, name: target.name },
      tempPassword,
    });
  } catch (err) {
    return handleError(err);
  }
}
