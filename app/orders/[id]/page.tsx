'use client';

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthedUser } from '@/components/session-context';
import { QrCode } from '@/components/qr-code';
import { buildScanUrl } from '@/lib/scan-url';
import { StatusPill } from '@/components/status-pill';
import { ScanInput } from '@/components/scan-input';
import { Tour, type TourStep } from '@/components/tour';
import type { Order, OrderItem, Product, Project } from '@/db/schema';
import type { ScanOutcome } from '@/lib/scan';
import {
  classifyNetworkError,
  classifyScanResponse,
  type ScanCallResult,
} from '@/lib/scan-client';
import { ResourceLoadError } from '@/components/resource-load-error';
import { fetchJson } from '@/lib/fetch-json';

/**
 * The order detail API enriches each item with a signed printed-scan
 * token (`lib/printed-scan-token.ts`) so the QR/CODE128 sticker URL
 * resolves a scan with zero login friction on the installer's phone.
 */
type OrderItemWithToken = OrderItem & { printedScanToken?: string };

interface DetailResponse {
  order: Order;
  project: Project | null;
  items: OrderItemWithToken[];
  progress: {
    total: number;
    scanned: number;
    remaining: number;
    percent: number;
  };
}

interface ProjectDetailResponse {
  project: Project;
  items: Product[];
}

type FeedEntry =
  | {
      id: string;
      kind: 'valid';
      productId: string;
      barcode: string;
      stockAfter?: number;
      at: number;
    }
  | {
      id: string;
      kind: 'duplicate';
      productId: string;
      barcode: string;
      at: number;
    }
  | { id: string; kind: 'invalid'; barcode: string; at: number };

function orderHasPendingScansForPoll(data: DetailResponse | undefined) {
  if (!data) return false;
  return (
    data.order.status !== 'fulfilled' &&
    data.items.some((i) => i.scannedAt === null || i.scannedAt === undefined)
  );
}

