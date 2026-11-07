CREATE TYPE "public"."notification_display" AS ENUM('bell', 'banner', 'modal');--> statement-breakpoint
ALTER TABLE "notification_campaigns" ADD COLUMN "display" "notification_display" DEFAULT 'bell' NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_notifications" ADD COLUMN "display" "notification_display" DEFAULT 'bell' NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_notifications" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_notifications" ADD COLUMN "hidden_until" timestamp with time zone;