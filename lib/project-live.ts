import type { ProjectApprovalStatus } from "@/db/schema";

/** Project is on the approval path or already live on site — metadata edits queue. */
export function projectLivesOnSite(approvalStatus: ProjectApprovalStatus): boolean {
  return (
    approvalStatus === "active" || approvalStatus === "pending_logistics"
  );
}

export function projectMetadataMustQueue(
  role: string,
  approvalStatus: ProjectApprovalStatus,
): boolean {
  if (role === "super_admin") return projectLivesOnSite(approvalStatus);
  return role === "pm" && projectLivesOnSite(approvalStatus);
}

/** Logistics already cleared the warehouse at activation — receivers may scan. */
export function projectReadyForOnSiteVerification(
  approvalStatus: ProjectApprovalStatus,
): boolean {
  return approvalStatus === "active";
}
