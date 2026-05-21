"use client";

import { useEffect, useState } from "react";
import Autocomplete from "react-google-autocomplete";

import { googleMapsPublicApiKey } from "@/lib/google-maps-key";

export type SiteSelection = {
  siteAddress: string;
  siteLatitude: number;
  siteLongitude: number;
};

type Props = {
  value: SiteSelection | null;
  onChange: (next: SiteSelection | null) => void;
  required?: boolean;
  disabled?: boolean;
};

/**
 * Project site address with Google Places autocomplete (client-side).
 */
export function AddressPicker({
  value,
  onChange,
  required,
  disabled,
}: Props) {
  const [apiKey, setApiKey] = useState<string | undefined>(() =>
    googleMapsPublicApiKey(),
  );
  const [keyLoading, setKeyLoading] = useState(
    () => !googleMapsPublicApiKey(),
  );
  const [keyMissing, setKeyMissing] = useState(false);
  const [query, setQuery] = useState(value?.siteAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (apiKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/maps/config");
        const json = (await res.json().catch(() => ({}))) as {
          apiKey?: string;
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && json.apiKey?.trim()) {
          setApiKey(json.apiKey.trim());
          setKeyMissing(false);
        } else {
          setKeyMissing(true);
        }
      } catch {
        if (!cancelled) setKeyMissing(true);
      } finally {
        if (!cancelled) setKeyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (value?.siteAddress) setQuery(value.siteAddress);
  }, [value?.siteAddress]);

  function applyPlace(place: google.maps.places.PlaceResult) {
    const lat = place.geometry?.location?.lat();
    const lng = place.geometry?.location?.lng();
    const addr =
      place.formatted_address?.trim() ||
      place.name?.trim() ||
      query.trim();
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !addr
    ) {
      setErr("Pick a full street address from the Google suggestions.");
      onChange(null);
      return;
    }
    setErr(null);
    onChange({
      siteAddress: addr,
      siteLatitude: lat,
      siteLongitude: lng,
    });
    setQuery(addr);
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setErr("This device cannot read GPS location.");
      return;
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/geocode/reverse", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            formattedAddress?: string;
            latitude?: number;
            longitude?: number;
          };
          if (!res.ok) throw new Error(json.error ?? "Reverse geocode failed");
          if (
            typeof json.latitude !== "number" ||
            typeof json.longitude !== "number" ||
            !json.formattedAddress
          ) {
            throw new Error("Could not resolve address from GPS");
          }
          onChange({
            siteAddress: json.formattedAddress,
            siteLatitude: json.latitude,
            siteLongitude: json.longitude,
          });
          setQuery(json.formattedAddress);
        } catch (e) {
          setErr((e as Error).message);
          onChange(null);
        } finally {
          setBusy(false);
        }
      },
      (geoErr) => {
        setBusy(false);
        setErr(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? "Allow location access to use GPS for the site address."
            : "Could not read GPS. Pick an address from the list instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  if (keyLoading) {
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-[color:var(--text-muted)]">
        Loading address search…
      </div>
    );
  }

  if (!apiKey || keyMissing) {
    return (
      <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)] dark:bg-red-950/30">
        Google Maps API key is not configured. Set{" "}
        <code className="text-xs">GOOGLE_MAPS_API_KEY</code> in Netlify
        environment variables (or in <code className="text-xs">.env.local</code>{" "}
        locally), enable Places + Geocoding in Google Cloud, then redeploy.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          Project site address{required ? " *" : ""}
        </span>
        <div className="relative">
          <Autocomplete
            apiKey={apiKey}
            className="input w-full pr-28"
            placeholder="Start typing — pick a Google suggestion"
            value={query}
            disabled={disabled || busy}
            onChange={(e) => {
              const next = (e.target as HTMLInputElement).value;
              setQuery(next);
              onChange(null);
              setErr(null);
            }}
            onPlaceSelected={(place) => applyPlace(place)}
            options={{
              types: ["geocode"],
              fields: ["formatted_address", "geometry", "name"],
            }}
          />
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost px-2 py-1 text-[10px]"
            disabled={disabled || busy}
            onClick={() => void useCurrentLocation()}
            title="Use GPS and look up address"
          >
            GPS
          </button>
        </div>
      </label>
      {value ? (
        <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-emerald-600/25 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-100">
          <span
            className="size-1.5 shrink-0 rounded-full bg-emerald-600"
            aria-hidden
          />
          <span className="min-w-0 truncate font-medium">{value.siteAddress}</span>
          <span className="shrink-0 font-mono text-[10px] opacity-80">
            {value.siteLatitude.toFixed(5)}, {value.siteLongitude.toFixed(5)}
          </span>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--text-muted)]">
          Receiver on-site scans are only allowed at this address (GPS + geofence).
          Choose a suggestion from the list — free typing alone is not enough.
        </p>
      )}
      {busy ? (
        <p className="text-xs text-[color:var(--text-muted)]">Looking up…</p>
      ) : null}
      {err ? <p className="text-xs text-[color:var(--danger)]">{err}</p> : null}
    </div>
  );
}
