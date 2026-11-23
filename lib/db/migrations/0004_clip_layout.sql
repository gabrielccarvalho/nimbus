ALTER TABLE "clips" ADD COLUMN "layout_override" jsonb;--> statement-breakpoint
ALTER TABLE "layout_presets" ADD COLUMN "cam_position" text DEFAULT 'top' NOT NULL;--> statement-breakpoint
ALTER TABLE "layouts" ADD COLUMN "cam_position" text DEFAULT 'top' NOT NULL;