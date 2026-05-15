ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "metadata_change_stage" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "pending_delete_requested" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "projects_metadata_change_stage_idx"
  ON "projects" ("metadata_change_stage")
  WHERE "metadata_change_stage" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "disputes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "photo_path" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "disputes_context_chk" CHECK (
    "project_id" IS NOT NULL OR "order_id" IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS "disputes_created_by_idx" ON "disputes" ("created_by_id");

CREATE TABLE IF NOT EXISTS "dispute_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dispute_id" uuid NOT NULL REFERENCES "disputes"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dispute_messages_dispute_id_idx"
  ON "dispute_messages" ("dispute_id");
