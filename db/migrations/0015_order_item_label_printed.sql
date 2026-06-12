-- PM marks packing labels as printed on the print-barcodes page, so the
-- remaining-to-print count decrements per barcode.
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "label_printed_at" timestamptz;
