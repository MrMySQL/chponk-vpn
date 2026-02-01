CREATE TABLE IF NOT EXISTS "user_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"server_id" integer NOT NULL,
	"xui_client_email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_connections_subscription_id_server_id_unique" UNIQUE("subscription_id","server_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
