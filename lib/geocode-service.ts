import type { GeocodeResult, PlaceSuggestion } from "@/lib/geocode-types";
import { geocodeAddress as googleGeocodeAddress } from "@/lib/google-geocode";
import { googleMapsApiKey } from "@/lib/google-maps-key";

async function googleAutocompletePredictions(
  query: string,
): Promise<PlaceSuggestion[]> {
  const key = googleMapsApiKey();
  if (!key) return [];

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/autocomplete/json",
  );
  url.searchParams.set("input", query);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    status: string;
    predictions?: { place_id: string; description: string }[];
  };
  if (data.status !== "OK" || !data.predictions?.length) return [];

  return data.predictions.slice(0, 6).map((p) => ({
    placeId: p.place_id,
    description: p.description,
    latitude: NaN,
    longitude: NaN,
    provider: "google" as const,
  }));
}

/** Resolve a Google place_id to coordinates. */
export async function resolveGooglePlaceId(
  placeId: string,
): Promise<GeocodeResult | null> {
  const key = googleMapsApiKey();
  if (!key) return null;
  const loc = await googlePlaceDetails(placeId, key);
  if (!loc) return null;
  return {
    formattedAddress: "",
    latitude: loc.lat,
    longitude: loc.lng,
    provider: "google",
  };
}

async function googlePlaceDetails(
  placeId: string,
  key: string,
): Promise<{ lat: number; lng: number; formattedAddress?: string } | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json",
  );
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "geometry,formatted_address");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status: string;
    result?: {
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
    };
  };
  const loc = data.result?.geometry?.location;
  if (!loc) return null;
  return {
    lat: loc.lat,
    lng: loc.lng,
    formattedAddress: data.result?.formatted_address,
  };
}

/** Forward geocode via Google Geocoding API. */
export async function geocodeForward(
  address: string,
): Promise<GeocodeResult | null> {
  const google = await googleGeocodeAddress(address);
  if (google && !("error" in google)) {
    return { ...google, provider: "google" as const };
  }
  return null;
}

/** Reverse geocode coordinates via Google Geocoding API. */
export async function geocodeReverse(
  latitude: number,
  longitude: number,
): Promise<GeocodeResult | null> {
  const key = googleMapsApiKey();
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", key);
  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status: string;
    results?: {
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }[];
  };
  if (data.status !== "OK" || !data.results?.[0]) return null;

  const hit = data.results[0];
  return {
    formattedAddress: hit.formatted_address,
    latitude: hit.geometry.location.lat,
    longitude: hit.geometry.location.lng,
    provider: "google",
  };
}

/** Autocomplete via Google Places (server fallback for non-JS clients). */
export async function autocompletePlaces(
  query: string,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return googleAutocompletePredictions(q);
}

/** Turn a selected suggestion into a locked site. */
export async function resolvePlaceSuggestion(
  suggestion: PlaceSuggestion,
): Promise<GeocodeResult | null> {
  if (
    Number.isFinite(suggestion.latitude) &&
    Number.isFinite(suggestion.longitude)
  ) {
    return {
      formattedAddress: suggestion.description,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      provider: suggestion.provider,
    };
  }
  if (suggestion.placeId) {
    const key = googleMapsApiKey();
    if (!key) return geocodeForward(suggestion.description);
    const details = await googlePlaceDetails(suggestion.placeId, key);
    if (!details) return geocodeForward(suggestion.description);
    return {
      formattedAddress:
        details.formattedAddress ?? suggestion.description,
      latitude: details.lat,
      longitude: details.lng,
      provider: "google",
    };
  }
  return geocodeForward(suggestion.description);
}
