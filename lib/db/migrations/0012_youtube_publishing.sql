CREATE TABLE "publications" (
	"id" text PRIMARY KEY NOT NULL,
	"clip_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"render_asset_id" text,
	"metadata" jsonb NOT NULL,
	"status" text NOT NULL,
	"upload_uri" text,
	"video_id" text,
	"url" text,
	"error" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail_url" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_channels_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_quota_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"workspace_id" text,
	"kind" text NOT NULL,
	"units" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_channel_id_youtube_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_render_asset_id_assets_id_fk" FOREIGN KEY ("render_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD CONSTRAINT "youtube_channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD CONSTRAINT "youtube_channels_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publications_clip_idx" ON "publications" USING btree ("clip_id","created_at");--> statement-breakpoint
CREATE INDEX "youtube_quota_usage_day_idx" ON "youtube_quota_usage" USING btree ("day");