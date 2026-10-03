ALTER TABLE "payments" ADD COLUMN "platform_fee_kobo" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paystack_fee_kobo" bigint;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "fee_waived_until" timestamp with time zone;