function fmt(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

/**
 * Convenience binding for the React tree: resolves `NEXT_PUBLIC_APP_URL`
 * and `window.location.origin` at call-time and delegates to the pure
 * `buildScanUrl` in `@/lib/scan-url` (covered by unit tests).
 *
 * `scanToken` (if supplied) is appended as `?st=<token>` so the URL is
 * self-authorising — the installer's phone scanner opens it directly,
 * no login wall, no tap-to-paste.
 */
function resolveScanUrl(barcode: string, scanToken?: string) {
  return buildScanUrl(barcode, {
    envOrigin: process.env.NEXT_PUBLIC_APP_URL,
    windowOrigin:
      typeof window !== 'undefined' && window.location
        ? window.location.origin
        : null,
    scanToken,
  });
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const user = useAuthedUser();

  const orderQuery = useQuery({
    queryKey: ['order-detail', id],
    queryFn: () => fetchJson<DetailResponse>(`/api/orders/${id}`),
    refetchInterval: (query) =>
      orderHasPendingScansForPoll(
        query.state.data as DetailResponse | undefined,
      )
        ? 4000
        : false,
  });

  const projectId = orderQuery.data?.order.projectId;
  const projectItemsQuery = useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: () =>
      fetchJson<ProjectDetailResponse>(`/api/projects/${projectId!}`),
    enabled: !!projectId,
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      orderQuery.refetch(),
      projectId ? projectItemsQuery.refetch() : Promise.resolve(),
    ]);
  }, [orderQuery, projectItemsQuery, projectId]);

  if (!user) return null;

  if (orderQuery.isPending) {
    return (
      <div className="text-sm text-[color:var(--text-muted)]">Loading…</div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <ResourceLoadError
        title="Could not load this delivery"
        message={
          orderQuery.error instanceof Error
            ? orderQuery.error.message
            : 'Something went wrong.'
        }
        onRetry={() => void orderQuery.refetch()}
        isRetrying={orderQuery.isFetching}
      />
    );
  }

  const data = orderQuery.data;
  const projectData = projectItemsQuery.data;

  const anyScanned = data.items.some((i) => i.scannedAt !== null);
  const canEdit =
    user.role === 'pm' && data.order.status !== 'fulfilled' && !anyScanned;
  const assignedInstallerId = data.project?.installerUserId ?? null;
  const isAssignedInstaller =
    !assignedInstallerId || assignedInstallerId === user.id;
  const canScan =
    user.role === 'installer' &&
    (data.order.status === 'active' || data.order.status === 'anomaly') &&
    isAssignedInstaller;

  const projectItems = projectData?.items ?? [];
  const productByKey = new Map<string, Product>();
  for (const p of projectItems) productByKey.set(p.sku, p);

  return (
    <div className="space-y-6">
      <nav className="no-print text-xs text-[color:var(--text-muted)]">
        <Link href="/orders" className="hover:underline">
          ← Back to orders
        </Link>
      </nav>

      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {data.project ? (
                <Link
                  href={`/projects/${data.project.id}`}
                  className="hover:underline"
                >
                  {data.project.name}
                </Link>
              ) : (
                'Unknown project'
              )}
            </h1>
            <StatusPill status={data.order.status} />
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            Order ID{' '}
            <span className="font-mono">{data.order.id.slice(0, 8)}</span> ·
            created by {data.order.createdBy} on {fmt(data.order.createdAt)}
            {data.order.fulfilledAt && (
              <> · fulfilled {fmt(data.order.fulfilledAt)}</>
            )}
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {user.role === 'pm' && data.items.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => window.print()}
              data-tour="pm-print"
            >
              Print barcodes
            </button>
          )}
          {canEdit && (
            <button
              className="btn btn-ghost text-[color:var(--danger)]"
              onClick={async () => {
                if (!confirm('Delete this order?')) return;
                const res = await fetch(`/api/orders/${id}`, {
                  method: 'DELETE',
                });
                if (res.ok) router.push('/orders');
              }}
            >
              Delete order
            </button>
          )}
        </div>
      </header>

      <div data-tour="progress">
        <ProgressCard progress={data.progress} status={data.order.status} />
      </div>

      {user.role === 'pm' ? (
        <PmView
          order={data.order}
          items={data.items}
          products={projectItems}
          productByKey={productByKey}
          refresh={refresh}
          canEdit={canEdit}
        />
      ) : user.role === 'installer' &&
        !isAssignedInstaller &&
        (data.order.status === 'active' || data.order.status === 'anomaly') ? (
        <div className="card border-[color:var(--warning)] bg-amber-50 p-6 text-sm dark:bg-amber-950/30">
          <p className="font-semibold text-[color:var(--text)]">
            Another installer is assigned to this project
          </p>
          <p className="mt-2 text-[color:var(--text-muted)]">
            Ask your PM to assign you on the project page, or verify using the
            printed QR code on the box (phone camera — no login required).
          </p>
        </div>
      ) : canScan ? (
        <InstallerView
          orderId={data.order.id}
          items={data.items}
          productByKey={productByKey}
          refresh={refresh}
        />
      ) : (
        <ReadOnlyItems items={data.items} productByKey={productByKey} />
      )}
    </div>
  );
}

