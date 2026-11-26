ALTER TABLE "music_tracks" ALTER COLUMN "duration_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "music_tracks" ALTER COLUMN "peaks" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "music_tracks" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "music_tracks" ADD COLUMN "error" text;