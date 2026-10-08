CREATE TABLE "daily_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"seller_id" uuid,
	"kind" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_visits_day_seller_kind_uq" UNIQUE NULLS NOT DISTINCT("day","seller_id","kind")
);
--> statement-breakpoint
ALTER TABLE "daily_visits" ADD CONSTRAINT "daily_visits_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;