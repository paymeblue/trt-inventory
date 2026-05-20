import {
  QrCodeLoader,
  type QrCodeLoaderProps,
} from "@/components/qr-code-loader";

export interface PageLoadingProps {
  message?: string;
  /** Center in a min-height region (default true). */
  centered?: boolean;
  loader?: Pick<QrCodeLoaderProps, "size" | "theme" | "label">;
  className?: string;
}

/**
 * Standard page/section loading state with the animated QR loader.
 */
export function PageLoading({
  message = "Loading…",
  centered = true,
  loader,
  className = "",
}: PageLoadingProps) {
  const wrap = centered
    ? "flex min-h-[12rem] flex-col items-center justify-center gap-4 py-10"
    : "flex flex-col items-start gap-3 py-4";

  return (
    <div className={`${wrap} ${className}`.trim()} role="status" aria-live="polite">
      <QrCodeLoader size={loader?.size ?? 120} theme={loader?.theme} label={loader?.label ?? message} />
      {message ? (
        <p className="text-center text-sm text-[color:var(--text-muted)]">{message}</p>
      ) : null}
    </div>
  );
}
