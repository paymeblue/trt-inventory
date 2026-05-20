"use client";

import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  FolderIcon,
  LightBulbIcon,
  PlusCircleIcon,
  QrCodeIcon,
  ScaleIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  TruckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentType, type SVGProps } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "./session-context";
import type { Role } from "@/db/schema";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

function SidebarGlyph({ Icon }: { Icon: IconComponent }) {
  return <Icon className="h-5 w-5 shrink-0" aria-hidden />;
}

type NavItem = {
  href: string;
  label: string;
  Icon: IconComponent;
  roles: Role[];
};

const navMain: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    Icon: Squares2X2Icon,
    roles: ["pm", "installer", "super_admin", "logistics"],
  },
  {
    href: "/projects",
    label: "Projects",
    Icon: FolderIcon,
    roles: ["pm", "installer", "super_admin", "logistics"],
  },
  {
    href: "/orders",
    label: "Orders",
    Icon: ClipboardDocumentListIcon,
    roles: ["pm", "installer", "super_admin", "logistics"],
  },
  {
    href: "/orders/new",
    label: "New Order",
    Icon: PlusCircleIcon,
    roles: ["pm", "super_admin"],
  },
  {
    href: "/scan",
    label: "Verify deliveries",
    Icon: QrCodeIcon,
    roles: ["installer"],
  },
  {
    href: "/disputes",
    label: "Disputes",
    Icon: ChatBubbleLeftRightIcon,
    roles: ["pm", "installer", "super_admin", "logistics"],
  },
  {
    href: "/team",
    label: "Team",
    Icon: UserGroupIcon,
    roles: ["pm", "super_admin"],
  },
  {
    href: "/approvals/super-admin",
    label: "Pending approval (SA)",
    Icon: ShieldCheckIcon,
    roles: ["super_admin"],
  },
  {
    href: "/approvals/logistics",
    label: "Awaiting logistics",
    Icon: TruckIcon,
    roles: ["logistics", "super_admin"],
  },
];

const helpLinks: { href: string; label: string; Icon: IconComponent }[] = [
  { href: "/help", label: "How it works", Icon: LightBulbIcon },
  { href: "/help/constraints", label: "Rules & constraints", Icon: ScaleIcon },
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

  const { data: qc } = useQuery({
    queryKey: queryKeys.approvalsQueueCounts,
    queryFn: () =>
      fetchJson<{
        superAdminProjects: number;
        logisticsProjects: number;
        superAdminDisputes?: number;
      }>("/api/approvals/queue-counts"),
    enabled:
      !!user && (user.role === "super_admin" || user.role === "logistics"),
    staleTime: 0,
    /** Fallback poll when another tab or role changes queues; mutations invalidate immediately. */
    refetchInterval: 20_000,
  });

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
          const { Icon } = item;
          let queueBadge: number | undefined;
          if (user.role === "super_admin") {
            if (item.href === "/approvals/super-admin") {
              queueBadge = qc?.superAdminProjects;
            } else if (item.href === "/disputes") {
              queueBadge = qc?.superAdminDisputes;
            } else if (item.href === "/approvals/logistics") {
              queueBadge = qc?.logisticsProjects;
            }
          } else if (
            item.href === "/approvals/logistics" &&
            user.role === "logistics"
          ) {
            queueBadge = qc?.logisticsProjects;
          }
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
              <SidebarGlyph Icon={Icon} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {typeof queueBadge === "number" && queueBadge > 0 ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${
                    active
                      ? "bg-white/25 text-[color:var(--primary-foreground)]"
                      : "bg-[color:var(--danger)] text-white"
                  }`}
                >
                  {queueBadge > 99 ? "99+" : queueBadge}
                </span>
              ) : null}
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
            <span className="flex min-w-0 items-center gap-2">
              <SidebarGlyph Icon={BookOpenIcon} />
              <span className="truncate">Help & documentation</span>
            </span>
            <ChevronDownIcon
              className={`h-4 w-4 shrink-0 text-[color:var(--text-muted)] transition-transform ${helpOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
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
                const { Icon } = item;
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
                    <SidebarGlyph Icon={Icon} />
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
            <strong className="text-[color:var(--text)]">Logistics:</strong>{" "}
            fulfillment queue and project activation after super-admin approval.
          </p>
          <p className="mt-1.5">
            <strong className="text-[color:var(--text)]">Super admin:</strong>{" "}
            approves new projects before they reach logistics and receivers.
          </p>
        </section>

        <div className="px-1 text-xs text-[color:var(--text-muted)]">
          Order Management & Verification System
        </div>
      </div>
    </aside>
  );
}
