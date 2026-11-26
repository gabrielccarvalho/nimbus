ALTER TABLE "clips" ADD COLUMN "layout" jsonb;--> statement-breakpoint
UPDATE "clips" AS c SET "layout" = coalesce(
  c."layout_override",
  (
    SELECT jsonb_build_object(
      'webcamRect', l."webcam_rect",
      'gameplayRect', l."gameplay_rect",
      'gameplayFocusX', l."gameplay_focus_x",
      'mode', l."mode",
      'camPosition', l."cam_position"
    )
    FROM "layouts" AS l
    WHERE l."project_id" = c."project_id"
  ),
  '{"webcamRect":null,"gameplayRect":{"x":0,"y":0,"w":1,"h":1},"gameplayFocusX":0.5,"mode":"no-cam-fill","camPosition":"top"}'::jsonb
);--> statement-breakpoint
ALTER TABLE "clips" ALTER COLUMN "layout" SET DEFAULT '{"webcamRect":null,"gameplayRect":{"x":0,"y":0,"w":1,"h":1},"gameplayFocusX":0.5,"mode":"no-cam-fill","camPosition":"top"}'::jsonb;--> statement-breakpoint
ALTER TABLE "clips" ALTER COLUMN "layout" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clips" DROP COLUMN "layout_override";--> statement-breakpoint
UPDATE "projects" SET "status" = 'ready_for_review' WHERE "status" = 'awaiting_layout';--> statement-breakpoint
DROP TABLE "layout_presets";--> statement-breakpoint
DROP TABLE "layouts";
