export type PendingCategoryAdd = {
  name: string;
  quantity: number;
};

export type ProjectPendingPatch = {
  name?: string;
  description?: string | null;
  installerUserId?: string | null;
  siteAddress?: string;
  siteLatitude?: number;
  siteLongitude?: number;
  geofenceRadiusMeters?: number;
  categoryAdds?: PendingCategoryAdd[];
};

export function mergeProjectPendingPatch(
  current: unknown,
  incoming: ProjectPendingPatch,
): ProjectPendingPatch {
  const base =
    current && typeof current === "object"
      ? ({ ...(current as ProjectPendingPatch) } as ProjectPendingPatch)
      : ({} as ProjectPendingPatch);

  if (incoming.name !== undefined) base.name = incoming.name;
  if (incoming.description !== undefined) base.description = incoming.description;
  if (incoming.installerUserId !== undefined) {
    base.installerUserId = incoming.installerUserId;
  }
  if (incoming.siteAddress !== undefined) base.siteAddress = incoming.siteAddress;
  if (incoming.siteLatitude !== undefined) base.siteLatitude = incoming.siteLatitude;
  if (incoming.siteLongitude !== undefined) {
    base.siteLongitude = incoming.siteLongitude;
  }
  if (incoming.geofenceRadiusMeters !== undefined) {
    base.geofenceRadiusMeters = incoming.geofenceRadiusMeters;
  }
  if (incoming.categoryAdds?.length) {
    base.categoryAdds = [...(base.categoryAdds ?? []), ...incoming.categoryAdds];
  }

  return base;
}

export function pendingPatchHasWork(patch: ProjectPendingPatch | null): boolean {
  if (!patch) return false;
  return (
    patch.name !== undefined ||
    patch.description !== undefined ||
    patch.installerUserId !== undefined ||
    patch.siteAddress !== undefined ||
    patch.siteLatitude !== undefined ||
    patch.siteLongitude !== undefined ||
    patch.geofenceRadiusMeters !== undefined ||
    (patch.categoryAdds?.length ?? 0) > 0
  );
}

export function formatPendingPatchSummary(patch: unknown): string[] {
  if (!patch || typeof patch !== "object") return [];
  const p = patch as ProjectPendingPatch;
  const lines: string[] = [];
  if (p.name !== undefined) lines.push(`Name → ${p.name}`);
  if (p.description !== undefined) {
    lines.push(`Description → ${p.description ?? "(cleared)"}`);
  }
  if (p.installerUserId !== undefined) {
    lines.push(
      p.installerUserId
        ? `Receiver assignment updated`
        : `Receiver cleared (any receiver)`,
    );
  }
  if (p.siteAddress !== undefined) {
    lines.push(`Site address → ${p.siteAddress}`);
  }
  if (p.categoryAdds?.length) {
    for (const c of p.categoryAdds) {
      lines.push(`Add category “${c.name}” × ${c.quantity} units`);
    }
  }
  return lines;
}
