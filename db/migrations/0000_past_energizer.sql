CREATE TYPE "public"."order_status" AS ENUM('draft', 'active', 'fulfilled', 'anomaly');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"barcode" text NOT NULL,
	"scanned_at" timestamp with time zone,
	"scanned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_name" text NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_barcode_unique" ON "order_items" USING btree ("barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_product_unique" ON "order_items" USING btree ("order_id","product_id");