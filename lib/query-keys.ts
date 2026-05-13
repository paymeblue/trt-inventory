/** Shared React Query keys — invalidate prefixes so all related views refresh. */
export const queryKeys = {
  projects: ["projects"] as const,
  orders: ["orders"] as const,
  projectDetail: (id: string) => ["project-detail", id] as const,
  orderDetail: (id: string) => ["order-detail", id] as const,
  approvalsSa: ["approvals", "super_admin"] as const,
  approvalsLogistics: ["approvals", "logistics"] as const,
  logisticsGate: (projectId: string) => ["logistics-gate", projectId] as const,
};

/** After approval or project mutations, callers should invalidate these. */
export function invalidateWorkspaceProjects(qc: {
  invalidateQueries: (opts: {
    queryKey: readonly unknown[];
  }) => Promise<unknown>;
}) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.projects }),
    qc.invalidateQueries({ queryKey: ["project-detail"] }),
    qc.invalidateQueries({ queryKey: queryKeys.approvalsSa }),
    qc.invalidateQueries({ queryKey: ["logistics-gate"] }),
  ]);
}

export function invalidateWorkspaceOrders(qc: {
  invalidateQueries: (opts: {
    queryKey: readonly unknown[];
  }) => Promise<unknown>;
}) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.orders }),
    qc.invalidateQueries({ queryKey: ["order-detail"] }),
  ]);
}

export function invalidateAllApprovalSurface(qc: Parameters<
  typeof invalidateWorkspaceProjects
>[0]) {
  return Promise.all([
    invalidateWorkspaceProjects(qc),
    invalidateWorkspaceOrders(qc),
  ]);
}
