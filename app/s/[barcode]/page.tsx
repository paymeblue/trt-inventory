import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { projects, users } from '@/db/schema';
import { getCurrentUser, type AuthenticatedActor } from '@/lib/auth-guard';
import { verifyPrintedScanToken } from '@/lib/printed-scan-token';
import { runPageWithObservability } from '@/lib/observability/instrument';
import { findLogisticsGateOrderId } from '@/lib/logistics-gate-order';
import { executeLogisticsScan } from '@/lib/logistics-scan-execute';
import { executeScan } from '@/lib/scan-execute';
import {
  findDeliveryLineForSku,
  findRowsByBarcode,
  resolveOnSiteScanTarget,
} from '@/lib/resolve-onsite-scan';
import { projectReadyForOnSiteVerification } from '@/lib/project-live';
import type { ScanOutcome } from '@/lib/scan';

export const dynamic = 'force-dynamic';

/**
 * Deep-link scan endpoint.
 *
 * The PM prints a QR code (and a fallback CODE128 strip) encoding
 *   https://<app>/s/<barcode>?st=<signed-token>
 * on each order item.
 *
 * There is NO anonymous scanning. Every scan needs an iron-session
 * cookie; anyone without one is bounced to /login and returned here.
 * The `?st=` sticker token is a proof of physical-sticker authenticity
 * (signed against SESSION_SECRET, bound to this exact barcode) — it is
 * validated when present but never authorises a scan by itself.
 *
 * Role rules, strictly enforced:
 *   - Warehouse verification (project pending logistics): logistics only.
 *   - Delivery fulfillment (project active): the assigned receiver only.
 *   - PM: never verifies, never fulfills.
 *   - Super-admin: may override either step.
 */
export default async function ScanDeepLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ barcode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const h = await headers();
  return runPageWithObservability(h, () =>
    scanDeepLinkInner(params, searchParams),
  );
}

