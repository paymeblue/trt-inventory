'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Order, OrderItem, Project } from '@/db/schema';
import type { ScanOutcome } from '@/lib/scan';
import { fetchJson } from '@/lib/fetch-json';
import {
  invalidateWorkspaceBadges,
  invalidateWorkspaceProjects,
  queryKeys,
} from '@/lib/query-keys';
import { buildScanUrl } from '@/lib/scan-url';
import { normalizeScanBarcode } from '@/lib/scan-deep-link';
import { QrCode } from '@/components/qr-code';
import { ScanInput } from '@/components/scan-input';
import { useAuthedUser } from '@/components/session-context';
import { ResourceLoadError } from '@/components/resource-load-error';
import { PageLoading } from '@/components/page-loading';

type OrderItemOut = OrderItem & { printedScanToken?: string };

interface GatePayload {
  order: Order;
  project: Project;
  items: OrderItemOut[];
  progress: {
    total: number;
    scanned: number;
    remaining: number;
    percent: number;
  };
}

function logisticsFlashForOutcome(
  outcome: ScanOutcome,
  ctx: {
    projectBarcode: string | null;
    packingBarcodes: string[];
    lastScanned?: string;
  },
): string {
  switch (outcome.result) {
    case 'valid':
      return 'Warehouse line verified. Stock is deducted when receivers scan this SKU on the delivery order.';
    case 'duplicate':
      return 'Already scanned in the warehouse.';
    case 'invalid': {
      const scanned = normalizeScanBarcode(
        outcome.barcode || ctx.lastScanned || '',
      );
      if (
        ctx.projectBarcode &&
        scanned === normalizeScanBarcode(ctx.projectBarcode)
      ) {
        return `That is the project reference (${ctx.projectBarcode}), not a box sticker. Scan the packing QR beside the SKU below — e.g. ${ctx.packingBarcodes[0] ?? 'TRT-…'}.`;
      }
      if (ctx.packingBarcodes.length === 1) {
        return `This code is not on the warehouse list. Scan the packing sticker: ${ctx.packingBarcodes[0]}.`;
      }
      return 'Unknown code for this shipment. Scan one of the packing stickers listed below (each starts with TRT-).';
    }
    default:
      return 'Scan completed.';
  }
}

