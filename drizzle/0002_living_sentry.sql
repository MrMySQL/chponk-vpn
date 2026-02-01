ALTER TABLE "subscriptions" ALTER COLUMN "traffic_used_bytes" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "xui_base_path" text;