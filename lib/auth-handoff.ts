import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@/db/schema";
import { getSessionSecret } from "@/lib/session";

export interface SessionHandoffPayload {
  userId: string;
  email: string;
  role: Role;
  name: string;
  exp: number;
}

type HandoffActor = Omit<SessionHandoffPayload, "exp">;

/**
 * Signed, time-limited payload so an installer can open a scan deep-link in
 * another browser / web view and still get a session (camera QR → external
 * browser, etc.). Uses the same secret as iron-session.
 */
export function signSessionHandoff(actor: HandoffActor, ttlMs: number): string {
  const exp = Date.now() + ttlMs;
  const body = Buffer.from(
    JSON.stringify({ ...actor, exp } satisfies SessionHandoffPayload),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionHandoff(
  token: string,
): SessionHandoffPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
  try {
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  let parsed: SessionHandoffPayload;
  try {
    parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionHandoffPayload;
  } catch {
    return null;
  }
  if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
  if (
    !parsed.userId ||
    !parsed.email ||
    !parsed.role ||
    parsed.name === undefined
  ) {
    return null;
  }
  return parsed;
}
