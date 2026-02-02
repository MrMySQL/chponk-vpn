ALTER TABLE "user_connections" ADD COLUMN "traffic_up" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_connections" ADD COLUMN "traffic_down" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_connections" ADD COLUMN "last_synced_at" timestamp;