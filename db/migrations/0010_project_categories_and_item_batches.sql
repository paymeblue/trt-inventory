CREATE TABLE IF NOT EXISTS "project_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_categories_project_name_lower_unique"
  ON "project_categories" ("project_id", lower("name"));

CREATE INDEX IF NOT EXISTS "project_categories_project_id_idx"
  ON "project_categories" ("project_id");

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category_id" uuid REFERENCES "project_categories"("id") ON DELETE SET NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "batch_id" uuid;

CREATE INDEX IF NOT EXISTS "products_category_id_idx" ON "products" ("category_id");
CREATE INDEX IF NOT EXISTS "products_batch_id_idx" ON "products" ("batch_id");