export default function ProjectLogisticsScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const user = useAuthedUser();
  const [flash, setFlash] = useState<string | null>(null);
  const deepLinkScanDone = useRef(false);

  const canWarehouseScan =
    user?.role === 'logistics' || user?.role === 'super_admin';

  const gateQuery = useQuery({
    queryKey: queryKeys.logisticsGate(projectId),
    queryFn: () =>
      fetchJson<GatePayload>(`/api/projects/${projectId}/logistics-gate`),
    enabled: canWarehouseScan,
    refetchInterval: (q) => {
      const d = q.state.data as GatePayload | undefined;
      if (!d || d.progress.remaining === 0) return false;
      return 3500;
    },
  });

  const invalidate = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.logisticsGate(projectId) }),
      qc.invalidateQueries({ queryKey: queryKeys.approvalsLogistics }),
      qc.invalidateQueries({ queryKey: queryKeys.projects }),
      qc.invalidateQueries({ queryKey: queryKeys.orders }),
      qc.invalidateQueries({ queryKey: ['logistics-gate'] }),
      invalidateWorkspaceBadges(qc),
    ]);
  }, [qc, projectId]);

  const invalidateAfterFulfill = useCallback(async () => {
    await invalidateWorkspaceProjects(qc);
  }, [qc]);

  const scanMut = useMutation({
    mutationFn: (barcode: string) =>
      fetchJson<{ outcome: ScanOutcome }>(
        `/api/projects/${projectId}/logistics-gate/scan`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ barcode }),
        },
      ),
    onSettled: () => invalidate(),
  });

  const fulfillMut = useMutation({
    mutationFn: () =>
      fetchJson(`/api/projects/${projectId}/approval`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'logistics_fulfill' }),
      }),
    onSuccess: async () => {
      await invalidateAfterFulfill();
      router.push('/approvals/logistics');
    },
  });

  const onManualScan = useCallback(
    async (barcodeRaw: string) => {
      const barcode = normalizeScanBarcode(barcodeRaw);
      if (!barcode) return;
      setFlash(null);
      const packingBarcodes =
        gateQuery.data?.items.map((i) => i.barcode) ?? [];
      const projectBarcode = gateQuery.data?.project.projectBarcode ?? null;
      try {
        const res = await scanMut.mutateAsync(barcode);
        setFlash(
          logisticsFlashForOutcome(res.outcome, {
            projectBarcode,
            packingBarcodes,
            lastScanned: barcode,
          }),
        );
      } catch (e) {
        setFlash(
          e instanceof Error ? e.message : 'Warehouse scan failed — try again.',
        );
      }
    },
    [scanMut, gateQuery.data],
  );

  const pendingDeepLinkBarcode = searchParams.get('scan')?.trim() ?? '';

  useEffect(() => {
    if (
      !canWarehouseScan ||
      !pendingDeepLinkBarcode ||
      !gateQuery.data ||
      deepLinkScanDone.current
    ) {
      return;
    }
    deepLinkScanDone.current = true;
    void onManualScan(pendingDeepLinkBarcode);
  }, [
    canWarehouseScan,
    pendingDeepLinkBarcode,
    gateQuery.data,
    onManualScan,
  ]);

  if (!user) return null;

  if (!canWarehouseScan) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Warehouse scan</h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          Warehouse verification is for logistics or super-admin accounts. Open
          Awaiting logistics from the sidebar if you have access.
        </p>
      </div>
    );
  }

  if (gateQuery.isPending) {
    return <PageLoading message="Loading warehouse list…" />;
  }

  if (gateQuery.isError || !gateQuery.data) {
    return (
      <ResourceLoadError
        title="Cannot load logistics scan session"
        message={
          gateQuery.error instanceof Error
            ? gateQuery.error.message
            : 'Something went wrong.'
        }
        onRetry={() => void gateQuery.refetch()}
        isRetrying={gateQuery.isFetching}
      />
    );
  }

  const data = gateQuery.data;
  const hasLines = data.items.length > 0;
  const logisticsComplete =
    !hasLines || (data.progress.total > 0 && data.progress.remaining === 0);

  function stickerUrl(barcode: string, token?: string) {
    return buildScanUrl(barcode, {
      envOrigin: process.env.NEXT_PUBLIC_APP_URL,
      windowOrigin:
        typeof window !== 'undefined' ? window.location.origin : null,
      scanToken: token,
    });
  }

  return (
    <div className="space-y-6">
      <nav className="no-print text-xs text-[color:var(--text-muted)]">
        <Link href="/approvals/logistics" className="hover:underline">
          ← Logistics queue
        </Link>
        {' · '}
        <Link href={`/projects/${projectId}`} className="hover:underline">
          Project overview
        </Link>
      </nav>

      <header>
        <h1 className="text-2xl font-semibold">
          Warehouse scan — {data.project.name}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          Warehouse verification — scan each packing QR here first. This is
          required before you activate the project. Receivers scan the same
          stickers on site only after every line shows Warehouse scanned.
        </p>
        {data.project.projectBarcode && (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            Project reference{' '}
            <span className="font-mono font-semibold text-[color:var(--text)]">
              {data.project.projectBarcode}
            </span>{' '}
            — for paperwork only; do not scan this in the warehouse. Scan each
            packing sticker (TRT-…) in the list below.
          </p>
        )}
      </header>

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              Warehouse progress
            </div>
            <div className="mt-1 text-2xl font-bold">
              {data.progress.scanned}/{data.progress.total}
            </div>
          </div>
          {!hasLines && (
            <p className="text-sm text-[color:var(--text-muted)]">
              No SKUs on this project — you can approve without scanning lines.
            </p>
          )}
        </div>
        {hasLines && (
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
            <div
              className="h-full rounded-full bg-[color:var(--primary)] transition-[width]"
              style={{ width: `${data.progress.percent}%` }}
            />
          </div>
        )}
      </section>

      {hasLines && (
        <section className="card overflow-hidden">
          <header className="border-b border-[color:var(--border)] px-5 py-3 text-sm font-semibold">
            Scanner
          </header>
          <div className="p-5">
            <ScanInput
              busy={scanMut.isPending}
              onScan={(b) => void onManualScan(b)}
            />

            {(flash ?? scanMut.isError) && (
              <p
                className={`mt-3 text-sm ${scanMut.isError ? 'text-[color:var(--danger)]' : 'text-[color:var(--text)]'}`}
              >
                {flash ??
                  (scanMut.error instanceof Error
                    ? scanMut.error.message
                    : 'Scan failed')}
              </p>
            )}
          </div>
        </section>
      )}

      {hasLines && (
        <section className="card overflow-hidden">
          <header className="border-b border-[color:var(--border)] px-5 py-3 text-sm font-semibold">
            Packing stickers (Would be removed after demo)
          </header>
          <ul className="divide-y divide-[color:var(--border)]">
            {data.items.map((it) => {
              const url = stickerUrl(it.barcode, it.printedScanToken);
              const picked =
                it.logisticsScannedAt !== null &&
                it.logisticsScannedAt !== undefined;

              return (
                <li
                  key={it.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start"
                >
                  <div className="no-print shrink-0">
                    <QrCode value={url} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {it.productId}
                      </span>
                      {picked ? (
                        <span className="pill pill-fulfilled text-[10px]">
                          Warehouse scanned
                        </span>
                      ) : (
                        <span className="pill pill-anomaly text-[10px]">
                          Awaiting scan
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-[color:var(--text-muted)]">
                      {it.barcode}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 self-start">
                    {!picked ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={scanMut.isPending}
                        onClick={() => void onManualScan(it.barcode)}
                      >
                        Scan this box
                      </button>
                    ) : null}
                    <Link
                      className="btn btn-ghost btn-sm"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open sticker URL
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card border-[color:var(--border)] p-5">
        <h2 className="text-base font-semibold">Activate for receivers</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          {hasLines
            ? 'Logistics only verifies packing in the warehouse. When every line is verified, activate the project so receivers can fulfill PM delivery orders on site.'
            : 'Activate to release this empty project for receivers.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              fulfillMut.isPending || scanMut.isPending || !logisticsComplete
            }
            onClick={() => fulfillMut.mutate()}
          >
            {fulfillMut.isPending ? 'Activating…' : 'Activate project'}
          </button>
          {!logisticsComplete && hasLines ? (
            <span className="self-center text-xs text-[color:var(--text-muted)]">
              Finish every warehouse scan before activating.
            </span>
          ) : null}
        </div>
        {fulfillMut.error && (
          <p className="mt-2 text-sm text-[color:var(--danger)]">
            {fulfillMut.error instanceof Error
              ? fulfillMut.error.message
              : 'Activation failed'}
          </p>
        )}
      </section>
    </div>
  );
}
