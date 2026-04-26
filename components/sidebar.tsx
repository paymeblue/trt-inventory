"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "./session-context";
import type { Role } from "@/db/schema";

const navMain: { href: string; label: string; icon: string; roles: Role[] }[] =
  [
    { href: "/", label: "Dashboard", icon: "◆", roles: ["pm", "installer"] },
    { href: "/projects", label: "Projects", icon: "▥", roles: ["pm", "installer"] },
    { href: "/orders", label: "Orders", icon: "▤", roles: ["pm", "installer"] },
    { href: "/orders/new", label: "New Order", icon: "✚", roles: ["pm"] },
    { href: "/scan", label: "Verify deliveries", icon: "⎚", roles: ["installer"] },
    { href: "/team", label: "Team", icon: "◎", roles: ["pm"] },
  ];

const helpLinks: { href: string; label: string; icon: string }[] = [
  { href: "/help", label: "How it works", icon: "?" },
  { href: "/help/constraints", label: "Rules & constraints", icon: "≡" },
];

function helpLinkActive(pathname: string, href: string) {
  if (href === "/help") {
    return pathname === "/help";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pathIsUnderHelp(pathname: string) {
  return pathname === "/help" || pathname.startsWith("/help/");
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  const underHelp = pathIsUnderHelp(pathname);
  const [helpOpen, setHelpOpen] = useState(false);
  const nav = user ? navMain.filter((n) => n.roles.includes(user.role)) : [];

  if (!user) return null;

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col overflow-hidden border-r border-[color:var(--border)] bg-[color:var(--surface)] md:flex">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[color:var(--border)] px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--primary)] text-sm font-bold text-[color:var(--primary-foreground)]">
          T
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">TRT Inventory</div>
          <div className="text-xs text-[color:var(--text-muted)]">OMVS</div>
        </div>
      </div>

      <nav
        className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-5"
        aria-label="Main navigation"
      >
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                  : "text-[color:var(--text)] hover:bg-[color:var(--surface-muted)]"
              }`}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-[color:var(--border)] bg-[color:var(--surface)] px-3 pb-4 pt-3">
        <div
          className={`rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]/70 ${underHelp && !helpOpen ? "ring-2 ring-[color:var(--primary)]/35" : ""}`}
        >
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[color:var(--text)] outline-none transition-colors hover:bg-[color:var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-inset"
            aria-expanded={helpOpen}
            aria-controls="sidebar-help-links"
            id="sidebar-help-trigger"
            onClick={() => setHelpOpen((o) => !o)}
          >
            <span className="flex items-center gap-2">
              <span className="w-5 text-center text-base" aria-hidden>
                ?
              </span>
              Help & documentation
            </span>
            <span
              className={`text-xs text-[color:var(--text-muted)] transition-transform ${helpOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▼
            </span>
          </button>
          {helpOpen ? (
            <div
              id="sidebar-help-links"
              role="region"
              aria-labelledby="sidebar-help-trigger"
              className="space-y-0.5 border-t border-[color:var(--border)] px-2 py-2"
            >
              {helpLinks.map((item) => {
                const active = helpLinkActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                        : "text-[color:var(--text)] hover:bg-[color:var(--surface)]"
                    }`}
                  >
                    <span className="w-5 text-center text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <section
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/80 p-3 text-xs leading-snug text-[color:var(--text-muted)]"
          aria-label="Technical constraints summary"
        >
          <div className="font-semibold text-[color:var(--text)]">
            Role constraints
          </div>
          <p className="mt-1.5">
            <strong className="text-[color:var(--text)]">PM:</strong> projects,
            orders, team. No in-app scans. New orders only on projects with no
            prior verifications or fulfilled orders.
          </p>
          <p className="mt-1.5">
            <strong className="text-[color:var(--text)]">Installer:</strong>{" "}
            verify deliveries only; sticker URLs can verify without login when
            signed.
          </p>
        </section>

        <div className="px-1 text-xs text-[color:var(--text-muted)]">
          Order Management & Verification System
        </div>
      </div>
    </aside>
  );
}
