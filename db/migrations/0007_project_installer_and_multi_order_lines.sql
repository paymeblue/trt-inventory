-- Allow multiple order lines per SKU (e.g. 10 physical boxes). Barcodes stay unique.
DROP INDEX IF EXISTS "order_items_order_product_unique";
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "installer_user_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_installer_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_installer_user_id_users_id_fk"
      FOREIGN KEY ("installer_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