function ProgressCard({
  progress,
  status,
}: {
  progress: DetailResponse['progress'];
  status: Order['status'];
}) {
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Verification progress
          </div>
          <div className="mt-1 text-2xl font-bold">
            {progress.scanned}{' '}
            <span className="text-[color:var(--text-muted)]">of</span>{' '}
            {progress.total}
            <span className="ml-2 text-base font-medium text-[color:var(--text-muted)]">
              items verified
            </span>
          </div>
        </div>
        <div className="text-right text-3xl font-bold">{progress.percent}%</div>
      </div>
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
        <div
          className={`h-full rounded-full transition-all ${
            status === 'fulfilled'
              ? 'bg-[color:var(--success)]'
              : status === 'anomaly'
                ? 'bg-[color:var(--danger)]'
                : 'bg-[color:var(--primary)]'
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PM view: add products, see & print barcodes, remove items until first scan
// ---------------------------------------------------------------------------

function PmView({
  order,
  items,
  products,
  productByKey,
  refresh,
  canEdit,
}: {
  order: Order;
  items: OrderItemWithToken[];
  products: Product[];
  productByKey: Map<string, Product>;
  refresh: () => Promise<void>;
  canEdit: boolean;
}) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tourSteps: TourStep[] = [
    {
      selector: "[data-tour='progress']",
      title: 'Track fulfillment live',
      body: 'Every time an installer scans an item, this bar jumps in real time.',
    },
    {
      selector: "[data-tour='pm-add-item']",
      title: 'Adjust line items',
      body: 'The order started with every project SKU. Remove lines you are not shipping, or add SKUs you created on the project after this order was opened.',
    },
    {
      selector: "[data-tour='first-item']",
      title: 'Printable barcodes',
      body: 'These barcodes print directly. Stick them on the physical goods before shipping.',
    },
    {
      selector: "[data-tour='pm-print']",
      title: 'Print them all at once',
      body: 'Hit Print barcodes to generate a clean, printer-friendly sheet for every item.',
    },
  ];

  const available = products;

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: productId.trim(), quantity }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to add item');
      setProductId('');
      setQuantity(1);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/orders/${order.id}/items?itemId=${itemId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? 'Failed to remove item');
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <section className="card no-print p-6" data-tour="pm-add-item">
          <h2 className="text-base font-semibold">
            Adjust items on this order
          </h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            Add lines for the same SKU multiple times (e.g. 10 boxes) — each
            gets its own barcode. Remove lines you are not shipping until the
            first scan.
          </p>
          <form
            onSubmit={addItem}
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
          >
            <select
              className="input min-w-[12rem] flex-1"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">— Add project SKU lines —</option>
              {available.map((p) => (
                <option key={p.id} value={p.sku}>
                  {p.sku} — {p.name} (stock: {p.stockQuantity})
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-[color:var(--text-muted)]">
                Qty
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="input w-20 text-right"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.min(
                        99,
                        Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                      ),
                    )
                  }
                />
              </label>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || !productId.trim()}
            >
              {busy ? 'Adding…' : 'Add lines'}
            </button>
          </form>
          {products.length === 0 && (
            <p className="mt-3 text-xs text-[color:var(--warning)]">
              This project has no items yet.{' '}
              <Link
                href={`/projects/${order.projectId}`}
                className="font-semibold text-[color:var(--primary)] underline"
              >
                Add one →
              </Link>
            </p>
          )}
          {error && (
            <div className="mt-3 rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-xs text-[color:var(--danger)]">
              {error}
            </div>
          )}
        </section>
      )}

      <ItemsGrid
        items={items}
        productByKey={productByKey}
        emptyHint={
          canEdit
            ? 'No lines on this order yet — this project had no SKUs when the order was created. Add items on the project, then use the dropdown above.'
            : 'No items on this order.'
        }
        showRemove={canEdit}
        onRemove={removeItem}
      />

      <Tour storageKey={`tour:pm:${order.id}`} steps={tourSteps} autoStart />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Installer view: scanner + items grid with real-time resolution
// ---------------------------------------------------------------------------

function InstallerView({
  orderId,
  items,
  productByKey,
  refresh,
}: {
  orderId: string;
  items: OrderItemWithToken[];
  productByKey: Map<string, Product>;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [lastOutcome, setLastOutcome] = useState<{
    outcome: ScanOutcome;
    stockAfter?: number;
    sku?: string;
  } | null>(null);
  const [flash, setFlash] = useState<
    | { kind: 'valid' | 'duplicate'; itemId: string; at: number }
    | { kind: 'invalid'; itemId: null; at: number }
    | null
  >(null);
  const [transportError, setTransportError] = useState<{
    kind: 'network' | 'auth' | 'forbidden' | 'server' | 'conflict';
    message: string;
    at: number;
  } | null>(null);
  const [pendingScans, setPendingScans] = useState(0);

  const itemById = useMemo(() => {
    const map = new Map<string, OrderItem>();
    for (const it of items) map.set(it.id, it);
    return map;
  }, [items]);

  const pending = useMemo(
    () => items.filter((i) => i.scannedAt === null),
    [items],
  );
  const resolved = useMemo(
    () => items.filter((i) => i.scannedAt !== null),
    [items],
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1900);
    return () => clearTimeout(t);
  }, [flash]);

  const onScan = useCallback(
    async (barcode: string) => {
      setPendingScans((n) => n + 1);
      let result: ScanCallResult;
      try {
        const { readScanCoordinates } = await import('@/lib/scan-location');
        let coords: { latitude: number; longitude: number } | undefined;
        try {
          coords = await readScanCoordinates();
        } catch (locErr) {
          result = {
            kind: 'forbidden',
            message: (locErr as Error).message,
          };
          setTransportError({
            kind: 'forbidden',
            message: (locErr as Error).message,
            at: Date.now(),
          });
          setPendingScans((n) => Math.max(0, n - 1));
          return;
        }
        const res = await fetch(`/api/orders/${orderId}/scan`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            barcode,
            latitude: coords.latitude,
            longitude: coords.longitude,
          }),
        });
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          body = { error: 'Server returned non-JSON response' };
        }
        result = classifyScanResponse(
          { ok: res.ok, status: res.status },
          body as never,
        );
      } catch (err) {
        result = classifyNetworkError(err);
      } finally {
        setPendingScans((n) => Math.max(0, n - 1));
      }

      // Transport-level failures: never masquerade as a business outcome.
      if (result.kind !== 'outcome') {
        setTransportError({
          kind: result.kind,
          message: result.message,
          at: Date.now(),
        });
        if (result.kind === 'auth') {
          // Session expired — bounce to login with a return path.
          setTimeout(() => {
            const here = `/orders/${orderId}`;
            router.replace(`/login?redirect=${encodeURIComponent(here)}`);
          }, 1500);
        }
        return;
      }

      setTransportError(null);
      const { outcome } = result;
      setLastOutcome({
        outcome,
        stockAfter: result.stock?.stockQuantity,
        sku: result.stock?.sku,
      });

      if (outcome.result === 'valid') {
        const item = itemById.get(outcome.itemId);
        setFlash({ kind: 'valid', itemId: outcome.itemId, at: Date.now() });
        setFeed((f) => [
          {
            id: `${Date.now()}-v`,
            kind: 'valid',
            productId: item?.productId ?? '(unknown)',
            barcode,
            stockAfter: result.stock?.stockQuantity,
            at: Date.now(),
          },
          ...f,
        ]);
      } else if (outcome.result === 'duplicate') {
        const item = itemById.get(outcome.itemId);
        setFlash({ kind: 'duplicate', itemId: outcome.itemId, at: Date.now() });
        setFeed((f) => [
          {
            id: `${Date.now()}-d`,
            kind: 'duplicate',
            productId: item?.productId ?? '(unknown)',
            barcode,
            at: Date.now(),
          },
          ...f,
        ]);
      } else {
        setFlash({ kind: 'invalid', itemId: null, at: Date.now() });
        setFeed((f) => [
          { id: `${Date.now()}-i`, kind: 'invalid', barcode, at: Date.now() },
          ...f,
        ]);
      }
      try {
        await refresh();
      } catch {
        // Revalidation failure is not fatal — the scan succeeded server-side
        // and the next periodic revalidation will catch us up.
      }
    },
    [orderId, itemById, refresh, router],
  );

  const tourSteps: TourStep[] = [
    {
      selector: "[data-tour='remaining']",
      title: 'Remaining items',
      body: 'This counter goes down every time you verify an item on the truck.',
    },
    {
      selector: "[data-tour='scan-box']",
      title: 'Verify items here',
      body: "Use your phone camera, a handheld scanner, or type/paste the barcode. A valid read instantly acknowledges the item and decrements the project's item stock.",
    },
    {
      selector: "[data-tour='pending']",
      title: 'Pending items',
      body: 'These items are still awaiting verification. A successful scan moves an item into Resolved.',
    },
    {
      selector: "[data-tour='resolved']",
      title: 'Resolved items',
      body: 'Verified deliveries live here — with who acknowledged them and when.',
    },
  ];

  const allDone = items.length > 0 && pending.length === 0;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column: scanner + outcome + history */}
        <div className="space-y-4 lg:col-span-3">
          {pending.length > 0 && (
            <DemoBarcodeStrip barcodes={pending.map((it) => it.barcode)} />
          )}

          <TrackCards
            total={items.length}
            resolved={resolved.length}
            remaining={pending.length}
            pendingScans={pendingScans}
            allDone={allDone}
          />

          {transportError && (
            <TransportErrorCard
              error={transportError}
              onDismiss={() => setTransportError(null)}
            />
          )}

          {allDone && <OrderResolvedCard total={items.length} />}

          {!allDone && (
            <div data-tour="scan-box">
              <ScanInput
                onScan={onScan}
                disabled={allDone}
                busy={pendingScans > 0}
              />
            </div>
          )}

          {!allDone && lastOutcome && (
            <ScanOutcomeCard
              outcome={lastOutcome.outcome}
              sku={lastOutcome.sku}
              stockAfter={lastOutcome.stockAfter}
            />
          )}

          <ScanFeed entries={feed} busy={pendingScans > 0} />
        </div>

        {/* Right column: pending + resolved lists */}
        <div className="space-y-4 lg:col-span-2">
          <section className="card" data-tour="pending">
            <header className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold">
                  Pending{' '}
                  <span className="text-xs text-[color:var(--text-muted)]">
                    (Would be removed after demo)
                  </span>
                </h2>
                <p className="text-xs text-[color:var(--text-muted)]">
                  Awaiting verification
                </p>
              </div>
              <span className="pill pill-active">{pending.length}</span>
            </header>
            {pending.length === 0 ? (
              <div className="px-6 py-8 text-center text-xs text-[color:var(--text-muted)]">
                Nothing pending. Great work.
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 p-4">
                {pending.map((it, idx) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    product={productByKey.get(it.productId)}
                    isTourAnchor={idx === 0}
                    flashing={
                      flash &&
                      'itemId' in flash &&
                      flash.itemId === it.id &&
                      flash.kind === 'duplicate'
                        ? 'warn'
                        : null
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="card" data-tour="resolved">
            <header className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold">Resolved</h2>
                <p className="text-xs text-[color:var(--text-muted)]">
                  Deducted from the order
                </p>
              </div>
              <span className="pill pill-fulfilled">{resolved.length}</span>
            </header>
            {resolved.length === 0 ? (
              <div className="px-6 py-8 text-center text-xs text-[color:var(--text-muted)]">
                Scans will show up here.
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--border)]">
                {resolved.map((it) => {
                  const product = productByKey.get(it.productId);
                  const justScanned =
                    flash &&
                    'itemId' in flash &&
                    flash.itemId === it.id &&
                    flash.kind === 'valid';
                  return (
                    <li
                      key={it.id}
                      className={`flex items-center gap-3 px-6 py-3 text-sm ${
                        justScanned ? 'flash-scanned' : ''
                      }`}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--success)] text-xs text-white">
                        ✓
                      </span>
                      <div className="flex-1">
                        <div className="font-mono text-xs font-semibold">
                          {it.productId}
                        </div>
                        <div className="text-[11px] text-[color:var(--text-muted)]">
                          {product?.name ?? it.barcode}
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-[color:var(--text-muted)]">
                        <div>{it.scannedBy ?? '—'}</div>
                        <div>{fmt(it.scannedAt)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Tour
        storageKey={`tour:installer:${orderId}`}
        steps={tourSteps}
        autoStart
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Installer demo: show pending barcodes for rehearsal (labels replace these).
// ---------------------------------------------------------------------------

function DemoBarcodeStrip({ barcodes }: { barcodes: string[] }) {
  if (barcodes.length === 0) return null;
  return (
    <div className="card no-print border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-xs">
      <div className="font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
        Demo — barcodes to scan
      </div>
      <p className="mt-1 text-[color:var(--text-muted)]">
        For rehearsals only. Real runs use printed labels on the box.
      </p>
      <ul className="mt-3 space-y-1.5 font-mono text-[11px]">
        {barcodes.map((b) => (
          <li
            key={b}
            className="flex items-center justify-between gap-2 rounded-md bg-[color:var(--surface)] px-2 py-1"
          >
            <span className="min-w-0 truncate">{b}</span>
            <button
              type="button"
              className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--primary)] hover:underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(b);
                } catch {
                  // ignore
                }
              }}
            >
              Copy
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrackCards({
  total,
  resolved,
  remaining,
  pendingScans,
  allDone,
}: {
  total: number;
  resolved: number;
  remaining: number;
  pendingScans: number;
  allDone: boolean;
}) {
  const tiles = [
    {
      label: 'Total items',
      value: total,
      tone: 'text-[color:var(--text)]',
    },
    {
      label: 'Resolved',
      value: resolved,
      tone: 'text-[color:var(--success)]',
    },
    {
      label: 'Remaining',
      value: remaining,
      tone: allDone
        ? 'text-[color:var(--success)]'
        : 'text-[color:var(--info)]',
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-3" data-tour="remaining">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            {t.label}
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${t.tone}`}>
            {t.value}
          </div>
        </div>
      ))}
      {pendingScans > 0 && (
        <div
          className="col-span-3 flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text)]"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-[color:var(--primary)] border-t-transparent"
            aria-hidden
          />
          <span>
            Verifying {pendingScans} item{pendingScans === 1 ? '' : 's'}…
          </span>
        </div>
      )}
    </div>
  );
}

