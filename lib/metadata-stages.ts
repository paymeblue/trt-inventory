/** Staged edits to live projects: super-admin gate, then logistics applies. */
export const METADATA_PENDING_SUPER_ADMIN = "metadata_pending_super_admin";
export const METADATA_PENDING_LOGISTICS = "metadata_pending_logistics";

export type MetadataChangeStage =
  | typeof METADATA_PENDING_SUPER_ADMIN
  | typeof METADATA_PENDING_LOGISTICS;
