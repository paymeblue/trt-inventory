import { jsonError } from "@/lib/api";

export type GeocodeResult = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

/**
 * Geocode a free-text address with Google Geocoding API (server-side).
 * Requires `GOOGLE_MAPS_API_KEY` in the environment.
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | { error: ReturnType<typeof jsonError> }> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return {
      error: jsonError(
        503,
        "Geocoding is not configured. Set GOOGLE_MAPS_API_KEY on the server.",
      ),
    };
  }

  const q = address.trim();
  if (!q) {
    return { error: jsonError(400, "Address is required") };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", q);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    return { error: jsonError(502, "Geocoding service unavailable") };
  }

  const data = (await res.json()) as {
    status: string;
    results?: {
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }[];
    error_message?: string;
  };

  if (data.status !== "OK" || !data.results?.[0]) {
    const hint =
      data.status === "ZERO_RESULTS"
        ? "No match for that address. Try a more specific location."
        : data.error_message ?? `Geocoder returned ${data.status}`;
    return { error: jsonError(400, hint) };
  }

  const hit = data.results[0];
  return {
    formattedAddress: hit.formatted_address,
    latitude: hit.geometry.location.lat,
    longitude: hit.geometry.location.lng,
  };
}
