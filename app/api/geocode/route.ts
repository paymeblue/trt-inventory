import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";
import { geocodeAddress } from "@/lib/google-geocode";

const bodySchema = z.object({
  address: z.string().trim().min(3).max(500),
});

/**
 * POST /api/geocode — resolve a site address to lat/lng (Google Geocoding API).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const body = bodySchema.parse(await req.json());
    const result = await geocodeAddress(body.address);
    if ("error" in result) return result.error;
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
