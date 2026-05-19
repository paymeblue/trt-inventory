/** Default on-site radius when project row omits an override. */
export const DEFAULT_GEOFENCE_RADIUS_M = 500;

/**
 * Haversine distance in metres between two WGS84 points.
 */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isWithinGeofence(
  siteLat: number,
  siteLng: number,
  scanLat: number,
  scanLng: number,
  radiusM: number,
): boolean {
  return distanceMeters(siteLat, siteLng, scanLat, scanLng) <= radiusM;
}

export function projectHasGeofence(project: {
  siteLatitude: number | null;
  siteLongitude: number | null;
}): boolean {
  return (
    typeof project.siteLatitude === "number" &&
    Number.isFinite(project.siteLatitude) &&
    typeof project.siteLongitude === "number" &&
    Number.isFinite(project.siteLongitude)
  );
}
