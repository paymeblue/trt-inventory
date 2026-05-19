/** Read browser geolocation; rejects if unavailable or denied. */
export function readScanCoordinates(): Promise<{
  latitude: number;
  longitude: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device cannot read GPS location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to scan at the project site."
            : err.code === err.TIMEOUT
              ? "Could not get GPS fix in time. Try again outdoors."
              : "Could not read your location. Enable GPS and try again.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}
