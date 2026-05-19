"use client";

import { useEffect, useMemo, useState } from "react";

/** 0 = offline … 4 = excellent (computed from Network Information API when available). */
type SignalBars = 0 | 1 | 2 | 3 | 4;

function computeBars(): { bars: SignalBars; caption: string } {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { bars: 0, caption: "No network connection" };
  }

  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  };
  const c = nav.connection;
  const et = c?.effectiveType ?? "";
  const down =
    typeof c?.downlink === "number" && Number.isFinite(c.downlink)
      ? c.downlink
      : null;
  const rtt =
    typeof c?.rtt === "number" && Number.isFinite(c.rtt) ? c.rtt : null;

  if (c?.saveData) {
    return { bars: 1, caption: "Data saver on — connection may be limited" };
  }

  let score = 3;
  if (et === "slow-2g") score = 1;
  else if (et === "2g") score = 1;
  else if (et === "3g") score = 2;
  else if (et === "4g") score = 4;

  if (down !== null) {
    if (down >= 10) score = Math.max(score, 4);
    else if (down >= 5) score = Math.max(score, 3);
    else if (down >= 1.5) score = Math.max(score, 2);
    else if (down >= 0.4) score = Math.min(score, 2);
    else score = Math.min(score, 1);
  }

  if (rtt !== null) {
    if (rtt > 600) score = Math.min(score, 1);
    else if (rtt > 300) score = Math.min(score, 2);
    else if (rtt < 120) score = Math.max(score, 3);
  }

  const bars = Math.min(4, Math.max(1, score)) as SignalBars;

  const caption =
    bars >= 4
      ? "Strong connection"
      : bars === 3
        ? "Good connection"
        : bars === 2
          ? "Fair connection"
          : "Weak connection";

  return { bars, caption };
}

function barActive(bars: SignalBars, index: number): boolean {
  if (bars === 0) return false;
  return index < bars;
}

export function NetworkIndicator() {
  const [bars, setBars] = useState<SignalBars>(3);
  const [caption, setCaption] = useState("Checking connection…");

  useEffect(() => {
    const nav = navigator as Navigator & {
      connection?: {
        addEventListener?(type: string, fn: () => void): void;
        removeEventListener?(type: string, fn: () => void): void;
      };
    };

    function sync() {
      const next = computeBars();
      setBars(next.bars);
      setCaption(next.caption);
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

  const label = useMemo(() => {
    if (bars === 0) return "Offline";
    if (bars === 1) return "Weak";
    if (bars === 2) return "Fair";
    if (bars === 3) return "Good";
    return "Strong";
  }, [bars]);

  const heights = ["h-[22%]", "h-[44%]", "h-[66%]", "h-full"];

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)]/80 px-2.5 py-1 text-xs text-[color:var(--text)]"
      title={caption}
      aria-label={`Network signal: ${label}. ${caption}`}
    >
      <div
        className="flex h-4 w-5 items-end justify-center gap-[2px]"
        aria-hidden
      >
        {heights.map((h, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm ${h} ${
              barActive(bars, i + 1)
                ? bars <= 1
                  ? "bg-red-500"
                  : bars === 2
                    ? "bg-orange-500"
                    : "bg-emerald-600"
                : "bg-[color:var(--border)]"
            }`}
          />
        ))}
      </div>
      <span className="font-semibold tabular-nums">{label}</span>
    </div>
  );
}
