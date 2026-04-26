import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { hashPassword } from "@/lib/password";
import { handleError, jsonError } from "@/lib/api";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z.enum(["pm", "installer"]).default("installer"),
});

export async function GET() {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdById: users.createdById,
        createdAt: users.createdAt,
        passwordResetRequestedAt: users.passwordResetRequestedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    return NextResponse.json({ users: rows });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser("pm");
  if ("error" in auth) return auth.error;
  try {
    const body = createSchema.parse(await req.json());

    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    });
    if (existing) return jsonError(409, "A user with that email already exists");

    const passwordHash = await hashPassword(body.password);
    const [row] = await db
      .insert(users)
      .values({
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash,
        createdById: auth.actor.userId,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      });

    return NextResponse.json({ user: row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
