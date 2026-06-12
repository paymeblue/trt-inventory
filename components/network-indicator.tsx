"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useNetworkState } from "@uidotdev/usehooks";
import {
  computeNetworkSignal,
  type SignalBars,
} from "@/lib/network-signal";

function barActive(bars: SignalBars, index: number): boolean {
  if (bars === 0) return false;
  return index < bars;
}

const emptySubscribe = () => () => {};

/**
 * `useNetworkState` throws when called during server rendering, which
 * turned every authenticated page into a 500 that only recovered after
 * client hydration. Defer the hook to a child that renders client-only.
 */
export function NetworkIndicator() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return <NetworkIndicatorClient />;
}

function NetworkIndicatorClient() {
  const network = useNetworkState();
  const { bars, caption, label } = useMemo(() => computeNetworkSignal(network), [network]);

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
