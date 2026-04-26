import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * POST /api/auth/forgot-password (public)
 *
 * Lets a user flag "I forgot my password" so a PM picks it up from the
 * Team page and issues a new temp password manually. There is no email
 * infrastructure in this app — that handoff is intentional.
 *
 * Always returns 200 regardless of whether the email exists, so the
 * endpoint can't be used to enumerate accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = schema.parse(await req.json());

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (user) {
      await db
        .update(users)
        .set({ passwordResetRequestedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
