"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "@/lib/swr";
import { useAuthedUser } from "@/components/session-context";
import { queryKeys } from "@/lib/query-keys";

interface ProjectLite {
  id: string;
  name: string;
}

interface OrderRow {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  createdAt: string;
}

function shortOrderTail(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

export default function NewDisputePage() {
  const user = useAuthedUser();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: projData } = useSWR<{ projects: ProjectLite[] }>("/api/projects");
  const { data: ordData } = useSWR<{ orders: OrderRow[] }>("/api/orders");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projects = projData?.projects ?? [];
  const allOrders = ordData?.orders ?? [];

  /** When a project is chosen, constrain orders to it; otherwise list every visible order as autocomplete options. */
  const filteredOrders = useMemo(() => {
    if (!projectId) return allOrders;
    return allOrders.filter((o) => o.projectId === projectId);
  }, [allOrders, projectId]);

  const datalistId = "dispute-order-uuid-options";

  const ORDER_UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const oidTrim = orderId.trim();
  const typedOrderInvalidUuid =
    oidTrim !== "" && !ORDER_UUID.test(oidTrim);
  const unknownOrderPick =
    oidTrim !== "" && !allOrders.some((o) => o.id === oidTrim);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const oid = orderId.trim();
    if (oid && !ORDER_UUID.test(oid)) {
      setError(
        "That order ID is not a valid UUID shape. Pick a value from the hints or dropdown—do not invent characters.",
      );
      return;
    }
    if (oid && !allOrders.some((o) => o.id === oid)) {
      setError(
        "That UUID is not an order visible to your account—refresh the page or pick another order from the hints.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("description", description.trim());
      const pid = projectId.trim();
      if (pid) fd.set("projectId", pid);
      if (oid) fd.set("orderId", oid);
      if (photo) fd.set("photo", photo);
      const res = await fetch("/api/disputes", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        dispute?: { id: string };
      };
      if (!res.ok) throw new Error(json.error ?? "Could not submit");
      await qc.invalidateQueries({ queryKey: queryKeys.approvalsQueueCounts });
      if (json.dispute?.id) {
        router.push(`/disputes/${json.dispute.id}`);
      } else router.push("/disputes");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/disputes"
          className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
        >
          ← All disputes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New dispute</h1>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          Tie this to an order or project so responders have context. The order field
          is filled from routes you already have access to—the server rejects bad or
          unknown UUIDs.
        </p>
      </div>

      <datalist id={datalistId}>
        {filteredOrders.map((o) => (
          <option
            key={o.id}
            value={o.id}
            label={`${o.projectName} · ${o.status} · #${shortOrderTail(o.id)}`}
          />
        ))}
      </datalist>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Title
          </span>
          <input
            className="input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            What went wrong?
          </span>
          <textarea
            className="input min-h-[120px] w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={8000}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Project (optional if order is set)
          </span>
          <select
            className="input w-full"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setOrderId("");
            }}
          >
            <option value="">— Any project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projectId ? (
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              Orders below are narrowed to this project only.
            </p>
          ) : null}
        </label>

        <div className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Order (optional)
          </span>
          <p className="mb-2 text-[11px] text-[color:var(--text-muted)]">
            Type to filter hints, pick a row to paste the canonical UUID (autocomplete).
            Prefer the dropdown underneath if typing is clumsy on your device.
          </p>
          <input
            className="input mb-3 w-full font-mono text-xs"
            placeholder="Start typing — pick an order UUID from hints"
            value={orderId}
            list={datalistId}
            onChange={(e) => setOrderId(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={
              typedOrderInvalidUuid || unknownOrderPick ? true : undefined
            }
          />
          <select
            className="input w-full font-mono text-xs"
            aria-label="Choose order"
            value={
              allOrders.some((o) => o.id === orderId.trim()) ? orderId : ""
            }
            onChange={(e) => setOrderId(e.target.value)}
          >
            <option value="">— Or choose from dropdown —</option>
            {filteredOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.projectName} · {o.status} · #{shortOrderTail(o.id)}
              </option>
            ))}
          </select>
          {typedOrderInvalidUuid ? (
            <p className="mt-2 text-xs text-[color:var(--danger)]">
              This isn&apos;t formatted like a UUID. Pick a completion from browser
              hints or use the dropdown so the backend accepts the identifier.
            </p>
          ) : unknownOrderPick ? (
            <p className="mt-2 text-xs text-[color:var(--danger)]">
              No order matches that ID among the orders loaded for your account.
              Reload if you recently created orders, or pick another from the list.
            </p>
          ) : null}
          {filteredOrders.length === 0 ? (
            <p className="mt-2 text-xs text-[color:var(--danger)]">
              No orders returned for your account here. Adjust the project filter or
              create an order before linking one.
            </p>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Photo (optional, max 2.5 MB)
          </span>
          <input
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {error ? (
          <p className="text-xs text-[color:var(--danger)]">{error}</p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? "Submitting…" : "Open dispute"}
          </button>
          <Link href="/disputes" className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
