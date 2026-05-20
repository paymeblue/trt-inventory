DO $$ BEGIN
  CREATE TYPE "dispute_status" AS ENUM (
    'open',
    'under_review',
    'awaiting_response',
    'resolved',
    'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "dispute_category" AS ENUM (
    'delivery_shortage',
    'wrong_item',
    'damaged_goods',
    'scan_verification',
    'documentation',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "dispute_priority" AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "disputes"
  ADD COLUMN IF NOT EXISTS "status" "dispute_status" NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "category" "dispute_category",
  ADD COLUMN IF NOT EXISTS "priority" "dispute_priority" NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "resolution_summary" text,
  ADD COLUMN IF NOT EXISTS "resolved_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "closed_at" timestamptz;

CREATE INDEX IF NOT EXISTS "disputes_status_idx" ON "disputes" ("status");
CREATE INDEX IF NOT EXISTS "disputes_assigned_to_idx" ON "disputes" ("assigned_to_id");

CREATE TABLE IF NOT EXISTS "dispute_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dispute_events_dispute_id_idx"
  ON "dispute_events" ("dispute_id");
