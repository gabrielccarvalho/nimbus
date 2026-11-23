UPDATE "projects" SET "settings" = jsonb_build_object('niche', 'auto') || "settings";
