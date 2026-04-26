import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-guard";
import { runPageWithObservability } from "@/lib/observability/instrument";
import { executeScan, findOrderByBarcode } from "@/lib/scan-execute";
import type { ScanOutcome } from "@/lib/scan";

export const dynamic = "force-dynamic";

/**
 * Deep-link scan endpoint.
 *
 * Intended flow: a PM prints a QR code encoding
 *   https://<app>/s/<barcode>
 * on each order item. An installer scans it with any phone camera → the
 * native camera app opens this URL → this server component:
 *   1. forces auth (redirects to /login?redirect=... if anonymous)
 *   2. locates the order the barcode belongs to
 *   3. runs the same transactional scan that the manual flow uses
 *   4. renders an outcome page with a link to the full order view
 *
 * No manual typing. No pasting. No knowing the order id.
 */
export default async function ScanDeepLinkPage({
  params,
}: {
  params: Promise<{ barcode: string }>;
}) {
  const h = await headers();
  return runPageWithObservability(h, () => scanDeepLinkInner(params));
}

async function scanDeepLinkInner(params: Promise<{ barcode: string }>) {
  const { barcode: raw } = await params;
  const barcode = decodeURIComponent(raw).trim();

  const actor = await getCurrentUser();
  if (!actor) {
    const to = `/s/${encodeURIComponent(barcode)}`;
    redirect(`/login?redirect=${encodeURIComponent(to)}`);
  }

  if (actor.role !== "installer") {
    // PMs aren't allowed to "acknowledge" inventory — but don't surface a
    // scary 403, just tell them why.
    return (
      <OutcomeShell
        status="blocked"
        title="Scans are installer-only"
        body="Your account is a Project Manager. Only installer accounts can acknowledge deliveries. Ask your PM to log in as the installer that owns this route."
      />
    );
  }

  const lookup = await findOrderByBarcode(barcode);
  if (!lookup) {
    return (
      <OutcomeShell
        status="blocked"
        title="Unknown barcode"
        body={`The code ${barcode} isn't part of any order in this workspace. Double-check the sticker or ask your PM to rebuild the order.`}
      />
    );
  }

  const result = await executeScan({
    orderId: lookup.orderId,
    barcode,
    actor,
  });

  const orderHref = `/orders/${lookup.orderId}`;

  if (result.kind === "order_not_found") {
    return (
      <OutcomeShell
        status="blocked"
        title="Order gone"
        body="This barcode's order was deleted after the label was printed. There's nothing to acknowledge."
      />
    );
  }
  if (result.kind === "order_fulfilled") {
    return (
      <OutcomeShell
        status="done"
        title="Order already fulfilled"
        body={`Order "${lookup.projectName}" was already completed. Nothing was changed.`}
        orderHref={orderHref}
      />
    );
  }
  if (result.kind === "sku_deleted") {
    return (
      <OutcomeShell
        status="blocked"
        title="Project item missing"
        body={`SKU "${result.sku}" no longer exists in this project. The scan was rolled back. Ask a PM to recreate the item or rebuild the order.`}
        orderHref={orderHref}
      />
    );
  }

  return (
    <OutcomeView
      outcome={result.outcome}
      projectName={lookup.projectName}
      orderHref={orderHref}
      stock={result.stock}
      progress={result.progress}
    />
  );
}

function OutcomeView({
  outcome,
  projectName,
  orderHref,
  stock,
  progress,
}: {
  outcome: ScanOutcome;
  projectName: string;
  orderHref: string;
  stock?: { sku: string; stockQuantity: number };
  progress: { scanned: number; total: number; percent: number };
}) {
  if (outcome.result === "valid") {
    const done = progress.scanned === progress.total;
    return (
      <OutcomeShell
        status={done ? "complete" : "ok"}
        title={done ? "Order resolved" : "Item acknowledged"}
        body={
          done
            ? `Every item on "${projectName}" has been scanned. The order is now marked fulfilled and the project's item stock is up to date.`
            : `Scan recorded on "${projectName}". ${progress.scanned}/${progress.total} items verified (${progress.percent}%).`
        }
        stock={stock}
        orderHref={orderHref}
        autoOpen={!done}
      />
    );
  }

  if (outcome.result === "duplicate") {
    return (
      <OutcomeShell
        status="warn"
        title="Already scanned"
        body={`This item on "${projectName}" was already acknowledged earlier. Nothing was changed.`}
        orderHref={orderHref}
      />
    );
  }

  return (
    <OutcomeShell
      status="blocked"
      title="Not part of this order"
      body={`Barcode ${outcome.barcode} wasn't expected on "${projectName}". The order has been flagged as an anomaly for your PM to review.`}
      orderHref={orderHref}
    />
  );
}

type OutcomeStatus = "ok" | "complete" | "warn" | "blocked" | "done";

function OutcomeShell({
  status,
  title,
  body,
  orderHref,
  stock,
  autoOpen,
}: {
  status: OutcomeStatus;
  title: string;
  body: string;
  orderHref?: string;
  stock?: { sku: string; stockQuantity: number };
  autoOpen?: boolean;
}) {
  const palette: Record<OutcomeStatus, { border: string; chip: string; icon: string }> = {
    ok: {
      border: "border-[color:var(--success)]",
      chip: "bg-[color:var(--success)] text-white",
      icon: "✓",
    },
    complete: {
      border: "border-[color:var(--success)]",
      chip: "bg-[color:var(--success)] text-white",
      icon: "✓",
    },
    done: {
      border: "border-[color:var(--border)]",
      chip: "bg-[color:var(--text-muted)] text-white",
      icon: "✓",
    },
    warn: {
      border: "border-[color:var(--warning)]",
      chip: "bg-[color:var(--warning)] text-white",
      icon: "↺",
    },
    blocked: {
      border: "border-[color:var(--danger)]",
      chip: "bg-[color:var(--danger)] text-white",
      icon: "!",
    },
  };
  const p = palette[status];
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center p-6">
      <div className={`card w-full p-6 ${p.border}`}>
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${p.chip}`}
          >
            {p.icon}
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-[color:var(--text)]">{body}</p>
            {stock && (
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                Project stock for{" "}
                <span className="font-mono">{stock.sku}</span> is now{" "}
                <strong>{stock.stockQuantity}</strong>.
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {orderHref && (
            <Link href={orderHref} className="btn btn-primary text-sm">
              Open order
            </Link>
          )}
          <Link href="/" className="btn btn-ghost text-sm">
            Dashboard
          </Link>
        </div>
        {autoOpen && orderHref && (
          // Progressive enhancement: on success, auto-navigate to the order
          // page after a short delay so the installer sees the running list
          // of scans rather than sitting on a "scan one more" dead-end.
          <meta httpEquiv="refresh" content={`2;url=${orderHref}`} />
        )}
      </div>
    </div>
  );
}
