CREATE TABLE "worker_heartbeats" (
	"owner" text PRIMARY KEY NOT NULL,
	"capabilities" jsonb NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
