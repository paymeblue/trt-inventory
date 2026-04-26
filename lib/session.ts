import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import type { Role } from "@/db/schema";

export interface SessionData {
  userId?: string;
  email?: string;
  role?: Role;
  name?: string;
}

const password =
  process.env.SESSION_SECRET ??
  "dev-insecure-secret-change-me-in-production-please-32chars";

if (password.length < 32) {
  throw new Error(
    "SESSION_SECRET must be at least 32 characters. Set it in .env.local.",
  );
}

/** Same secret used to sign short-lived browser handoff tokens. */
export function getSessionSecret(): string {
  return password;
}

export const sessionOptions: SessionOptions = {
  password,
  cookieName: "trt.session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions);
}
