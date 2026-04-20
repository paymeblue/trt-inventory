"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthedUser } from "@/components/session-context";

export default function NewOrderPage() {
  const router = useRouter();
  const user = useAuthedUser();
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const { role } = user;

  if (role !== "pm") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">PM only</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Installers don&apos;t create orders. Head back to{" "}
          <Link
            href="/orders"
            className="font-semibold text-[color:var(--primary)]"
          >
            Orders
          </Link>
          .
        </p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectName: projectName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create order");
      router.push(`/orders/${json.order.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New order</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Name the project. On the next screen you&apos;ll pick warehouse SKUs,
          print their barcodes, and hand the order off to an installer to scan.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Project name
          </span>
          <input
            autoFocus
            required
            className="input"
            placeholder="e.g. Lekki Phase 2 – Block C"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            maxLength={120}
          />
        </label>

        {error && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/orders")}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || projectName.trim().length === 0}
          >
            {busy ? "Creating…" : "Create order"}
          </button>
        </div>
      </form>
    </div>
  );
}
