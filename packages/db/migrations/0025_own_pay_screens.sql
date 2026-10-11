ALTER TABLE "payments" ADD COLUMN "method" text DEFAULT 'checkout' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "instructions" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expires_at" timestamp with time zone;