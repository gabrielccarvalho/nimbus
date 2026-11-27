CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_checkout_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "billing_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_paid_through" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_cancelled_at" timestamp with time zone;