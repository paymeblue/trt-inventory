import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { handleError, jsonError } from "@/lib/api";
import { instrumentRouteHandler } from "@/lib/observability/instrument";
import { verifyPassword } from "@/lib/password";
import { getSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

async function handlePost(req: NextRequest) {
  try {
    const { email, password } = loginSchema.parse(await req.json());
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) return jsonError(401, "Invalid email or password");

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return jsonError(401, "Invalid email or password");

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.role = user.role;
    session.name = user.name;
    await session.save();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export const POST = instrumentRouteHandler("POST /api/auth/login", handlePost);
