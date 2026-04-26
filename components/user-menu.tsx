"use client";

import clsx from "clsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { playThemeToggleSound } from "@/lib/theme-toggle-sound";
import { useTheme } from "./theme-context";
import type { SessionUser } from "./session-context";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function UserMenu({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => void;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { choice, resolved, toggle } = useTheme();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    const onPointer = (e: Event) => {
      const el = rootRef.current;
      const t = e.target;
      if (el && t instanceof Node && !el.contains(t)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, close]);

  const onThemeSwitch = () => {
    const goingDark = resolved !== "dark";
    playThemeToggleSound(goingDark);
    toggle();
  };

  const appearanceHint =
    choice === "system" ? "Following system setting" : "Fixed light or dark";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="flex max-w-[min(100vw-8rem,20rem)] items-center gap-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--primary)] text-xs font-bold text-[color:var(--primary-foreground)]"
          aria-hidden
        >
          {initialsFromName(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">
            {user.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[color:var(--text-muted)]">
            {user.email}
          </span>
        </span>
        <span
          className={`pill hidden shrink-0 sm:inline-flex ${user.role === "pm" ? "pill-active" : "pill-fulfilled"}`}
        >
          {user.role === "pm" ? "PM" : "Installer"}
        </span>
        <span
          className="shrink-0 text-[color:var(--text-muted)] transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 z-50 mt-2 w-[min(calc(100vw-2rem),18rem)] rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-[var(--shadow-card)]"
        >
          <div className="border-b border-[color:var(--border)] pb-3">
            <p className="text-sm font-semibold leading-tight">{user.name}</p>
            <p className="mt-1 break-all text-xs text-[color:var(--text-muted)]">
              {user.email}
            </p>
            <p className="mt-2">
              <span
                className={`pill ${user.role === "pm" ? "pill-active" : "pill-fulfilled"}`}
              >
                {user.role === "pm" ? "PM" : "Installer"}
              </span>
            </p>
          </div>

          <div className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">Dark mode</p>
                <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                  {appearanceHint}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={resolved === "dark"}
                onClick={onThemeSwitch}
                className={clsx(
                  "relative h-7 w-12 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]",
                  resolved === "dark"
                    ? "border-[color:var(--primary)] bg-[color:var(--primary)]"
                    : "border-[color:var(--border)] bg-[color:var(--surface-muted)]",
                )}
                suppressHydrationWarning
              >
                <span
                  className={clsx(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-sm transition-transform",
                    resolved === "dark"
                      ? "translate-x-5 bg-[color:var(--primary-foreground)]"
                      : "translate-x-0 bg-[color:var(--surface)]",
                  )}
                  suppressHydrationWarning
                />
                <span className="sr-only">
                  {resolved === "dark" ? "On" : "Off"}
                </span>
              </button>
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            className="btn btn-ghost w-full justify-center text-xs"
            onClick={() => {
              close();
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
