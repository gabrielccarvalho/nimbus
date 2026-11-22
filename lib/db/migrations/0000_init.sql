CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`width` integer,
	`height` integer,
	`fps` real,
	`codec` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assets_project_kind_idx` ON `assets` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`title` text NOT NULL,
	`hook` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`caption_overrides` text,
	`render_asset_id` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`render_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `clips_project_idx` ON `clips` (`project_id`,`score`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`leased_until` integer,
	`lease_owner` text,
	`progress` real DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_run_after_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `jobs` (`project_id`);--> statement-breakpoint
CREATE TABLE `layout_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`webcam_rect` text,
	`gameplay_rect` text NOT NULL,
	`gameplay_focus_x` real DEFAULT 0.5 NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `layout_presets_resolution_idx` ON `layout_presets` (`width`,`height`);--> statement-breakpoint
CREATE TABLE `layouts` (
	`project_id` text PRIMARY KEY NOT NULL,
	`source_aspect` text NOT NULL,
	`webcam_rect` text,
	`gameplay_rect` text NOT NULL,
	`gameplay_focus_x` real DEFAULT 0.5 NOT NULL,
	`mode` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`confirmed_by_user` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`failed_step` text,
	`error` text,
	`source_asset_id` text,
	`settings` text NOT NULL,
	`awaiting_manual_selection` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_created_idx` ON `projects` (`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`project_id` text PRIMARY KEY NOT NULL,
	`silences` text NOT NULL,
	`loudness` text NOT NULL,
	`loudness_interval_ms` integer NOT NULL,
	`speech_density` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`project_id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`words` text NOT NULL,
	`segments` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
