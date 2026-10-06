CREATE TYPE "public"."issue_reason" AS ENUM('paid_not_marked', 'not_received', 'wrong_or_damaged', 'other');--> statement-breakpoint
CREATE TABLE "order_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" "issue_reason" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_key" text;--> statement-breakpoint
-- Existing orders get a random 64-character key (two random UUIDs without dashes). New orders
-- get theirs from the app (32 random bytes). Then the column becomes required.
UPDATE "orders" SET "tracking_key" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') WHERE "tracking_key" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tracking_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_email" text;--> statement-breakpoint
ALTER TABLE "order_issues" ADD CONSTRAINT "order_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_issues_order_idx" ON "order_issues" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tracking_key_uq" ON "orders" USING btree ("tracking_key");
