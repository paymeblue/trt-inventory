"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AddressPicker,
  type SiteSelection,
} from "@/components/address-picker";
import { invalidateWorkspaceBadges } from "@/lib/query-keys";
import type { ProjectApprovalStatus } from "@/db/schema";
import { projectLivesOnSite } from "@/lib/project-live";
import { effectiveProjectFields } from "@/lib/project-pending-patch";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  approvalStatus: ProjectApprovalStatus;
  pendingPatch: unknown;
  siteAddress: string | null;
  siteLatitude: number | null;
  siteLongitude: number | null;
  geofenceRadiusMeters: number;
};

export function ProjectEditPanel({
  project,
  onChanged,
}: {
  project: ProjectRow;
  onChanged: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const livesOnSite = projectLivesOnSite(project.approvalStatus);
  const effective = useMemo(
    () => effectiveProjectFields(project),
    [project],
  );

  const [name, setName] = useState(effective.name);
  const [description, setDescription] = useState(effective.description ?? "");
  const [site, setSite] = useState<SiteSelection | null>(
    effective.siteLatitude != null &&
      effective.siteLongitude != null &&
      effective.siteAddress
      ? {
          siteAddress: effective.siteAddress,
          siteLatitude: effective.siteLatitude,
          siteLongitude: effective.siteLongitude,
        }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    const next = effectiveProjectFields(project);
    setName(next.name);
    setDescription(next.description ?? "");
    setSite(
      next.siteLatitude != null &&
        next.siteLongitude != null &&
        next.siteAddress
        ? {
            siteAddress: next.siteAddress,
            siteLatitude: next.siteLatitude,
            siteLongitude: next.siteLongitude,
          }
        : null,
    );
  }, [project]);

  const hasChanges = useMemo(() => {
    const descTrim = description.trim();
    const prevDesc = (effective.description ?? "").trim();
    const siteChanged =
      !!site &&
      (site.siteAddress !== (effective.siteAddress ?? "") ||
        site.siteLatitude !== effective.siteLatitude ||
        site.siteLongitude !== effective.siteLongitude);
    const siteCleared =
      !site &&
      (effective.siteAddress != null ||
        effective.siteLatitude != null ||
        effective.siteLongitude != null);
    return (
      name.trim() !== effective.name ||
      descTrim !== prevDesc ||
      siteChanged ||
      siteCleared
    );
  }, [name, description, site, effective]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges) {
      setErr("Change the title, description, or site before saving.");
      return;
    }
    setBusy(true);
    setErr(null);
    setQueued(false);
    try {
      const payload: Record<string, unknown> = {};
      if (name.trim() !== effective.name) payload.name = name.trim();
      const descTrim = description.trim();
      const prevDesc = (effective.description ?? "").trim();
      if (descTrim !== prevDesc) {
        payload.description = descTrim.length ? descTrim : null;
      }
      const siteChanged =
        site &&
        (site.siteAddress !== (effective.siteAddress ?? "") ||
          site.siteLatitude !== effective.siteLatitude ||
          site.siteLongitude !== effective.siteLongitude);
      if (siteChanged && site) {
        payload.siteAddress = site.siteAddress;
        payload.siteLatitude = site.siteLatitude;
        payload.siteLongitude = site.siteLongitude;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        queuedForApproval?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      if (json.queuedForApproval) setQueued(true);
      await onChanged();
      await invalidateWorkspaceBadges(qc);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold">Project details</h2>
      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
        {livesOnSite
          ? "Edits to the title, description, or site address are sent to super-admin, then logistics, before they go live."
          : "You can update details while this project is still in the approval pipeline."}
      </p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Project title
          </span>
          <input
            className="input w-full"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Description
          </span>
          <textarea
            className="input w-full"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <AddressPicker value={site} onChange={setSite} required={false} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !hasChanges}
          >
            {busy ? "Saving…" : livesOnSite ? "Submit for approval" : "Save"}
          </button>
        </div>
        {queued ? (
          <p className="text-xs text-[color:var(--info)]">
            Submitted for super-admin approval.
          </p>
        ) : null}
        {err ? <p className="text-xs text-[color:var(--danger)]">{err}</p> : null}
      </form>
    </section>
  );
}
