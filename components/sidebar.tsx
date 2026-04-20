"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./session-context";
import type { Role } from "@/db/schema";

const navAll: { href: string; label: string; icon: string; roles: Role[] }[] = [
  { href: "/", label: "Dashboard", icon: "◆", roles: ["pm", "installer"] },
  { href: "/orders", label: "Orders", icon: "▤", roles: ["pm", "installer"] },
  { href: "/orders/new", label: "New Order", icon: "✚", roles: ["pm"] },
  { href: "/scan", label: "Scan", icon: "⎚", roles: ["installer"] },
  { href: "/warehouse", label: "Warehouse", icon: "▥", roles: ["pm"] },
  { href: "/team", label: "Team", icon: "◎", roles: ["pm"] },
  { href: "/help", label: "How it works", icon: "?", roles: ["pm", "installer"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  if (!user) return null;
  const nav = navAll.filter((n) => n.roles.includes(user.role));

  return (
    <aside className="hidden w-64 shrink-0 border-r border-[color:var(--border)] bg-[color:var(--surface)] md:flex md:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-[color:var(--border)] px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--primary)] text-[color:var(--primary-foreground)] text-sm font-bold">
          T
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">TRT Inventory</div>
          <div className="text-xs text-[color:var(--text-muted)]">OMVS</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
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

      <div className="border-t border-[color:var(--border)] px-6 py-4 text-xs text-[color:var(--text-muted)]">
        Order Management & Verification System
      </div>
    </aside>
  );
}
