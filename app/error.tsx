"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error.tsx] caught:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--danger)] text-xl text-[color:var(--danger)]">
        !
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-[color:var(--text-muted)]">
        We caught an unexpected error on this page so the rest of the app keeps
        working. You can try again, or go back to the dashboard.
      </p>
      {error.digest && (
        <p className="font-mono text-[11px] text-[color:var(--text-muted)]">
          ref: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <a href="/" className="btn btn-ghost">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
