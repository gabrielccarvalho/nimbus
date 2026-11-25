CREATE TABLE "publication_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"views" integer NOT NULL,
	"likes" integer NOT NULL,
	"comments" integer NOT NULL,
	"average_view_duration_s" double precision,
	"average_view_percentage" double precision,
	"retention" jsonb
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "clip_start_ms" integer;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "clip_end_ms" integer;--> statement-breakpoint
ALTER TABLE "publication_stats" ADD CONSTRAINT "publication_stats_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_stats_publication_idx" ON "publication_stats" USING btree ("publication_id","fetched_at");--> statement-breakpoint
UPDATE "publications" p SET "clip_start_ms" = c."start_ms", "clip_end_ms" = c."end_ms" FROM "clips" c WHERE c."id" = p."clip_id";
