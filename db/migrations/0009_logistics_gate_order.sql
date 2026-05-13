-- Gate order + per-line logistics scans (warehouse) before project activation.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_logistics_gate" boolean DEFAULT false NOT NULL;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "logistics_scanned_at" timestamp with time zone;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "logistics_scanned_by" text;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "logistics_scanned_by_id" uuid REFERENCES "users"("id");

CREATE UNIQUE INDEX IF NOT EXISTS "orders_one_logistics_gate_per_project_idx"
ON "orders" ("project_id")
WHERE "is_logistics_gate" = true;
