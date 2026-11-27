ALTER TABLE "clips" ADD COLUMN "parts" jsonb;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "clip_parts" jsonb;