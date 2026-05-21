import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { jsonError } from "@/lib/api";
import { googleMapsApiKey } from "@/lib/google-maps-key";

/**
 * GET /api/maps/config — browser Maps key for Places autocomplete.
 * Loaded at runtime so Netlify only needs GOOGLE_MAPS_API_KEY (no build-time
 * NEXT_PUBLIC_* inlining required).
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return jsonError(
      503,
      "Google Maps API key is not configured on the server.",
    );
  }

  return NextResponse.json({ apiKey });
}
