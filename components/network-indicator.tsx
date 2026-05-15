"use client";

import { useEffect, useState } from "react";

/** Traffic-light style coarse network signal (navigator.onLine + effectiveType/downlink when available). */
export function NetworkIndicator() {
  const [tier, setTier] = useState<"offline" | "degraded" | "ok">("ok");

  useEffect(() => {
    const nav = navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
        downlink?: number;
        addEventListener?(type: string, fn: () => void): void;
        removeEventListener?(type: string, fn: () => void): void;
      };
    };

    function sync() {
      if (!nav.onLine) {
        setTier("offline");
        return;
      }
      const c = nav.connection;
      const et = c?.effectiveType;
      const slowEt = et === "slow-2g" || et === "2g" || et === "3g";
      const thinDown =
        typeof c?.downlink === "number" && Number.isFinite(c.downlink)
          ? c.downlink < 1.25
          : false;
      if (slowEt || thinDown || c?.saveData) setTier("degraded");
      else setTier("ok");
    }

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const nc = nav.connection;
    nc?.addEventListener?.("change", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      nc?.removeEventListener?.("change", sync);
    };
  }, []);

  const palette =
    tier === "offline"
      ? { bg: "bg-red-600", label: "Offline", caption: "No network connection" }
      : tier === "degraded"
        ? {
            bg: "bg-amber-500",
            label: "Weak",
            caption: "Slow or unstable connection",
          }
        : {
            bg: "bg-emerald-600",
            label: "OK",
            caption: "Connection looks good",
          };

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)]/80 px-2.5 py-1 text-xs text-[color:var(--text)]"
      title={palette.caption}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${palette.bg}`} />
      <span className="font-semibold">{palette.label}</span>
    </div>
  );
}
