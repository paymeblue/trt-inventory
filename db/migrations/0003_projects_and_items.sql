-- 0003_projects_and_items.sql
-- ---------------------------------------------------------------------
-- Replace the flat warehouse with Project-scoped items.
--   * new `projects` table
--   * `products` gains project_id FK + composite (project_id, sku) unique
--   * `orders` gains project_id FK, drops `project_name`
-- Pre-existing data is reassigned to an auto-created "Legacy Project"
-- so nothing is silently dropped when the user re-runs migrations.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "projects_created_by_id_users_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "projects_name_unique" ON "projects" ("name");
--> statement-breakpoint

-- Add project_id as nullable on both products and orders so we can backfill.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "project_id" uuid;
--> statement-breakpoint

ALTER TABLE "orders"   ADD COLUMN IF NOT EXISTS "project_id" uuid;
--> statement-breakpoint

-- Backfill: bucket every pre-existing product and order under a single
-- "Legacy Project" so the new NOT NULL constraint is satisfiable. If the
-- database was already empty, this block is a no-op.
DO $$
DECLARE
  legacy_id uuid;
  has_products boolean;
  has_orders   boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM "products") INTO has_products;
  SELECT EXISTS (SELECT 1 FROM "orders")   INTO has_orders;

  IF has_products OR has_orders THEN
    SELECT id INTO legacy_id FROM "projects" WHERE name = 'Legacy Project' LIMIT 1;
    IF legacy_id IS NULL THEN
      INSERT INTO "projects" ("name", "description")
      VALUES (
        'Legacy Project',
        'Auto-created to scope pre-existing warehouse items and orders during the project refactor. Safe to rename or reorganise.'
      )
      RETURNING id INTO legacy_id;
    END IF;

    UPDATE "products" SET "project_id" = legacy_id WHERE "project_id" IS NULL;
    UPDATE "orders"   SET "project_id" = legacy_id WHERE "project_id" IS NULL;
  END IF;
END $$;
--> statement-breakpoint

-- Lock down project_id on products and wire the FK.
ALTER TABLE "products" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "products"
  ADD CONSTRAINT "products_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Swap the global (sku) uniqueness for per-project (project_id, sku).
DROP INDEX IF EXISTS "products_sku_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_project_sku_unique"
  ON "products" ("project_id", "sku");
--> statement-breakpoint

-- Lock down project_id on orders and wire the FK.
ALTER TABLE "orders" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT;
--> statement-breakpoint

-- Drop the free-text project_name column; it's superseded by projects.name.
ALTER TABLE "orders" DROP COLUMN IF EXISTS "project_name";
