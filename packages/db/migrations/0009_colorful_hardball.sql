CREATE TYPE "public"."tour_name" AS ENUM('dashboard', 'editor', 'order');--> statement-breakpoint
CREATE TYPE "public"."tour_outcome" AS ENUM('completed', 'skipped');--> statement-breakpoint
CREATE TABLE "seller_tours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"tour" "tour_name" NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"outcome" "tour_outcome",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seller_tours" ADD CONSTRAINT "seller_tours_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_tours_seller_tour_idx" ON "seller_tours" USING btree ("seller_id","tour");