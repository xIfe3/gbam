ALTER TYPE "public"."content_type" ADD VALUE 'marketing_page';--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"data" jsonb,
	"category" text,
	"seo_description" text,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_entry_version_uq" UNIQUE("entry_id","version")
);
--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_published_by_admin_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;