"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const redirectTo = search.get("redirect") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Login failed");
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--primary)] text-[color:var(--primary-foreground)] text-base font-bold">
            T
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">TRT Inventory</div>
            <div className="text-xs text-[color:var(--text-muted)]">
              Order Management & Verification
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">Sign in</h1>
            <p className="text-xs text-[color:var(--text-muted)]">
              Use the credentials your project manager set up for you.
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
              suppressHydrationWarning
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              suppressHydrationWarning
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
            disabled={busy || !email || !password}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div className="text-center text-xs text-[color:var(--text-muted)]">
            <Link
              href="/forgot-password"
              className="font-semibold text-[color:var(--primary)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
