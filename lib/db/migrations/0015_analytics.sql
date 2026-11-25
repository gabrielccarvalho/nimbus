CREATE TABLE "channel_daily" (
	"channel_id" text NOT NULL,
	"day" date NOT NULL,
	"content_type" text NOT NULL,
	"views" integer NOT NULL,
	"likes" integer NOT NULL,
	"comments" integer NOT NULL,
	"shares" integer NOT NULL,
	"subscribers_gained" integer NOT NULL,
	"subscribers_lost" integer NOT NULL,
	"estimated_minutes_watched" double precision NOT NULL,
	"average_view_duration_s" double precision,
	CONSTRAINT "channel_daily_channel_id_day_content_type_pk" PRIMARY KEY("channel_id","day","content_type")
);
--> statement-breakpoint
CREATE TABLE "publication_daily" (
	"publication_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer NOT NULL,
	"estimated_minutes_watched" double precision NOT NULL,
	"likes" integer NOT NULL,
	"subscribers_gained" integer NOT NULL,
	CONSTRAINT "publication_daily_publication_id_day_pk" PRIMARY KEY("publication_id","day")
);
--> statement-breakpoint
ALTER TABLE "publications" DROP CONSTRAINT "publications_channel_id_youtube_channels_id_fk";
--> statement-breakpoint
ALTER TABLE "publications" ALTER COLUMN "clip_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "origin" text DEFAULT 'nimbus' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD COLUMN "uploads_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD COLUMN "analytics_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_daily" ADD CONSTRAINT "channel_daily_channel_id_youtube_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_daily" ADD CONSTRAINT "publication_daily_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_channel_id_youtube_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publications_imported_video_idx" ON "publications" USING btree ("channel_id","video_id") WHERE "publications"."origin" = 'imported';--> statement-breakpoint
UPDATE "publications" SET "duration_ms" = "clip_end_ms" - "clip_start_ms" WHERE "clip_end_ms" IS NOT NULL;
