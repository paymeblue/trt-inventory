"use client";

import { useState } from "react";

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
 * PM picks a project site: type an address, geocode via server, confirm coordinates.
 */
export function AddressPicker({
  value,
  onChange,
  required,
  disabled,
}: Props) {
  const [draft, setDraft] = useState(value?.siteAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function resolveAddress() {
    const address = draft.trim();
    if (!address) {
      setErr("Enter the project site address.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        formattedAddress?: string;
        latitude?: number;
        longitude?: number;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not geocode address");
      if (
        typeof json.latitude !== "number" ||
        typeof json.longitude !== "number" ||
        !json.formattedAddress
      ) {
        throw new Error("Geocoder returned an incomplete result");
      }
      onChange({
        siteAddress: json.formattedAddress,
        siteLatitude: json.latitude,
        siteLongitude: json.longitude,
      });
      setDraft(json.formattedAddress);
    } catch (e) {
      setErr((e as Error).message);
      onChange(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          Project site address{required ? " *" : ""}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input min-w-0 flex-1"
            placeholder="e.g. Plot 12, Ademola Adetokunbo Crescent, Mabushi, Abuja"
            value={draft}
            disabled={disabled || busy}
            onChange={(e) => {
              setDraft(e.target.value);
              if (value) onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void resolveAddress();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            disabled={disabled || busy || !draft.trim()}
            onClick={() => void resolveAddress()}
          >
            {busy ? "Locating…" : "Confirm location"}
          </button>
        </div>
      </label>
      {value ? (
        <p className="text-xs text-[color:var(--info)]">
          Site locked: {value.siteAddress}
          <span className="ml-1 font-mono text-[10px] text-[color:var(--text-muted)]">
            ({value.siteLatitude.toFixed(5)}, {value.siteLongitude.toFixed(5)})
          </span>
        </p>
      ) : (
        <p className="text-xs text-[color:var(--text-muted)]">
          Confirm the address so installer scans can be checked against this site
          (e.g. flag scans in Wuse for a Mabushi project).
        </p>
      )}
      {err && (
        <p className="text-xs text-[color:var(--danger)]">{err}</p>
      )}
    </div>
  );
}
