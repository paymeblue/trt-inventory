"use client";

import { useState } from "react";
import useSWR from "@/lib/swr";
import { useAuthedUser } from "@/components/session-context";
import type { Product } from "@/db/schema";

interface ProductsResponse {
  products: Product[];
}

export default function WarehousePage() {
  const user = useAuthedUser();
  const { data, mutate, isLoading } =
    useSWR<ProductsResponse>("/api/products");

  if (!user) return null;

  if (user.role !== "pm") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">PM only</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Only project managers can manage warehouse stock.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Warehouse</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Add SKUs to the warehouse and manage their stock. Each successful
          scan on a delivery decrements the stock by 1.
        </p>
      </div>

      <NewProductForm onCreated={mutate} />

      <section className="card overflow-hidden">
        <header className="border-b border-[color:var(--border)] px-6 py-4 text-sm font-semibold">
          Inventory {data && `(${data.products.length} SKUs)`}
        </header>
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
            <tr>
              <th className="px-6 py-3 text-left">SKU</th>
              <th className="px-6 py-3 text-left">Name</th>
              <th className="px-6 py-3 text-right">Stock</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {(data?.products ?? []).map((p) => (
              <ProductRow key={p.id} product={p} onChanged={mutate} />
            ))}
            {!isLoading && (data?.products ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]"
                >
                  No products yet. Add your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function NewProductForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [stock, setStock] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim(),
          name: name.trim(),
          stockQuantity: Math.max(0, parseInt(stock || "0", 10) || 0),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create product");
      setSku("");
      setName("");
      setStock("0");
      await onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold">Add a SKU</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="block md:col-span-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            SKU
          </span>
          <input
            required
            className="input font-mono"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="PRD-0001"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Name
          </span>
          <input
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 2kW Inverter"
          />
        </label>
        <label className="block md:col-span-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Initial stock
          </span>
          <input
            type="number"
            min={0}
            required
            className="input"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </label>
        {error && (
          <div className="md:col-span-4 rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-xs text-[color:var(--danger)]">
            {error}
          </div>
        )}
        <div className="md:col-span-4 flex justify-end">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Add to warehouse"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProductRow({
  product,
  onChanged,
}: {
  product: Product;
  onChanged: () => Promise<void>;
}) {
  const [delta, setDelta] = useState("0");
  const [busy, setBusy] = useState(false);

  async function restock(sign: 1 | -1) {
    const amt = Math.abs(parseInt(delta || "0", 10) || 0);
    if (!amt) return;
    setBusy(true);
    try {
      await fetch(`/api/products/${product.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          delta: sign * amt,
          reason: sign > 0 ? "restock" : "adjustment",
        }),
      });
      setDelta("0");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const negative = product.stockQuantity < 0;

  return (
    <tr>
      <td className="px-6 py-3 font-mono">{product.sku}</td>
      <td className="px-6 py-3">{product.name}</td>
      <td
        className={`px-6 py-3 text-right font-mono text-base font-semibold ${
          negative
            ? "text-[color:var(--danger)]"
            : product.stockQuantity === 0
              ? "text-[color:var(--warning)]"
              : "text-[color:var(--text)]"
        }`}
      >
        {product.stockQuantity}
      </td>
      <td className="px-6 py-3">
        <div className="flex items-center justify-end gap-2">
          <input
            type="number"
            min={0}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="input w-20 text-right"
          />
          <button
            onClick={() => restock(1)}
            className="btn btn-ghost text-xs"
            disabled={busy}
          >
            + add
          </button>
          <button
            onClick={() => restock(-1)}
            className="btn btn-ghost text-xs"
            disabled={busy}
          >
            − remove
          </button>
        </div>
      </td>
    </tr>
  );
}
