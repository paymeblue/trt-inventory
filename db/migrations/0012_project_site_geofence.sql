-- Project site (geofence anchor) and scan location audit
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "site_address" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "site_latitude" double precision;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "site_longitude" double precision;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "geofence_radius_meters" integer NOT NULL DEFAULT 500;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "scan_latitude" double precision;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "scan_longitude" double precision;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "geofence_flagged" boolean NOT NULL DEFAULT false;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "logistics_scan_latitude" double precision;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "logistics_scan_longitude" double precision;
