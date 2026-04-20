import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guard";
import { getSessionUser } from "@/lib/session-user";

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ user: null });
  const user = await getSessionUser(actor);
  return NextResponse.json({ user });
}
