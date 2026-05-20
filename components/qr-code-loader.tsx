import type { CSSProperties } from "react";
import "./qr-code-loader.css";

export interface QrCodeLoaderTheme {
  bg?: string;
  border?: string;
  block?: string;
  blockMid?: string;
  laser?: string;
  shadow?: string;
}

export interface QrCodeLoaderProps {
  /** Square size in pixels (default 150). */
  size?: number;
  className?: string;
  /** Screen-reader label (default "Loading"). */
  label?: string;
  /** Override animation colors without editing CSS. */
  theme?: QrCodeLoaderTheme;
  /** Drop the drop shadow (inline / button use). */
  flat?: boolean;
}

/**
 * Animated QR-style loader with staggered blocks and a scanning laser.
 * Customize via `size`, `theme`, or CSS variables on `.qr-code-loader`.
 */
export function QrCodeLoader({
  size = 150,
  className = "",
  label = "Loading",
  theme,
  flat = false,
}: QrCodeLoaderProps) {
  const style: CSSProperties & Record<string, string> = {
    "--qr-loader-size": `${size}px`,
  };
  if (flat) style["--qr-loader-shadow"] = "none";
  if (theme?.bg) style["--qr-loader-bg"] = theme.bg;
  if (theme?.border) style["--qr-loader-border"] = theme.border;
  if (theme?.block) style["--qr-loader-block"] = theme.block;
  if (theme?.blockMid) style["--qr-loader-block-mid"] = theme.blockMid;
  if (theme?.laser) style["--qr-loader-laser"] = theme.laser;
  if (theme?.shadow) style["--qr-loader-shadow"] = theme.shadow;

  return (
    <div
      className={`qr-code-loader ${className}`.trim()}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="qr-code-loader__grid" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="qr-code-loader__block" />
        ))}
      </div>
      <span className="qr-code-loader__laser" aria-hidden />
    </div>
  );
}
