function readKey(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Server-side Google Maps / Places / Geocoding API key. */
export function googleMapsApiKey(): string | undefined {
  return readKey("GOOGLE_MAPS_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
}

/**
 * Browser key — must be present at **build time** (inlined into client JS).
 * Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, or `GOOGLE_MAPS_API_KEY` (mirrored
 * via `next.config.ts` `env`).
 */
export function googleMapsPublicApiKey(): string | undefined {
  return readKey(
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "GOOGLE_MAPS_API_KEY",
  );
}
