"use client";

import { useSession } from "./session-context";
import { ThemeToggle } from "./theme-toggle";

export function Topbar() {
  const { user, logout } = useSession();

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 md:px-10">
      <div>
        <div className="text-base font-semibold leading-tight">
          Order Management & Verification
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          Barcode-driven logistics tracking
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        {user && (
          <>
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-[color:var(--text-muted)]">
                {user.email}
              </div>
            </div>
            <span
              className={`pill ${
                user.role === "pm" ? "pill-active" : "pill-fulfilled"
              }`}
            >
              {user.role === "pm" ? "PM" : "Installer"}
            </span>
            <button
              onClick={logout}
              className="btn btn-ghost text-xs"
              suppressHydrationWarning
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
