/** 0 = offline … 4 = excellent */
export type SignalBars = 0 | 1 | 2 | 3 | 4;

export type NetworkSnapshot = {
  online: boolean;
  effectiveType?: string | null;
  downlink?: number | null;
  rtt?: number | null;
  saveData?: boolean | null;
  type?: string | null;
};

function effectiveTypeScore(et: string): number {
  if (et === "slow-2g" || et === "2g") return 1;
  if (et === "3g") return 2;
  if (et === "4g") return 4;
  return 3;
}

function labelFromBars(bars: SignalBars): string {
  if (bars === 0) return "Offline";
  if (bars === 1) return "Weak";
  if (bars === 2) return "Poor";
  if (bars === 3) return "Good";
  return "Strong";
}

function captionFromBars(bars: SignalBars, type?: string | null): string {
  const typeHint = type ? ` (${type})` : "";
  if (bars === 0) return "No network connection";
  if (bars >= 4) return `Strong connection${typeHint}`;
  if (bars === 3) return `Good connection${typeHint}`;
  if (bars === 2) return `Fair connection${typeHint}`;
  return `Weak connection${typeHint}`;
}

/**
 * Maps Network Information API fields to UI bars.
 * Desktop browsers often omit metrics — treat as connected instead of "Poor".
 */
export function computeNetworkSignal(network: NetworkSnapshot): {
  bars: SignalBars;
  caption: string;
  label: string;
} {
  if (!network.online) {
    return {
      bars: 0,
      caption: captionFromBars(0),
      label: labelFromBars(0),
    };
  }

  const et = (network.effectiveType ?? "").trim();
  const hasEffectiveType =
    et === "slow-2g" || et === "2g" || et === "3g" || et === "4g";

  const down =
    typeof network.downlink === "number" &&
    Number.isFinite(network.downlink) &&
    network.downlink > 0
      ? network.downlink
      : null;
  const rtt =
    typeof network.rtt === "number" &&
    Number.isFinite(network.rtt) &&
    network.rtt > 0
      ? network.rtt
      : null;

  if (!hasEffectiveType && down === null && rtt === null) {
    return {
      bars: 4,
      caption: "Connected",
      label: "Strong",
    };
  }

  let score = hasEffectiveType ? effectiveTypeScore(et) : 3;

  const canTuneThroughput = hasEffectiveType || (down !== null && rtt !== null);
  if (canTuneThroughput) {
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
  }

  if (network.saveData) {
    score = Math.max(1, score - 1);
  }

  const bars = Math.min(4, Math.max(1, score)) as SignalBars;
  return {
    bars,
    caption: captionFromBars(bars, network.type),
    label: labelFromBars(bars),
  };
}