function OrderResolvedCard({ total }: { total: number }) {
  return (
    <div className="card border-[color:var(--success)] bg-green-50 p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--success)] text-lg text-white">
          ✓
        </div>
        <div>
          <div className="text-base font-semibold text-[color:var(--success)]">
            Order resolved
          </div>
          <p className="text-sm text-[color:var(--text)]">
            All {total} item{total === 1 ? '' : 's'} on this order have been
            acknowledged. The project&apos;s item stock has been deducted and
            the order is now marked as fulfilled.
          </p>
        </div>
      </div>
    </div>
  );
}

function ScanOutcomeCard({
  outcome,
  sku,
  stockAfter,
}: {
  outcome: ScanOutcome;
  sku?: string;
  stockAfter?: number;
}) {
  let classes = '';
  if (outcome.result === 'valid') {
    classes = 'border-[color:var(--success)] text-[color:var(--success)]';
  } else if (outcome.result === 'duplicate') {
    classes = 'border-[color:var(--warning)] text-[color:var(--warning)]';
  } else {
    classes = 'border-[color:var(--danger)] text-[color:var(--danger)]';
  }
  return (
    <div
      data-tour="scan-outcome"
      className={`card p-4 text-sm font-medium ${classes}`}
    >
      {outcome.result === 'valid' && (
        <>
          ✓ Item acknowledged
          {sku && typeof stockAfter === 'number' && (
            <span className="ml-2 font-normal text-[color:var(--text-muted)]">
              — {sku} stock now {stockAfter}
            </span>
          )}
        </>
      )}
      {outcome.result === 'duplicate' && '↺ Already scanned earlier'}
      {outcome.result === 'invalid' &&
        `✗ Barcode not in this order: ${outcome.barcode}`}
    </div>
  );
}

