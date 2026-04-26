"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuthedUser } from "@/components/session-context";

const HelpConstraintsExcalidrawBlock = dynamic(
  () => import("@/components/help-constraints-excalidraw-block"),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[520px] animate-pulse rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]"
        aria-hidden
      />
    ),
  },
);

/**
 * Technical reference for operators and engineers: hard rules enforced by
 * the API and UI. User-facing walkthroughs live on /help.
 */
export default function HelpConstraintsPage() {
  const user = useAuthedUser();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <nav className="text-xs font-semibold text-[color:var(--primary)]">
        <Link href="/help" className="hover:underline">
          ← How it works
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Rules & technical constraints</h1>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          What each role may do, what the server rejects, and how inventory
          stays consistent. These are enforced in API routes and middleware,
          not only in the UI.
        </p>
      </div>

      <section className="card p-6">
        <HelpConstraintsExcalidrawBlock />
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold">Project Manager</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--text-muted)]">
          <li>
            <strong className="text-[color:var(--text)]">Projects & SKUs:</strong>{" "}
            Can create projects, add/edit/delete items (SKUs) on a project, and
            rename the project. SKUs are unique <em>per project</em> only.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Team:</strong> Can create
            installer accounts, reset passwords, and manage users (PM-only APIs).
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Orders:</strong> Can
            create orders only for projects that have{" "}
            <strong>no fulfilled order</strong> and{" "}
            <strong>no verified line</strong> (no <code className="font-mono text-xs">scanned_at</code> on any order item under that project). Prevents a second dispatch from decrementing the same project stock twice.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">New order contents:</strong>{" "}
            Creating an order copies <strong>every current SKU</strong> on that
            project onto the order with a unique barcode each.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Before first scan:</strong>{" "}
            May add extra SKUs to the order or remove lines. After any item on
            that order has been verified, may not add or remove lines.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Delete order:</strong>{" "}
            Allowed only if <strong>no</strong> order item has been verified yet.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Scanning:</strong>{" "}
            Cannot call the in-app order scan API (<code className="font-mono text-xs">POST /api/orders/[id]/scan</code>
            ) — that is <strong>installer-only</strong>. A PM opening a bare
            deep link <code className="font-mono text-xs">/s/[barcode]</code>{" "}
            without a valid printed-sticker token sees a blocked message (not a
            silent success).
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Read access:</strong>{" "}
            Can view projects, orders, stats, and order detail like installers,
            but edit paths above are PM-only where noted.
          </li>
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold">Installer</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--text-muted)]">
          <li>
            <strong className="text-[color:var(--text)]">Verification:</strong>{" "}
            Can verify items via{" "}
            <code className="font-mono text-xs">POST /api/orders/[id]/scan</code>{" "}
            (in-app camera, keyboard, or USB scanner) when signed in.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Printed stickers:</strong>{" "}
            URLs like <code className="font-mono text-xs">/s/[barcode]?st=…</code>{" "}
            carry a signed token: opening them in a phone browser can record a
            verification <strong>without logging in</strong>, as a synthetic
            &quot;Printed sticker&quot; actor (no user FK on that movement).
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Deep link without token:</strong>{" "}
            If not signed in, the app redirects to login and returns to the same
            URL. If signed in as PM, scan via <code className="font-mono text-xs">/s/…</code>{" "}
            without a token is blocked.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Cannot:</strong> Create
            projects, create orders, add/remove order lines, manage team, or
            delete orders.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Orders:</strong> May
            only work with orders that are <strong>active</strong> or{" "}
            <strong>anomaly</strong> (still verifiable). Fulfilled orders are
            closed for new verifications through the normal scan path.
          </li>
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold">Inventory & orders (both roles)</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--text-muted)]">
          <li>
            <strong className="text-[color:var(--text)]">Stock:</strong> Each
            successful verification decrements{" "}
            <code className="font-mono text-xs">stock_quantity</code> for that
            SKU on the <strong>project</strong> by 1. Multiple orders on the same
            project share one stock counter per SKU — verifications on any order
            all apply to the same row.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Negative stock:</strong>{" "}
            If verifications exceed configured stock, quantities can go negative;
            the dashboard warns when any SKU is below zero.
          </li>
          <li>
            <strong className="text-[color:var(--text)]">Order lifecycle:</strong>{" "}
            When the last pending line is verified, the order becomes{" "}
            <strong>fulfilled</strong>. Invalid barcodes can set{" "}
            <strong>anomaly</strong> while work continues.
          </li>
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold">Authentication</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[color:var(--text-muted)]">
          <li>
            Unauthenticated browser navigations go to{" "}
            <code className="font-mono text-xs">/login?redirect=…</code>.
          </li>
          <li>
            Unauthenticated API calls return <strong>401 JSON</strong>, not an
            HTML redirect.
          </li>
          <li>
            Session handoff and auth endpoints are documented in{" "}
            <code className="font-mono text-xs">lib/auth-routing.ts</code>.
          </li>
        </ul>
      </section>

      <p className="text-xs text-[color:var(--text-muted)]">
        Signed in as <span className="font-mono">{user.role}</span>. For the
        step-by-step guide, see{" "}
        <Link href="/help" className="font-semibold text-[color:var(--primary)] hover:underline">
          How it works
        </Link>
        .
      </p>
    </div>
  );
}
