/** Server-side Google Maps / Places API key. */
export function googleMapsApiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined;
}

/** Browser key — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or mirror GOOGLE_MAPS_API_KEY in next.config. */
export function googleMapsPublicApiKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    undefined
  );
}
