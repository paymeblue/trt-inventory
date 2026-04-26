-- 0006_clamp_negative_product_stock.sql
-- ---------------------------------------------------------------------
-- Verifications must not drive on-hand quantity below 0 (enforced in
-- lib/scan-execute.ts). Repair any legacy rows that went negative.
-- ---------------------------------------------------------------------

UPDATE "products" SET "stock_quantity" = 0 WHERE "stock_quantity" < 0;
