import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { autocompletePlaces } from "@/lib/geocode-service";

/**
 * GET /api/geocode/autocomplete?q=...
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return jsonError(400, "Type at least 2 characters");
    }
    const suggestions = await autocompletePlaces(q);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return handleError(err);
  }
}
