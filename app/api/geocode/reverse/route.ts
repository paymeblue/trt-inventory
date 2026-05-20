import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { geocodeReverse } from "@/lib/geocode-service";

const bodySchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

/**
 * POST /api/geocode/reverse — coordinates → address (Google Geocoding API).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const body = bodySchema.parse(await req.json());
    const result = await geocodeReverse(body.latitude, body.longitude);
    if (!result) {
      return jsonError(404, "Could not resolve an address for those coordinates");
    }
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