function TransportErrorCard({
  error,
  onDismiss,
}: {
  error: {
    kind: 'network' | 'auth' | 'forbidden' | 'server' | 'conflict';
    message: string;
  };
  onDismiss: () => void;
}) {
  const label: Record<typeof error.kind, string> = {
    network: "Can't reach the server",
    auth: 'Your session expired',
    forbidden: 'Not allowed for this login',
    server: 'Server error',
    conflict: 'Order conflict',
  };
  const hint: Record<typeof error.kind, string> = {
    network: 'Check your internet connection and try the scan again.',
    auth: 'Taking you back to the login screen…',
    forbidden:
      'Ask your PM to assign this project to you, or scan the printed QR on the box.',
    server: "The scan wasn't recorded. Please retry — nothing was changed.",
    conflict: 'Something about this order changed. The item was NOT deducted.',
  };
  return (
    <div
      className="card border-[color:var(--danger)] bg-red-50 p-4"
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--danger)]">
            {label[error.kind]}
          </div>
          <p className="mt-1 text-xs text-[color:var(--text)]">
            {error.message}
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            {hint[error.kind]}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-[color:var(--text-muted)] hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ScanFeed({ entries, busy }: { entries: FeedEntry[]; busy?: boolean }) {
  let body: ReactNode;
  if (entries.length === 0 && !busy) {
    body = (
      <div className="px-6 py-8 text-center text-xs text-[color:var(--text-muted)]">
        No verifications yet. Scan a barcode to begin.
      </div>
    );
  } else if (entries.length === 0) {
    body = (
      <div className="px-6 py-6 text-center text-xs text-[color:var(--text-muted)]">
        Results will appear here as soon as the server responds.
      </div>
    );
  } else {
    body = (
      <ul className="max-h-80 overflow-y-auto divide-y divide-[color:var(--border)]">
        {entries.map((e) => {
          const colorMap: Record<FeedEntry['kind'], string> = {
            valid: 'text-[color:var(--success)]',
            duplicate: 'text-[color:var(--warning)]',
            invalid: 'text-[color:var(--danger)]',
          };
          return (
            <li
              key={e.id}
              className="flex items-center gap-3 px-6 py-2 text-xs"
            >
              <span className={`font-bold ${colorMap[e.kind]}`}>
                {e.kind === 'valid' && '✓'}
                {e.kind === 'duplicate' && '↺'}
                {e.kind === 'invalid' && '✗'}
              </span>
              <span className="flex-1 font-mono">{e.barcode}</span>
              {'productId' in e && (
                <span className="text-[color:var(--text-muted)]">
                  {e.productId}
                </span>
              )}
              {e.kind === 'valid' && typeof e.stockAfter === 'number' && (
                <span className="text-[color:var(--text-muted)]">
                  stock: {e.stockAfter}
                </span>
              )}
              <span className="text-[color:var(--text-muted)]">
                {new Date(e.at).toLocaleTimeString()}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="card">
      <div className="border-b border-[color:var(--border)] px-6 py-3 text-sm font-semibold">
        Verification log
      </div>
      {busy && (
        <div
          className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-6 py-3 text-xs text-[color:var(--text)]"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-[color:var(--primary)] border-t-transparent"
            aria-hidden
          />
          <span>Recording this verification…</span>
        </div>
      )}
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: items grid with large barcodes
// ---------------------------------------------------------------------------

function ItemsGrid({
  items,
  productByKey,
  emptyHint,
  showRemove,
  onRemove,
  flashItemId,
  flashKind,
}: {
  items: OrderItemWithToken[];
  productByKey: Map<string, Product>;
  emptyHint: string;
  showRemove?: boolean;
  onRemove?: (id: string) => void | Promise<void>;
  flashItemId?: string | null;
  flashKind?: 'valid' | 'duplicate' | 'invalid' | null;
}) {
  return (
    <section className="card">
      <header className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">
            Items{' '}
            <span className="text-[color:var(--text-muted)]">
              ({items.filter((i) => i.scannedAt !== null).length}/{items.length}
              )
            </span>
          </h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            Each item has a unique barcode printed below.
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]">
          {emptyHint}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          {items.map((it, idx) => (
            <ItemCard
              key={it.id}
              item={it}
              product={productByKey.get(it.productId)}
              showRemove={showRemove}
              onRemove={onRemove}
              isTourAnchor={idx === 0}
              flashing={
                flashItemId === it.id
                  ? flashKind === 'duplicate'
                    ? 'warn'
                    : 'success'
                  : null
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Scan art for a single order item: QR only. A linear barcode encoding the
 * full URL was too wide for the card grid; the bare code is still shown in
 * monospace under the card for typing / USB scanners.
 */
function ItemScanArt({
  barcode,
  scanToken,
}: {
  barcode: string;
  scanToken?: string;
}) {
  const url = resolveScanUrl(barcode, scanToken);
  // Show the URL host as a small "tap-to-open" affordance so installers
  // can sanity-check that the QR resolves to the right server.
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    host = '';
  }

  return (
    <div className="flex flex-col items-stretch gap-2 rounded-lg bg-white p-3">
      <div className="flex flex-col items-center gap-1.5">
        <a
          href={url}
          className="rounded-md ring-1 ring-[color:var(--border)] transition hover:ring-[color:var(--primary)]"
          title="Tap on a phone to open the order. PMs: print this and stick it on the item."
        >
          <QrCode value={url} size={168} />
        </a>
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--primary)]">
            Scan with phone camera
          </div>
          <div className="text-[10px] text-[color:var(--text-muted)]">
            Opens automatically — no typing
          </div>
          {host && (
            <div className="mt-0.5 break-all font-mono text-[9px] text-[color:var(--text-muted)]">
              {host}/s/{barcode}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  product,
  showRemove,
  onRemove,
  isTourAnchor,
  flashing,
}: {
  item: OrderItemWithToken;
  product?: Product;
  showRemove?: boolean;
  onRemove?: (id: string) => void | Promise<void>;
  isTourAnchor?: boolean;
  flashing?: 'success' | 'warn' | null;
}) {
  const done = !!item.scannedAt;
  const cardRef = useRef<HTMLLIElement | null>(null);

  // Scroll the just-scanned card into view.
  useEffect(() => {
    if (flashing && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [flashing]);

  const flashClass = flashing === 'warn' ? 'flash-error' : 'flash-scanned';

  return (
    <li
      ref={cardRef}
      data-tour={isTourAnchor ? 'first-item' : undefined}
      className={`relative flex flex-col gap-3 rounded-xl border p-4 transition-colors ${
        done
          ? 'border-[color:var(--success)] bg-green-50/40'
          : 'border-[color:var(--border)] bg-[color:var(--surface)]'
      } ${flashing ? flashClass : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold">
            {item.productId}
          </div>
          {product && (
            <div className="text-xs text-[color:var(--text-muted)]">
              {product.name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {done ? (
            <span className="pill pill-fulfilled">✓ Scanned</span>
          ) : (
            <span className="pill pill-draft">Awaiting</span>
          )}
          {flashing === 'success' && (
            <span className="pill pill-active">Just scanned</span>
          )}
          {flashing === 'warn' && (
            <span className="pill pill-anomaly">Duplicate</span>
          )}
        </div>
      </div>

      <ItemScanArt barcode={item.barcode} scanToken={item.printedScanToken} />

      <div className="flex items-center justify-between text-[11px] text-[color:var(--text-muted)]">
        <span className="font-mono">{item.barcode}</span>
        {done && (
          <span>
            {item.scannedBy ?? '—'} · {fmt(item.scannedAt)}
          </span>
        )}
      </div>

      {showRemove && !done && (
        <button
          onClick={() => onRemove?.(item.id)}
          className="no-print btn btn-ghost self-end text-xs"
        >
          Remove
        </button>
      )}
    </li>
  );
}

function ReadOnlyItems({
  items,
  productByKey,
}: {
  items: OrderItemWithToken[];
  productByKey: Map<string, Product>;
}) {
  return (
    <ItemsGrid
      items={items}
      productByKey={productByKey}
      emptyHint="No items on this order."
    />
  );
}
