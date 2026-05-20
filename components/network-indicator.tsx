"use client";

import { useMemo } from "react";
import { useNetworkState } from "@uidotdev/usehooks";

/** 0 = offline … 4 = excellent */
type SignalBars = 0 | 1 | 2 | 3 | 4;

function barsFromNetwork(network: ReturnType<typeof useNetworkState>): {
  bars: SignalBars;
  caption: string;
} {
  if (!network.online) {
    return { bars: 0, caption: "No network connection" };
  }

  if (network.saveData) {
    return { bars: 1, caption: "Data saver on — connection may be limited" };
  }

  const et = network.effectiveType ?? "";
  const down =
    typeof network.downlink === "number" && Number.isFinite(network.downlink)
      ? network.downlink
      : null;
  const rtt =
    typeof network.rtt === "number" && Number.isFinite(network.rtt)
      ? network.rtt
      : null;

  let score = 3;
  if (et === "slow-2g" || et === "2g") score = 1;
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

  const typeHint = network.type ? ` (${network.type})` : "";
  return { bars, caption: `${caption}${typeHint}` };
}

function barActive(bars: SignalBars, index: number): boolean {
  if (bars === 0) return false;
  return index < bars;
}

export function NetworkIndicator() {
  const network = useNetworkState();
  const { bars, caption } = useMemo(
    () => barsFromNetwork(network),
    [
      network.online,
      network.saveData,
      network.effectiveType,
      network.downlink,
      network.rtt,
      network.type,
    ],
  );

  const label = useMemo(() => {
    if (bars === 0) return "Offline";
    if (bars === 1) return "Weak";
    if (bars === 2) return "Poor";
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