async function scanDeepLinkInner(
  params: Promise<{ barcode: string }>,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const { barcode: raw } = await params;
  const barcode = decodeURIComponent(raw).trim();
  const sp = await searchParams;
  const tokenRaw = Array.isArray(sp.st) ? sp.st[0] : sp.st;
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';

  // There is no anonymous scanning in this flow. The sticker token only
  // proves the physical sticker is genuine — it never authorises a scan
  // by itself. Every scan is performed by a logged-in session, and the
  // role decides what is allowed: verification is logistics-only,
  // fulfillment is receiver-only (super-admin can override either).
  const tokenValid = token
    ? verifyPrintedScanToken(token, barcode).ok
    : false;
  const sessionActor = await getCurrentUser();

  if (!sessionActor) {
    const path = `/s/${encodeURIComponent(barcode)}`;
    const to = token ? `${path}?st=${encodeURIComponent(token)}` : path;
    redirect(`/login?redirect=${encodeURIComponent(to)}`);
  }

  // A sticker token that fails verification means the QR is forged,
  // tampered with, or expired — refuse regardless of role.
  if (token && !tokenValid) {
    return (
      <OutcomeShell
        status="blocked"
        title="Sticker could not be authenticated"
        body="This QR carries an invalid or expired sticker token. Reprint the label from the project's print-barcodes page, or scan the barcode from inside the app."
      />
    );
  }

  const hideNavigation = false;

  const target = await resolveOnSiteScanTarget(barcode);
  if (!target) {
    const rows = await findRowsByBarcode(barcode);
    const gate = rows.find((r) => r.orderIsLogisticsGate);
    if (
      gate &&
      projectReadyForOnSiteVerification(gate.projectApprovalStatus)
    ) {
      const open = await findDeliveryLineForSku(
        gate.projectId,
        gate.productId,
      );
      if (!open) {
        return (
          <OutcomeShell
            status="blocked"
            title="Nothing left to verify"
            body={`SKU ${gate.productId} on "${gate.projectName}" is already verified on site, or this item is not on the project inventory. Open your delivery order from the dashboard if you need to review progress.`}
            hideNavigation={hideNavigation}
          />
        );
      }
    }
    return (
      <OutcomeShell
        status="blocked"
        title="Unknown barcode"
        body={`The code ${barcode} isn't part of any order in this workspace. Double-check the sticker or ask your PM to rebuild the order.`}
        hideNavigation={hideNavigation}
      />
    );
  }

  const orderHref = `/orders/${target.orderId}`;

  if (target.projectApprovalStatus === 'pending_logistics') {
    // Warehouse verification stage — logistics only (super-admin can
    // override). PMs and receivers are told to wait; nobody scans
    // anonymously.
    if (
      sessionActor.role !== 'logistics' &&
      sessionActor.role !== 'super_admin'
    ) {
      return (
        <OutcomeShell
          status="blocked"
          title="Warehouse verification is logistics-only"
          body="Logistics is still verifying this shipment in the warehouse. PMs never verify or fulfill; receivers verify on site only after logistics approves the project and the PM creates a delivery order."
        />
      );
    }

    // Deep-link execution requires the signed sticker token — proof the
    // physical sticker on the box is genuine. Without one, logistics
    // verifies through the in-app warehouse scanner instead.
    if (!tokenValid) {
      redirect(
        `/projects/${target.projectId}/logistics-scan?scan=${encodeURIComponent(barcode)}`,
      );
    }

    const actor: AuthenticatedActor = sessionActor;

    const gateOrderId = await findLogisticsGateOrderId(target.projectId);
    if (!gateOrderId) {
      return (
        <OutcomeShell
          status="blocked"
          title="Warehouse list not ready"
          body="This project has no logistics gate shipment yet. Ask super-admin to approve the project again or refresh the logistics queue."
          hideNavigation={hideNavigation}
        />
      );
    }

    const logisticsResult = await executeLogisticsScan({
      orderId: gateOrderId,
      barcode,
      actor,
    });

    if (logisticsResult.kind === 'wrong_project_status') {
      return (
        <OutcomeShell
          status="blocked"
          title="Not awaiting warehouse scans"
          body="This project is no longer in the logistics verification step."
          hideNavigation={hideNavigation}
        />
      );
    }
    if (logisticsResult.kind !== 'ok') {
      return (
        <OutcomeShell
          status="blocked"
          title="Warehouse scan failed"
          body="Could not record this packing QR. Open Warehouse scan from the Awaiting logistics queue and try again."
          hideNavigation={hideNavigation}
        />
      );
    }

    const wh = logisticsResult.outcome;
    const whTitle =
      wh.result === 'valid'
        ? 'Warehouse line recorded'
        : wh.result === 'duplicate'
          ? 'Already scanned in warehouse'
          : 'Unknown code for this shipment';
    const whBody =
      wh.result === 'valid'
        ? `SKU ${logisticsResult.sku ?? '—'} verified in the warehouse. ${logisticsResult.progress.remaining} line(s) left before you can activate the project for receivers.`
        : wh.result === 'duplicate'
          ? 'This packing QR was already counted in the warehouse scan list.'
          : 'This code is not on the logistics gate list for this project.';

    return (
      <OutcomeShell
        status={wh.result === 'valid' ? 'ok' : 'blocked'}
        title={whTitle}
        body={whBody}
        hideNavigation={hideNavigation}
      />
    );
  }

  // Delivery fulfillment — strictly the receiver's job (super-admin can
  // override). Logistics is told the item is already verified; PMs are
  // blocked outright.
  if (sessionActor.role === 'logistics') {
    return (
      <OutcomeShell
        status="blocked"
        title="Already verified in the warehouse"
        body={`This item on "${target.projectName}" has already been verified — your warehouse step is done. Only the receiver can fulfill the delivery order; logistics never fulfills. Hand the box to the assigned receiver.`}
        orderHref={orderHref}
      />
    );
  }
  if (sessionActor.role === 'pm') {
    return (
      <OutcomeShell
        status="blocked"
        title="On-site scans are receiver-only"
        body="Project Manager accounts cannot verify deliveries. Only the receiver assigned to this project can fulfill the order."
        orderHref={orderHref}
      />
    );
  }

  const result = await executeScan({
    orderId: target.orderId,
    barcode: target.itemBarcode,
    actor: sessionActor,
  });

  if (result.kind === 'order_not_found') {
    return (
      <OutcomeShell
        status="blocked"
        title="Order gone"
        body="This barcode's order was deleted after the label was printed. There's nothing to acknowledge."
        hideNavigation={hideNavigation}
      />
    );
  }
  if (result.kind === 'not_delivery_order') {
    return (
      <OutcomeShell
        status="blocked"
        title="Use a delivery order sticker"
        body="This scan target is still the warehouse checklist. Open the PM delivery order for this project and scan a line there, or scan the same warehouse sticker after a delivery order exists."
        hideNavigation={hideNavigation}
      />
    );
  }
  if (result.kind === 'order_fulfilled') {
    return (
      <OutcomeShell
        status="done"
        title="Order already fulfilled"
        body={`Order "${target.projectName}" was already completed. Nothing was changed.`}
        orderHref={orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }
  if (result.kind === 'sku_deleted') {
    return (
      <OutcomeShell
        status="blocked"
        title="Project item missing"
        body={`SKU "${result.sku}" no longer exists in this project. The scan was rolled back. Ask a PM to recreate the item or rebuild the order.`}
        orderHref={orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }
  if (result.kind === 'insufficient_stock') {
    return (
      <OutcomeShell
        status="blocked"
        title="No stock left"
        body={`SKU "${result.sku}" is already at zero on hand. The verification was not recorded. Ask a PM to restock this item on the project, then scan again.`}
        orderHref={orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }

  if (result.kind === 'installer_not_assigned') {
    const projectRow = await db.query.projects.findFirst({
      where: eq(projects.id, target.projectId),
      columns: { installerUserId: true, createdById: true },
    });
    const [assignedInstaller, pm] = await Promise.all([
      projectRow?.installerUserId
        ? db.query.users.findFirst({
            where: eq(users.id, projectRow.installerUserId),
            columns: { name: true },
          })
        : Promise.resolve(null),
      projectRow?.createdById
        ? db.query.users.findFirst({
            where: eq(users.id, projectRow.createdById),
            columns: { name: true, phone: true, email: true },
          })
        : Promise.resolve(null),
    ]);
    const parts: string[] = [
      assignedInstaller?.name
        ? `This project was assigned to ${assignedInstaller.name}, not you.`
        : 'This project is locked to a different receiver.',
    ];
    if (pm?.phone) parts.push(`Please contact the PM on ${pm.phone}`);
    if (pm?.email) {
      parts.push(pm.phone ? `or email ${pm.email}.` : `Please email the PM at ${pm.email}.`);
    }
    return (
      <OutcomeShell
        status="blocked"
        title="Not the assigned receiver"
        body={parts.join(' ')}
        orderHref={orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }

  if (result.kind === 'logistics_not_verified') {
    return (
      <OutcomeShell
        status="blocked"
        title="Not ready for on-site verification"
        body={`This project is not open for on-site verification yet (SKU ${result.sku}). If logistics has already activated it, refresh and try again — otherwise ask logistics to finish Warehouse scan and activate the project first.`}
        hideNavigation={hideNavigation}
      />
    );
  }

  if (result.kind !== 'ok') {
    return (
      <OutcomeShell
        status="blocked"
        title="Scan failed"
        body="Something went wrong. Try again or contact your PM."
        hideNavigation={hideNavigation}
      />
    );
  }

  return (
    <OutcomeView
      outcome={result.outcome}
      projectName={target.projectName}
      orderHref={orderHref}
      stock={result.stock}
      progress={result.progress}
      gateStickerNote={
        target.matchedViaGateSticker
          ? "Warehouse packing sticker accepted — applied to your open delivery order line for this SKU."
          : undefined
      }
      hideNavigation={hideNavigation}
    />
  );
}

function OutcomeView({
  outcome,
  projectName,
  orderHref,
  stock,
  progress,
  gateStickerNote,
  hideNavigation,
}: {
  outcome: ScanOutcome;
  projectName: string;
  orderHref?: string;
  stock?: { sku: string; stockQuantity: number };
  progress: { scanned: number; total: number; percent: number };
  gateStickerNote?: string;
  hideNavigation?: boolean;
}) {
  if (outcome.result === 'valid') {
    const done = progress.scanned === progress.total;
    return (
      <OutcomeShell
        status={done ? 'complete' : 'ok'}
        title={done ? 'Order fulfilled' : 'Item verified'}
        body={
          done
            ? `Every item on "${projectName}" has been scanned. The delivery order is fulfilled and stock is updated.`
            : `Scan recorded on "${projectName}". ${progress.scanned}/${progress.total} items verified (${progress.percent}%).${gateStickerNote ? ` ${gateStickerNote}` : ''}`
        }
        stock={stock}
        orderHref={orderHref}
        autoOpen={!done && !!orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }

  if (outcome.result === 'duplicate') {
    return (
      <OutcomeShell
        status="warn"
        title="Already scanned"
        body={`This item on "${projectName}" was already acknowledged earlier. Nothing was changed.`}
        orderHref={orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }

  return (
    <OutcomeShell
      status="blocked"
      title="Not part of this order"
      body={`Barcode ${outcome.barcode} wasn't expected on "${projectName}". The order has been flagged as an anomaly for your PM to review.`}
      orderHref={orderHref}
      hideNavigation={hideNavigation}
    />
  );
}

type OutcomeStatus = 'ok' | 'complete' | 'warn' | 'blocked' | 'done';

function OutcomeShell({
  status,
  title,
  body,
  orderHref,
  stock,
  autoOpen,
  hideNavigation,
}: {
  status: OutcomeStatus;
  title: string;
  body: string;
  orderHref?: string;
  stock?: { sku: string; stockQuantity: number };
  autoOpen?: boolean;
  /**
   * For the printed-sticker (token) path: the installer has no session,
   * so any internal link would bounce them to /login. Hide the entire
   * nav row + auto-redirect when this is true.
   */
  hideNavigation?: boolean;
}) {
  const palette: Record<
    OutcomeStatus,
    { border: string; chip: string; icon: string }
  > = {
    ok: {
      border: 'border-[color:var(--success)]',
      chip: 'bg-[color:var(--success)] text-white',
      icon: '✓',
    },
    complete: {
      border: 'border-[color:var(--success)]',
      chip: 'bg-[color:var(--success)] text-white',
      icon: '✓',
    },
    done: {
      border: 'border-[color:var(--border)]',
      chip: 'bg-[color:var(--text-muted)] text-white',
      icon: '✓',
    },
    warn: {
      border: 'border-[color:var(--warning)]',
      chip: 'bg-[color:var(--warning)] text-white',
      icon: '↺',
    },
    blocked: {
      border: 'border-[color:var(--danger)]',
      chip: 'bg-[color:var(--danger)] text-white',
      icon: '!',
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
                Project stock for <span className="font-mono">{stock.sku}</span>{' '}
                is now <strong>{stock.stockQuantity}</strong>.
              </p>
            )}
          </div>
        </div>
        {!hideNavigation && (
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
        )}
        {hideNavigation && (
          <p className="mt-6 text-center text-xs text-[color:var(--text-muted)]">
            You can close this tab.
          </p>
        )}
        {autoOpen && orderHref && !hideNavigation && (
          // Progressive enhancement: on success, auto-navigate to the order
          // page after a short delay so the installer sees the running list
          // of scans rather than sitting on a "scan one more" dead-end.
          <meta httpEquiv="refresh" content={`2;url=${orderHref}`} />
        )}
      </div>
    </div>
  );
}
