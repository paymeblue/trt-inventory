-- Store the reason a super-admin rejected a project so the PM can read it and act.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "rejection_reason" text;
