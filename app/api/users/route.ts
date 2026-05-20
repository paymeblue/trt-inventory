import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { hashPassword } from "@/lib/password";
import { handleError, jsonError } from "@/lib/api";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  role: z
    .enum(["pm", "installer", "logistics", "super_admin"])
    .default("installer"),
});

export async function GET() {
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
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
  const auth = await requireUserAny(["pm", "super_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const body = createSchema.parse(await req.json());

    if (
      auth.actor.role === "pm" &&
      (body.role === "logistics" || body.role === "super_admin")
    ) {
      return jsonError(
        403,
        "Only super-admin can create logistics or super-admin accounts",
      );
    }

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
        phone: body.phone ?? null,
        role: body.role,
        passwordHash,
        createdById: auth.actor.userId,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        role: users.role,
        createdAt: users.createdAt,
      });

    return NextResponse.json({ user: row }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
