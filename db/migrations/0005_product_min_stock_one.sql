-- 0005_product_min_stock_one.sql
-- ---------------------------------------------------------------------
-- Business rule: on-hand stock for a project item defaults to 1 and
-- cannot be set to 0 via create/update (scans may still decrement).
-- Bump existing zeros to 1; new rows default to 1.
-- ---------------------------------------------------------------------

UPDATE "products" SET "stock_quantity" = 1 WHERE "stock_quantity" = 0;
--> statement-breakpoint

ALTER TABLE "products" ALTER COLUMN "stock_quantity" SET DEFAULT 1;
