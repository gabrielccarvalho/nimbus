import { sql } from "drizzle-orm"
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

import type { DensityWindow, TimeRange } from "@/features/analysis/schema"
import type { CaptionOverrides, ClipStatus } from "@/features/clips/schema"
import type { JobStatus, JobType } from "@/features/jobs/schema"
import type { LayoutMode, Rect } from "@/features/layout/schema"
import type {
  AssetKind,
  ProjectSettings,
  ProjectStatus,
  SourceAspect,
} from "@/features/projects/schema"
import type { Segment, Word } from "@/features/transcription/schema"

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
}

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").$type<ProjectStatus>().notNull(),
    failedStep: text("failed_step").$type<ProjectStatus>(),
    error: text("error"),
    sourceAssetId: text("source_asset_id"),
    sourceUrl: text("source_url"),
    settings: text("settings", { mode: "json" })
      .$type<ProjectSettings>()
      .notNull(),
    awaitingManualSelection: integer("awaiting_manual_selection", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [index("projects_created_idx").on(t.createdAt)]
)

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AssetKind>().notNull(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull().default(0),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    fps: real("fps"),
    codec: text("codec"),
    ...timestamps,
  },
  (t) => [index("assets_project_kind_idx").on(t.projectId, t.kind)]
)

export const transcripts = sqliteTable("transcripts", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  words: text("words", { mode: "json" }).$type<Word[]>().notNull(),
  segments: text("segments", { mode: "json" }).$type<Segment[]>().notNull(),
  ...timestamps,
})

export const signals = sqliteTable("signals", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  silences: text("silences", { mode: "json" }).$type<TimeRange[]>().notNull(),
  loudness: text("loudness", { mode: "json" }).$type<number[]>().notNull(),
  loudnessIntervalMs: integer("loudness_interval_ms").notNull(),
  speechDensity: text("speech_density", { mode: "json" })
    .$type<DensityWindow[]>()
    .notNull(),
  ...timestamps,
})

export const layouts = sqliteTable("layouts", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourceAspect: text("source_aspect").$type<SourceAspect>().notNull(),
  webcamRect: text("webcam_rect", { mode: "json" }).$type<Rect | null>(),
  gameplayRect: text("gameplay_rect", { mode: "json" }).$type<Rect>().notNull(),
  gameplayFocusX: real("gameplay_focus_x").notNull().default(0.5),
  mode: text("mode").$type<LayoutMode>().notNull(),
  confidence: real("confidence").notNull().default(0),
  confirmedByUser: integer("confirmed_by_user", { mode: "boolean" })
    .notNull()
    .default(false),
  ...timestamps,
})

export const layoutPresets = sqliteTable(
  "layout_presets",
  {
    id: text("id").primaryKey(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    webcamRect: text("webcam_rect", { mode: "json" }).$type<Rect | null>(),
    gameplayRect: text("gameplay_rect", { mode: "json" })
      .$type<Rect>()
      .notNull(),
    gameplayFocusX: real("gameplay_focus_x").notNull().default(0.5),
    mode: text("mode").$type<LayoutMode>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("layout_presets_resolution_idx").on(t.width, t.height)]
)

export const clips = sqliteTable(
  "clips",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull().default(""),
    reason: text("reason").notNull().default(""),
    score: real("score").notNull().default(0),
    status: text("status").$type<ClipStatus>().notNull().default("candidate"),
    captionOverrides: text("caption_overrides", {
      mode: "json",
    }).$type<CaptionOverrides>(),
    renderAssetId: text("render_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("clips_project_idx").on(t.projectId, t.score)]
)

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    type: text("type").$type<JobType>().notNull(),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: integer("run_after", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    leasedUntil: integer("leased_until", { mode: "timestamp_ms" }),
    leaseOwner: text("lease_owner"),
    progress: real("progress").notNull().default(0),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    index("jobs_status_run_after_idx").on(t.status, t.runAfter),
    index("jobs_project_idx").on(t.projectId),
  ]
)

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  ...timestamps,
})
