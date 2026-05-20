import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guard";
import { handleError, jsonError } from "@/lib/api";
import { resolvePlaceSuggestion } from "@/lib/geocode-service";
import type { PlaceSuggestion } from "@/lib/geocode-types";

const bodySchema = z.object({
  placeId: z.string(),
  description: z.string().trim().min(1),
  provider: z.literal("google").optional().default("google"),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
});

/**
 * POST /api/geocode/select — lock coordinates after picking an autocomplete row.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const body = bodySchema.parse(await req.json());
    const suggestion: PlaceSuggestion = {
      placeId: body.placeId,
      description: body.description,
      provider: body.provider,
      latitude: body.latitude ?? Number.NaN,
      longitude: body.longitude ?? Number.NaN,
    };
    const result = await resolvePlaceSuggestion(suggestion);
    if (!result) {
      return jsonError(400, "Could not resolve that place");
    }
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
