CREATE TABLE "channel_top_videos" (
	"channel_id" text NOT NULL,
	"period" integer NOT NULL,
	"video_id" text NOT NULL,
	"views" integer NOT NULL,
	"through" date NOT NULL,
	CONSTRAINT "channel_top_videos_channel_id_period_video_id_pk" PRIMARY KEY("channel_id","period","video_id")
);
--> statement-breakpoint
ALTER TABLE "channel_top_videos" ADD CONSTRAINT "channel_top_videos_channel_id_youtube_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;