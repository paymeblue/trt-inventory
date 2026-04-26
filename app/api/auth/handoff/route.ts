import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { signSessionHandoff } from "@/lib/auth-handoff";
import { handleError, jsonError } from "@/lib/api";
import { isSafeInternalRedirectPath } from "@/lib/auth-routing";

const bodySchema = z.object({
  next: z.string().trim().min(1),
});

const HANDOFF_TTL_MS = 5 * 60 * 1000;

/**
 * Mints a short-lived token for `/auth/handoff` so a scan deep-link can be
 * opened in another browser and still establish the installer's session.
 */
export async function POST(req: Request) {
  const auth = await requireUser("installer");
  if ("error" in auth) return auth.error;
  try {
    const { next } = bodySchema.parse(await req.json());
    if (!isSafeInternalRedirectPath(next)) {
      return jsonError(400, "Invalid redirect target");
    }
    const t = signSessionHandoff(auth.actor, HANDOFF_TTL_MS);
    const url = `/auth/handoff?t=${encodeURIComponent(t)}&next=${encodeURIComponent(next)}`;
    return NextResponse.json({ url });
  } catch (err) {
    return handleError(err);
  }
}
