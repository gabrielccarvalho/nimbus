ALTER TABLE "clips" RENAME COLUMN "text_overlay" TO "text_overlays";--> statement-breakpoint
UPDATE "clips" SET "text_overlays" = CASE
  WHEN "text_overlays" IS NULL OR jsonb_typeof("text_overlays") <> 'object' THEN '[]'::jsonb
  ELSE jsonb_build_array(jsonb_build_object(
    'text', "text_overlays"->'text',
    'position', COALESCE("text_overlays"->'position', '"top"'::jsonb),
    'startMs', 0,
    'endMs', CASE
      WHEN jsonb_typeof("text_overlays"->'untilMs') = 'number'
        THEN LEAST(("text_overlays"->>'untilMs')::int, "end_ms" - "start_ms")
      ELSE "end_ms" - "start_ms"
    END,
    'lane', 0
  ))
END;--> statement-breakpoint
ALTER TABLE "clips" ALTER COLUMN "text_overlays" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "clips" ALTER COLUMN "text_overlays" SET NOT NULL;--> statement-breakpoint
UPDATE "clips" AS c SET "audio_mix" = jsonb_build_object(
  'sourceDb', COALESCE(c."audio_mix"->'sourceDb', '0'::jsonb),
  'sourceMuted', false,
  'duck', COALESCE(c."audio_mix"->'duck', 'true'::jsonb),
  'youtubeSound', COALESCE(c."audio_mix"->'youtubeSound', 'null'::jsonb),
  'music', COALESCE((
    SELECT jsonb_build_array(jsonb_build_object(
      'trackId', t."id",
      'startMs', 0,
      'endMs', LEAST(c."end_ms" - c."start_ms", t."duration_ms" - COALESCE((c."audio_mix"->>'trackStartMs')::int, 0)),
      'inMs', COALESCE((c."audio_mix"->>'trackStartMs')::int, 0),
      'db', COALESCE(c."audio_mix"->'musicDb', '-16'::jsonb),
      'fadeInMs', COALESCE(c."audio_mix"->'fadeInMs', '0'::jsonb),
      'fadeOutMs', COALESCE(c."audio_mix"->'fadeOutMs', '1500'::jsonb),
      'lane', 0
    ))
    FROM "music_tracks" AS t
    WHERE t."id" = c."audio_mix"->>'trackId'
      AND t."duration_ms" - COALESCE((c."audio_mix"->>'trackStartMs')::int, 0) >= 500
  ), '[]'::jsonb)
)
WHERE c."audio_mix" IS NOT NULL AND NOT (c."audio_mix" ? 'music');
