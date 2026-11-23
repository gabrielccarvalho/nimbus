UPDATE "projects" SET "settings" = jsonb_build_object('reactionPhrases', '[]'::jsonb) || "settings";
