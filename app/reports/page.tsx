'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import useSWR from '@/lib/swr';
import { useAuthedUser } from '@/components/session-context';
import { PageLoading } from '@/components/page-loading';
import type { ReportRow } from '@/app/api/reports/route';

interface ReportsResponse {
  rows: ReportRow[];
}

const FORMATS = [
  { label: 'Download as PDF', format: 'pdf' },
  { label: 'Download as Excel', format: 'xlsx' },
  { label: 'Download as Word', format: 'docx' },
  { label: 'Download as CSV', format: 'csv' },
];

function DownloadDropdown({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleToggle() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({
        top: r.bottom + window.scrollY + 4,
        right: window.innerWidth - r.right,
      });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost text-xs"
        onClick={handleToggle}
      >
        Download ▾
      </button>

      {open && (
        <div
          style={{ position: 'fixed', top: dropPos.top, right: dropPos.right, zIndex: 9999 }}
          className="min-w-[170px] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl"
        >
          {FORMATS.map(({ label, format }) => (
            <a
              key={format}
              href={`/api/reports/download?format=${format}&orderId=${orderId}`}
              download
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-xs hover:bg-[color:var(--surface-muted)] cursor-pointer"
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

export default function ReportsPage() {
  const user = useAuthedUser();
  const { data, isLoading, error } = useSWR<ReportsResponse>('/api/reports');
  const [query, setQuery] = useState('');

  const rows = data?.rows ?? [];

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        query.trim()
          ? r.projectName.toLowerCase().includes(query.trim().toLowerCase()) ||
            (r.installerName ?? '')
              .toLowerCase()
              .includes(query.trim().toLowerCase())
          : true,
      ),
    [rows, query],
  );

  if (!user) return null;

  if (user.role === 'installer') {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Reports are available to PMs, logistics, and super-admins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            All fulfilled orders. Download each as PDF, Excel, Word, or CSV.
          </p>
        </div>
      </div>

      <div>
        <input
          className="input md:max-w-xs"
          placeholder="Search project or installer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="card border-[color:var(--danger)] p-4 text-sm text-[color:var(--danger)]">
          Failed to load reports.
        </div>
      )}

      {isLoading ? (
        <PageLoading message="Loading reports…" />
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[color:var(--text-muted)]">
          {rows.length === 0
            ? 'No fulfilled orders yet. Completed orders will appear here.'
            : 'No orders match this search.'}
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto overflow-y-visible rounded-[inherit]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
                <tr>
                  <th className="px-5 py-3 text-left">Project</th>
                  <th className="px-5 py-3 text-left">Created by (PM)</th>
                  <th className="px-5 py-3 text-left">Receiver / Installer</th>
                  <th className="px-5 py-3 text-left">Fulfilled</th>
                  <th className="px-5 py-3 text-left">Items</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {filtered.map((r) => (
                  <tr
                    key={r.orderId}
                    className="hover:bg-[color:var(--surface-muted)]"
                  >
                    <td className="px-5 py-3 font-medium">{r.projectName}</td>
                    <td className="px-5 py-3 text-[color:var(--text-muted)]">
                      {r.pmName}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--text-muted)]">
                      {r.installerName ?? (
                        <span className="italic opacity-50">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--text-muted)]">
                      {new Date(r.fulfilledAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {r.itemCount}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DownloadDropdown orderId={r.orderId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--text-muted)]">
            {filtered.length} fulfilled order{filtered.length === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
}
