import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser, type AuthenticatedActor } from '@/lib/auth-guard';
import { getPrintedScanActor } from '@/lib/printed-scan-actor';
import { verifyPrintedScanToken } from '@/lib/printed-scan-token';
import { runPageWithObservability } from '@/lib/observability/instrument';
import { executeScan, findOrderByBarcode } from '@/lib/scan-execute';
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
    if (sessionActor && sessionActor.role === 'installer') {
      actor = sessionActor;
    } else if (sessionActor && sessionActor.role !== 'installer') {
      // Signed-in PM hit a token-less URL: don't pretend it worked.
      return (
        <OutcomeShell
          status="blocked"
          title="Scans are installer-only"
          body="Your account is a Project Manager. Only installer accounts can acknowledge deliveries. Ask your PM to log in as the installer that owns this route."
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

  const lookup = await findOrderByBarcode(barcode);
  if (!lookup) {
    return (
      <OutcomeShell
        status="blocked"
        title="Unknown barcode"
        body={`The code ${barcode} isn't part of any order in this workspace. Double-check the sticker or ask your PM to rebuild the order.`}
        hideNavigation={hideNavigation}
      />
    );
  }

  const result = await executeScan({
    orderId: lookup.orderId,
    barcode,
    actor,
  });

  const orderHref = isAnonymousPhoneScan
    ? undefined
    : `/orders/${lookup.orderId}`;

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
  if (result.kind === 'order_fulfilled') {
    return (
      <OutcomeShell
        status="done"
        title="Order already fulfilled"
        body={`Order "${lookup.projectName}" was already completed. Nothing was changed.`}
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

  return (
    <OutcomeView
      outcome={result.outcome}
      projectName={lookup.projectName}
      orderHref={orderHref}
      stock={result.stock}
      progress={result.progress}
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
  hideNavigation,
}: {
  outcome: ScanOutcome;
  projectName: string;
  orderHref?: string;
  stock?: { sku: string; stockQuantity: number };
  progress: { scanned: number; total: number; percent: number };
  hideNavigation?: boolean;
}) {
  if (outcome.result === 'valid') {
    const done = progress.scanned === progress.total;
    return (
      <OutcomeShell
        status={done ? 'complete' : 'ok'}
        title={done ? 'Order resolved' : 'Item acknowledged'}
        body={
          done
            ? `Every item on "${projectName}" has been scanned. The order is now marked fulfilled and the project's item stock is up to date.`
            : `Scan recorded on "${projectName}". ${progress.scanned}/${progress.total} items verified (${progress.percent}%).`
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
