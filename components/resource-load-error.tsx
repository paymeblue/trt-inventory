"use client";

/**
 * Recoverable load failure — network or 5xx — with icon + retry.
 */
export function ResourceLoadError({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  isRetrying = false,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
}) {
  return (
    <div
      className="card flex flex-col gap-4 border-[color:var(--danger)] p-6 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex gap-4">
        <span className="shrink-0 text-[color:var(--danger)]" aria-hidden>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={40}
            height={40}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </span>
        <div>
          <h2 className="text-base font-semibold text-[color:var(--text)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {message}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary shrink-0 self-start sm:self-center"
        onClick={onRetry}
        disabled={isRetrying}
      >
        {isRetrying ? "Retrying…" : retryLabel}
      </button>
    </div>
  );
}
