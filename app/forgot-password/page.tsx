"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(json.error ?? "Request failed");
      }
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--primary)] text-base font-bold text-[color:var(--primary-foreground)]">
            T
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">TRT Inventory</div>
            <div className="text-xs text-[color:var(--text-muted)]">
              Reset your sign-in
            </div>
          </div>
        </div>

        {submitted ? (
          <div className="card space-y-4 p-6">
            <div>
              <h1 className="text-lg font-semibold">Request sent</h1>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                If an account exists for that email, your project manager has
                been notified and can reset your password from their Team page.
              </p>
              <p className="mt-3 text-xs text-[color:var(--text-muted)]">
                You won&apos;t receive an automated email — by design. Ask your
                PM directly so they can hand you a fresh temporary password.
              </p>
            </div>
            <Link href="/login" className="btn btn-primary w-full">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card space-y-4 p-6">
            <div>
              <h1 className="text-lg font-semibold">Forgot your password?</h1>
              <p className="text-xs text-[color:var(--text-muted)]">
                Enter the email you sign in with. Your project manager will be
                notified and can issue a new temporary password.
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </label>

            {error && (
              <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-xs text-[color:var(--danger)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={busy || !email}
            >
              {busy ? "Sending…" : "Notify my PM"}
            </button>

            <div className="text-center text-xs text-[color:var(--text-muted)]">
              Remembered it?{" "}
              <Link
                href="/login"
                className="font-semibold text-[color:var(--primary)] hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
