export type PendingCategoryAdd = {
  name: string;
  quantity: number;
};

export type PendingItemChange = {
  itemId: string;
  name?: string;
  sku?: string;
  delta?: number;
  reason?: string;
  delete?: boolean;
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
  itemChanges?: PendingItemChange[];
};

export function parseProjectPendingPatch(raw: unknown): ProjectPendingPatch | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ProjectPendingPatch;
}

export function pendingItemChangeMap(
  patch: unknown,
): Map<string, PendingItemChange> {
  const p = parseProjectPendingPatch(patch);
  const map = new Map<string, PendingItemChange>();
  for (const c of p?.itemChanges ?? []) {
    map.set(c.itemId, c);
  }
  return map;
}

export function mergeItemChangeIntoPatch(
  current: unknown,
  incoming: PendingItemChange,
): ProjectPendingPatch {
  const base = parseProjectPendingPatch(current) ?? {};
  const list = [...(base.itemChanges ?? [])];
  const idx = list.findIndex((c) => c.itemId === incoming.itemId);

  if (incoming.delete) {
    const entry: PendingItemChange = { itemId: incoming.itemId, delete: true };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    return { ...base, itemChanges: list };
  }

  if (idx >= 0) {
    const prev = list[idx]!;
    const { delete: _drop, ...rest } = incoming;
    list[idx] = {
      ...(prev.delete ? { itemId: prev.itemId } : prev),
      ...rest,
      itemId: incoming.itemId,
    };
  } else {
    list.push(incoming);
  }
  return { ...base, itemChanges: list };
}

export function mergeProjectPendingPatch(
  current: unknown,
  incoming: ProjectPendingPatch,
): ProjectPendingPatch {
  const base = parseProjectPendingPatch(current) ?? {};

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

  let next = base as ProjectPendingPatch;
  for (const ch of incoming.itemChanges ?? []) {
    next = mergeItemChangeIntoPatch(next, ch);
  }
  return next;
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
    (patch.categoryAdds?.length ?? 0) > 0 ||
    (patch.itemChanges?.length ?? 0) > 0
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
  for (const c of p.itemChanges ?? []) {
    if (c.delete) {
      lines.push(`Delete item (${c.itemId.slice(0, 8)}…)`);
      continue;
    }
    const parts: string[] = [];
    if (c.name) parts.push(`name → ${c.name}`);
    if (c.sku) parts.push(`SKU → ${c.sku}`);
    if (c.delta !== undefined && c.delta !== 0) {
      parts.push(`stock ${c.delta > 0 ? "+" : ""}${c.delta}`);
    }
    if (parts.length) {
      lines.push(`Item ${c.itemId.slice(0, 8)}…: ${parts.join(", ")}`);
    }
  }
  return lines;
}

/** Values shown in edit forms (live DB + staged patch). */
export function effectiveProjectFields(project: {
  name: string;
  description: string | null;
  siteAddress: string | null;
  siteLatitude: number | null;
  siteLongitude: number | null;
  pendingPatch: unknown;
}) {
  const patch = parseProjectPendingPatch(project.pendingPatch);
  return {
    name: patch?.name ?? project.name,
    description:
      patch?.description !== undefined
        ? patch.description
        : project.description,
    siteAddress: patch?.siteAddress ?? project.siteAddress,
    siteLatitude: patch?.siteLatitude ?? project.siteLatitude,
    siteLongitude: patch?.siteLongitude ?? project.siteLongitude,
  };
}

export function effectiveItemDisplay(
  item: { id: string; name: string; sku: string; stockQuantity: number },
  pending: PendingItemChange | undefined,
) {
  if (!pending || pending.delete) {
    return {
      name: item.name,
      sku: item.sku,
      stockQuantity: item.stockQuantity,
      pendingDelete: pending?.delete === true,
      hasPendingEdit: pending?.delete === true,
    };
  }
  let stock = item.stockQuantity;
  if (pending.delta !== undefined && pending.delta !== 0) {
    stock = item.stockQuantity + pending.delta;
  }
  return {
    name: pending.name ?? item.name,
    sku: pending.sku ?? item.sku,
    stockQuantity: stock,
    pendingDelete: false,
    hasPendingEdit:
      pending.name !== undefined ||
      pending.sku !== undefined ||
      (pending.delta !== undefined && pending.delta !== 0),
  };
}
