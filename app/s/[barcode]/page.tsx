import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser, type AuthenticatedActor } from '@/lib/auth-guard';
import { getPrintedScanActor } from '@/lib/printed-scan-actor';
import { verifyPrintedScanToken } from '@/lib/printed-scan-token';
import { runPageWithObservability } from '@/lib/observability/instrument';
import { findLogisticsGateOrderId } from '@/lib/logistics-gate-order';
import { executeLogisticsScan } from '@/lib/logistics-scan-execute';
import { executeScan } from '@/lib/scan-execute';
import {
  findOrderByBarcode,
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
 * Two ways the request gets authorised:
 *
 *  A. **Printed-sticker token** (the zero-friction path used by 3rd-party
 *     phone scanners like QR Bot). `?st=…` is signed against this server's
 *     `SESSION_SECRET` and bound to the exact `barcode` in the URL path.
 *     A valid token resolves the scan as a synthetic "Printed sticker"
 *     actor — the installer never sees a login screen.
 *
 *  B. **Iron-session cookie** (the in-app path, also used as a fallback
 *     when the token is missing/expired). If neither is present, we
 *     bounce to `/login?redirect=…` so the installer signs in once and
 *     comes right back.
 *
 * Either way the same transactional `executeScan` runs, decrementing
 * stock and writing the audit row.
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

  // Resolve the scanning actor. The printed-sticker token is treated as
  // primary: if it verifies against this exact barcode, the sticker
  // itself authorises the scan (that's the whole point of the token —
  // a 3rd-party phone scanner like QR Bot opens the URL in a browser
  // that has no session and the scan must still go through).
  //
  // We only fall back to the iron-session cookie when no token was
  // supplied at all, which preserves the original "installer signed
  // in, opening /s/<barcode> directly" path.
  let actor: AuthenticatedActor | null = null;
  if (token) {
    const verified = verifyPrintedScanToken(token, barcode);
    if (verified.ok) {
      actor = getPrintedScanActor();
    }
  }

  if (!actor) {
    const sessionActor = await getCurrentUser();
    if (sessionActor?.role === 'logistics') {
      const early = await findOrderByBarcode(barcode);
      if (early) {
        redirect(
          `/projects/${early.projectId}/logistics-scan?scan=${encodeURIComponent(barcode)}`,
        );
      }
    }
    if (sessionActor && sessionActor.role === 'installer') {
      actor = sessionActor;
    } else if (sessionActor && sessionActor.role === 'pm') {
      return (
        <OutcomeShell
          status="blocked"
          title="On-site scans are receiver-only"
          body="Project Manager accounts cannot verify deliveries. Ask your PM to assign a receiver for this route, or scan with the printed QR as the receiver."
        />
      );
    } else if (sessionActor && sessionActor.role === 'super_admin') {
      const early = await findOrderByBarcode(barcode);
      if (early?.projectApprovalStatus === 'pending_logistics') {
        redirect(
          `/projects/${early.projectId}/logistics-scan?scan=${encodeURIComponent(barcode)}`,
        );
      }
      return (
        <OutcomeShell
          status="blocked"
          title="Use the right workflow"
          body="Super admins approve projects in Pending approval (SA). For warehouse scans while a project awaits logistics, open Awaiting logistics → Warehouse scan. Receivers verify on site after activation."
        />
      );
    } else if (sessionActor) {
      return (
        <OutcomeShell
          status="blocked"
          title="Wrong account for this scan"
          body="This QR is for warehouse verification (logistics) or on-site delivery verification (receiver). Open Awaiting logistics for warehouse scans."
        />
      );
    } else {
      // Anonymous + no valid token → bounce to login, preserving the
      // (possibly invalid) token so the user lands back here once they
      // sign in.
      const path = `/s/${encodeURIComponent(barcode)}`;
      const to = token ? `${path}?st=${encodeURIComponent(token)}` : path;
      redirect(`/login?redirect=${encodeURIComponent(to)}`);
    }
  }

  // The deep link was opened by a 3rd-party phone scanner (QR Bot etc.)
  // when the actor is the synthetic Printed-sticker actor. Those phones
  // typically have no session, so dropping them onto `/orders/{id}` —
  // either via the "Open order" button, the Dashboard link, or the
  // auto-redirect — would bounce them to /login and ruin the
  // zero-friction promise. We hide the navigation row entirely for the
  // token path and only keep the outcome card + a "you can close this
  // tab" hint.
  const isAnonymousPhoneScan = actor.isPrintedScan === true;
  const hideNavigation = isAnonymousPhoneScan;

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
            title="No delivery order yet"
            body={`This warehouse sticker (SKU ${gate.productId}) is verified, but your PM has not created a delivery order for "${gate.projectName}" yet. Ask them to create one, then scan the same sticker again on site.`}
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

  const orderHref = isAnonymousPhoneScan
    ? undefined
    : `/orders/${target.orderId}`;

  if (target.projectApprovalStatus === 'pending_logistics') {
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

  const result = await executeScan({
    orderId: target.orderId,
    barcode: target.itemBarcode,
    actor,
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
    return (
      <OutcomeShell
        status="blocked"
        title="Not the assigned receiver"
        body="This project is locked to a different receiver for in-app scans. Use the printed QR on the box, or ask your PM to assign this route to you."
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

  if (result.kind === 'site_not_configured') {
    return (
      <OutcomeShell
        status="blocked"
        title="Site address missing"
        body="This project has no install site on file. Ask your PM to set the project site address before scanning on site."
        orderHref={orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }

  if (result.kind === 'geofence_location_required') {
    return (
      <OutcomeShell
        status="blocked"
        title="Location required"
        body="Open this order in the receiver app and allow GPS when scanning at the project site."
        orderHref={orderHref}
        hideNavigation={hideNavigation}
      />
    );
  }

  if (result.kind === 'geofence_violation') {
    return (
      <OutcomeShell
        status="blocked"
        title="Wrong location"
        body={`This scan is about ${result.distanceMeters} m from the project site (limit ${result.radiusMeters} m). Move to the correct address and try again.`}
        orderHref={orderHref}
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
