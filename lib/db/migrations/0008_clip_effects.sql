ALTER TABLE "clips" ADD COLUMN "effects" jsonb;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "beats" jsonb;--> statement-breakpoint
UPDATE "projects" SET "settings" = jsonb_build_object('autoEffects', true) || "settings";
