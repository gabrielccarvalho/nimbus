import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { DensityWindow, TimeRange } from "@/features/analysis/schema"
import type { CaptionOverrides, ClipStatus } from "@/features/clips/schema"
import type { JobStatus, JobType } from "@/features/jobs/schema"
import type { LayoutMode, Rect } from "@/features/layout/schema"
import type {
  AssetKind,
  AudioTrack,
  ProjectSettings,
  ProjectStatus,
  SourceAspect,
} from "@/features/projects/schema"
import type {
  LanguageSource,
  Segment,
  Word,
} from "@/features/transcription/schema"

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" })

const timestamps = {
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").$type<ProjectStatus>().notNull(),
    failedStep: text("failed_step").$type<ProjectStatus>(),
    error: text("error"),
    sourceAssetId: text("source_asset_id"),
    sourceUrl: text("source_url"),
    sourceLanguage: text("source_language"),
    settings: jsonb("settings").$type<ProjectSettings>().notNull(),
    awaitingManualSelection: boolean("awaiting_manual_selection")
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [index("projects_created_idx").on(t.createdAt)]
)

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AssetKind>().notNull(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    fps: doublePrecision("fps"),
    codec: text("codec"),
    audioTracks: jsonb("audio_tracks").$type<AudioTrack[]>(),
    ...timestamps,
  },
  (t) => [index("assets_project_kind_idx").on(t.projectId, t.kind)]
)

export const transcripts = pgTable("transcripts", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  languageSource: text("language_source").$type<LanguageSource>(),
  words: jsonb("words").$type<Word[]>().notNull(),
  segments: jsonb("segments").$type<Segment[]>().notNull(),
  ...timestamps,
})

export const signals = pgTable("signals", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  silences: jsonb("silences").$type<TimeRange[]>().notNull(),
  loudness: jsonb("loudness").$type<number[]>().notNull(),
  loudnessIntervalMs: integer("loudness_interval_ms").notNull(),
  speechDensity: jsonb("speech_density").$type<DensityWindow[]>().notNull(),
  ...timestamps,
})

export const layouts = pgTable("layouts", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourceAspect: text("source_aspect").$type<SourceAspect>().notNull(),
  webcamRect: jsonb("webcam_rect").$type<Rect | null>(),
  gameplayRect: jsonb("gameplay_rect").$type<Rect>().notNull(),
  gameplayFocusX: doublePrecision("gameplay_focus_x").notNull().default(0.5),
  mode: text("mode").$type<LayoutMode>().notNull(),
  confidence: doublePrecision("confidence").notNull().default(0),
  confirmedByUser: boolean("confirmed_by_user").notNull().default(false),
  ...timestamps,
})

export const layoutPresets = pgTable(
  "layout_presets",
  {
    id: text("id").primaryKey(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    webcamRect: jsonb("webcam_rect").$type<Rect | null>(),
    gameplayRect: jsonb("gameplay_rect").$type<Rect>().notNull(),
    gameplayFocusX: doublePrecision("gameplay_focus_x").notNull().default(0.5),
    mode: text("mode").$type<LayoutMode>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("layout_presets_resolution_idx").on(t.width, t.height)]
)

export const clips = pgTable(
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
    score: doublePrecision("score").notNull().default(0),
    status: text("status").$type<ClipStatus>().notNull().default("candidate"),
    captionOverrides: jsonb("caption_overrides").$type<CaptionOverrides>(),
    renderAssetId: text("render_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("clips_project_idx").on(t.projectId, t.score)]
)

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    type: text("type").$type<JobType>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamptz("run_after").notNull().defaultNow(),
    leasedUntil: timestamptz("leased_until"),
    leaseOwner: text("lease_owner"),
    progress: doublePrecision("progress").notNull().default(0),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
    ...timestamps,
  },
  (t) => [
    index("jobs_status_run_after_idx").on(t.status, t.runAfter),
    index("jobs_project_idx").on(t.projectId),
  ]
)

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  ...timestamps,
})
