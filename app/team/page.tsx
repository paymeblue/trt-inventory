"use client";

import { useState } from "react";
import useSWR from "@/lib/swr";
import { useAuthedUser } from "@/components/session-context";
import type { Role } from "@/db/schema";

interface TeamResponse {
  users: {
    id: string;
    email: string;
    name: string;
    role: Role;
    createdAt: string;
  }[];
}

export default function TeamPage() {
  const me = useAuthedUser();
  const { data, mutate, isLoading } = useSWR<TeamResponse>("/api/users");

  if (!me) return null;

  if (me.role !== "pm") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">PM only</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Only project managers can invite installers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Create installer accounts and share the credentials directly. Each
          installer signs in with their own email + password and their scans
          are logged to their name.
        </p>
      </div>

      <InviteForm onCreated={mutate} />

      <section className="card overflow-hidden">
        <header className="border-b border-[color:var(--border)] px-6 py-4 text-sm font-semibold">
          Members {data && `(${data.users.length})`}
        </header>
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface-muted)] text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
            <tr>
              <th className="px-6 py-3 text-left">Name</th>
              <th className="px-6 py-3 text-left">Email</th>
              <th className="px-6 py-3 text-left">Role</th>
              <th className="px-6 py-3 text-left">Created</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {(data?.users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="px-6 py-3 font-medium">{u.name}</td>
                <td className="px-6 py-3 font-mono text-xs">{u.email}</td>
                <td className="px-6 py-3">
                  <span
                    className={`pill ${
                      u.role === "pm" ? "pill-active" : "pill-fulfilled"
                    }`}
                  >
                    {u.role === "pm" ? "PM" : "Installer"}
                  </span>
                </td>
                <td className="px-6 py-3 text-[color:var(--text-muted)]">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-3 text-right">
                  {u.id !== me.id ? (
                    <button
                      onClick={async () => {
                        if (!confirm(`Remove ${u.name}?`)) return;
                        await fetch(`/api/users/${u.id}`, {
                          method: "DELETE",
                        });
                        await mutate();
                      }}
                      className="text-xs font-semibold text-[color:var(--danger)] hover:underline"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-xs text-[color:var(--text-muted)]">
                      (you)
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.users ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-10 text-center text-sm text-[color:var(--text-muted)]"
                >
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function InviteForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("installer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    name: string;
  } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create user");
      setCreated({ email, password, name });
      setName("");
      setEmail("");
      setPassword("");
      setRole("installer");
      await onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold">Invite a teammate</h2>
      <p className="text-xs text-[color:var(--text-muted)]">
        Set a temporary password and share it with them over a secure channel.
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Full name
          </span>
          <input
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ada Installer"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Email
          </span>
          <input
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ada@company.com"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Temporary password (min 8 chars)
          </span>
          <input
            required
            minLength={8}
            className="input font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Role
          </span>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="installer">Installer (scans deliveries)</option>
            <option value="pm">Project Manager (full access)</option>
          </select>
        </label>

        {error && (
          <div className="md:col-span-2 rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-xs text-[color:var(--danger)]">
            {error}
          </div>
        )}

        <div className="md:col-span-2 flex justify-end">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>

      {created && (
        <div className="mt-4 rounded-lg border border-[color:var(--success)] bg-green-50 px-4 py-3 text-sm">
          <div className="font-semibold text-[color:var(--success)]">
            Account created for {created.name}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text)]">
            Share these credentials securely. The password is not shown again
            after you leave this page.
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
            <span className="text-[color:var(--text-muted)]">Email:</span>
            <span>{created.email}</span>
            <span className="text-[color:var(--text-muted)]">Password:</span>
            <span>{created.password}</span>
          </div>
        </div>
      )}
    </section>
  );
}
