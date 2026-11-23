ALTER TABLE "assets" ADD COLUMN "audio_tracks" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_language" text;--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "language_source" text;--> statement-breakpoint
UPDATE "projects" SET "settings" = jsonb_build_object(
  'language', coalesce((SELECT "value"->>'transcriptionLanguage' FROM "settings" WHERE "key" = 'app'), 'auto'),
  'audioTrack', null,
  'renderQuality', coalesce((SELECT "value"->>'renderQuality' FROM "settings" WHERE "key" = 'app'), 'standard')
) || "settings";
--> statement-breakpoint
UPDATE "settings" SET "value" = ("value" - 'transcriptionLanguage') || jsonb_build_object('language', "value"->'transcriptionLanguage')
WHERE "key" = 'app' AND "value" ? 'transcriptionLanguage';
