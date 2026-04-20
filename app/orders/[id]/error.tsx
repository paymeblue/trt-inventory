"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function OrderDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[orders/[id]/error.tsx] caught:", error);
  }, [error]);

  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--danger)] text-xl text-[color:var(--danger)]">
        !
      </div>
      <h1 className="text-lg font-semibold">Couldn&apos;t load this order</h1>
      <p className="mt-2 text-sm text-[color:var(--text-muted)]">
        Something broke while rendering this order. Nothing about the order
        itself was changed — it&apos;s safe to retry.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-[color:var(--text-muted)]">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={reset} className="btn btn-primary">
          Retry
        </button>
        <Link href="/orders" className="btn btn-ghost">
          Back to orders
        </Link>
      </div>
    </div>
  );
}
