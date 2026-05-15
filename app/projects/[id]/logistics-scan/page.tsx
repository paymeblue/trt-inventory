'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Order, OrderItem, Project } from '@/db/schema';
import type { ScanOutcome } from '@/lib/scan';
import { fetchJson } from '@/lib/fetch-json';
import { queryKeys } from '@/lib/query-keys';
import { buildScanUrl } from '@/lib/scan-url';
import { QrCode } from '@/components/qr-code';
import { ScanInput } from '@/components/scan-input';
import { useAuthedUser } from '@/components/session-context';
import { ResourceLoadError } from '@/components/resource-load-error';

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

function logisticsFlashForOutcome(outcome: ScanOutcome): string {
  switch (outcome.result) {
    case 'valid':
      return 'Warehouse line recorded.';
    case 'duplicate':
      return 'Already scanned in the warehouse.';
    case 'invalid':
      return 'Unknown code for this shipment — try again.';
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
  const qc = useQueryClient();
  const user = useAuthedUser();
  const [flash, setFlash] = useState<string | null>(null);

  const gateQuery = useQuery({
    queryKey: queryKeys.logisticsGate(projectId),
    queryFn: () =>
      fetchJson<GatePayload>(`/api/projects/${projectId}/logistics-gate`),
    enabled: user?.role === 'logistics',
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
    ]);
  }, [qc, projectId]);

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
      await invalidate();
      router.push('/approvals/logistics');
    },
  });

  const onManualScan = useCallback(
    async (barcodeRaw: string) => {
      const barcode = barcodeRaw.trim();
      if (!barcode) return;
      setFlash(null);
      try {
        const res = await scanMut.mutateAsync(barcode);
        setFlash(logisticsFlashForOutcome(res.outcome));
      } catch (e) {
        setFlash(
          e instanceof Error ? e.message : 'Warehouse scan failed — try again.',
        );
      }
    },
    [scanMut],
  );

  if (!user) return null;

  if (user.role !== 'logistics') {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Logistics only</h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          Warehouse verification is restricted to logistics accounts.
        </p>
      </div>
    );
  }

  if (gateQuery.isPending) {
    return (
      <p className="text-sm text-[color:var(--text-muted)]">
        Loading warehouse list…
      </p>
    );
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
          Scan each packing QR the same way installers will on site. Nothing is
          deducted from stock yet — stocking updates still happen when
          installers scan after this project is active.
        </p>
        {data.project.projectBarcode && (
          <p className="mt-2 font-mono text-xs text-[color:var(--text-muted)]">
            Project barcode:{' '}
            <span className="font-semibold text-[color:var(--text)]">
              {data.project.projectBarcode}
            </span>
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
            <ScanInput onScan={(b) => void onManualScan(b)} />

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
                  <Link
                    className="btn btn-ghost btn-sm shrink-0 self-start"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open sticker URL
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card border-[color:var(--border)] p-5">
        <h2 className="text-base font-semibold">Approve for installers</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          {hasLines
            ? 'When each line reads "Warehouse scanned", approve so PM and installers can work the same stickers on site.'
            : 'Approve to release this empty project.'}
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
            {fulfillMut.isPending ? 'Approving…' : 'Approve project'}
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
