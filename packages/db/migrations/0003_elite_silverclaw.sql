CREATE TYPE "public"."whatsapp_status" AS ENUM('accepted', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"wamid" text,
	"template" text NOT NULL,
	"to_phone" text NOT NULL,
	"status" "whatsapp_status" NOT NULL,
	"error_code" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_wamid_unique" UNIQUE("wamid")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_order_idx" ON "whatsapp_messages" USING btree ("order_id");