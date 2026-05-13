-- Extend user_role enum (Postgres: add values safely)
DO $$ BEGIN
  ALTER TYPE "user_role" ADD VALUE 'logistics';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "user_role" ADD VALUE 'super_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "project_approval_status" AS ENUM (
    'pending_super_admin',
    'rejected_super_admin',
    'pending_logistics',
    'rejected_logistics',
    'active'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "approval_status" "project_approval_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "pending_patch" jsonb;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "project_barcode" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_project_barcode_unique" ON "projects" ("project_barcode") WHERE "project_barcode" IS NOT NULL;
