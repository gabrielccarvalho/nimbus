CREATE TABLE "insight_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"target" text NOT NULL,
	"kind" text NOT NULL,
	"rule_id" text,
	"text" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence_for" jsonb NOT NULL,
	"evidence_against" jsonb NOT NULL,
	"confidence" double precision NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playbook_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"target" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_suggestion_id" text,
	"supersedes_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "playbook_rule_ids" jsonb;--> statement-breakpoint
ALTER TABLE "insight_suggestions" ADD CONSTRAINT "insight_suggestions_channel_id_youtube_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_suggestions" ADD CONSTRAINT "insight_suggestions_rule_id_playbook_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."playbook_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD CONSTRAINT "playbook_rules_channel_id_youtube_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_suggestions_channel_idx" ON "insight_suggestions" USING btree ("channel_id","status");--> statement-breakpoint
CREATE INDEX "playbook_rules_channel_idx" ON "playbook_rules" USING btree ("channel_id","status");