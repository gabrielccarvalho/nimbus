import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type {
  AudiencePoint,
  DensityWindow,
  TimeRange,
} from "@/features/analysis/schema"
import type {
  AnalyticsPeriod,
  ChannelContentType,
} from "@/features/analytics/schema"
import type { TextOverlay } from "@/features/captions/overlay"
import type { CaptionOverrides, ClipStatus } from "@/features/clips/schema"
import type { Beat, ClipEffects } from "@/features/effects/schema"
import type { JobStatus, JobType } from "@/features/jobs/schema"
import { FILL_LAYOUT, type LayoutInput } from "@/features/layout/schema"
import type { PlanId, UsageKind } from "@/features/accounts/schema"
import type { AudioMix, MusicTrackStatus } from "@/features/music/schema"
import type {
  ChannelStatus,
  PublicationOrigin,
  PublicationStatus,
  PublishInput,
  QuotaKind,
} from "@/features/publishing/schema"
import type {
  RuleStatus,
  RuleTarget,
  SuggestionKind,
  SuggestionStatus,
} from "@/features/insights/schema"
import type { RetentionPoint } from "@/features/publishing/stats"
import type {
  AssetKind,
  AudioTrack,
  ProjectSettings,
  ProjectStatus,
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

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  ...timestamps,
})

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)]
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)]
)

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)]
)

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamptz("locked_until"),
  },
  (t) => [
    index("two_factor_secret_idx").on(t.secret),
    index("two_factor_user_idx").on(t.userId),
  ]
)

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  image: text("image"),
  anthropicKey: text("anthropic_key"),
  anthropicKeyHint: text("anthropic_key_hint"),
  ...timestamps,
})

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "member">().notNull().default("owner"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_members_pk").on(t.workspaceId, t.userId),
    index("workspace_members_user_idx").on(t.userId),
  ]
)

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    kind: text("kind").$type<UsageKind>().notNull(),
    amount: doublePrecision("amount").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_events_workspace_idx").on(t.workspaceId, t.createdAt)]
)

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    status: text("status").$type<ProjectStatus>().notNull(),
    failedStep: text("failed_step").$type<ProjectStatus>(),
    error: text("error"),
    sourceAssetId: text("source_asset_id"),
    sourceUrl: text("source_url"),
    sourceLanguage: text("source_language"),
    audienceHeatmap: jsonb("audience_heatmap").$type<AudiencePoint[]>(),
    settings: jsonb("settings").$type<ProjectSettings>().notNull(),
    awaitingManualSelection: boolean("awaiting_manual_selection")
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [
    index("projects_created_idx").on(t.createdAt),
    index("projects_workspace_idx").on(t.workspaceId, t.createdAt),
  ]
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
  cuts: jsonb("cuts").$type<number[]>().notNull().default([]),
  ...timestamps,
})

export const clips = pgTable(
  "clips",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    parts: jsonb("parts").$type<TimeRange[] | null>(),
    title: text("title").notNull(),
    hook: text("hook").notNull().default(""),
    description: text("description").notNull().default(""),
    reason: text("reason").notNull().default(""),
    score: doublePrecision("score").notNull().default(0),
    status: text("status").$type<ClipStatus>().notNull().default("candidate"),
    captionOverrides: jsonb("caption_overrides").$type<CaptionOverrides>(),
    layout: jsonb("layout").$type<LayoutInput>().notNull().default(FILL_LAYOUT),
    effects: jsonb("effects").$type<ClipEffects | null>(),
    beats: jsonb("beats").$type<Beat[] | null>(),
    playbookRuleIds: jsonb("playbook_rule_ids").$type<string[] | null>(),
    audioMix: jsonb("audio_mix").$type<AudioMix | null>(),
    textOverlays: jsonb("text_overlays")
      .$type<TextOverlay[]>()
      .notNull()
      .default([]),
    renderAssetId: text("render_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("clips_project_idx").on(t.projectId, t.score)]
)

export const musicTracks = pgTable(
  "music_tracks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    status: text("status").$type<MusicTrackStatus>().notNull().default("ready"),
    durationMs: integer("duration_ms"),
    peaks: jsonb("peaks").$type<number[]>(),
    error: text("error"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("music_tracks_workspace_idx").on(t.workspaceId, t.createdAt)]
)

export const youtubeChannels = pgTable("youtube_channels", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => account.id, {
    onDelete: "set null",
  }),
  channelId: text("channel_id").notNull(),
  title: text("title").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  status: text("status").$type<ChannelStatus>().notNull().default("ok"),
  uploadsSyncedAt: timestamptz("uploads_synced_at"),
  analyticsSyncedAt: timestamptz("analytics_synced_at"),
  ...timestamps,
})

export const playbookRules = pgTable(
  "playbook_rules",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => youtubeChannels.id, { onDelete: "cascade" }),
    target: text("target").$type<RuleTarget>().notNull(),
    text: text("text").notNull(),
    status: text("status").$type<RuleStatus>().notNull().default("active"),
    sourceSuggestionId: text("source_suggestion_id"),
    supersedesId: text("supersedes_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    retiredAt: timestamptz("retired_at"),
  },
  (t) => [index("playbook_rules_channel_idx").on(t.channelId, t.status)]
)

export const insightSuggestions = pgTable(
  "insight_suggestions",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => youtubeChannels.id, { onDelete: "cascade" }),
    target: text("target").$type<RuleTarget>().notNull(),
    kind: text("kind").$type<SuggestionKind>().notNull(),
    ruleId: text("rule_id").references(() => playbookRules.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    rationale: text("rationale").notNull(),
    evidenceFor: jsonb("evidence_for").$type<string[]>().notNull(),
    evidenceAgainst: jsonb("evidence_against").$type<string[]>().notNull(),
    confidence: doublePrecision("confidence").notNull(),
    status: text("status")
      .$type<SuggestionStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    decidedAt: timestamptz("decided_at"),
  },
  (t) => [index("insight_suggestions_channel_idx").on(t.channelId, t.status)]
)

export const publications = pgTable(
  "publications",
  {
    id: text("id").primaryKey(),
    clipId: text("clip_id").references(() => clips.id, {
      onDelete: "cascade",
    }),
    channelId: text("channel_id").references(() => youtubeChannels.id, {
      onDelete: "cascade",
    }),
    origin: text("origin")
      .$type<PublicationOrigin>()
      .notNull()
      .default("nimbus"),
    renderAssetId: text("render_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<PublishInput>().notNull(),
    status: text("status").$type<PublicationStatus>().notNull(),
    uploadUri: text("upload_uri"),
    videoId: text("video_id"),
    url: text("url"),
    error: text("error"),
    publishedAt: timestamptz("published_at"),
    clipStartMs: integer("clip_start_ms"),
    clipEndMs: integer("clip_end_ms"),
    clipParts: jsonb("clip_parts").$type<TimeRange[] | null>(),
    durationMs: integer("duration_ms"),
    dailySyncedAt: timestamptz("daily_synced_at"),
    ...timestamps,
  },
  (t) => [
    index("publications_clip_idx").on(t.clipId, t.createdAt),
    uniqueIndex("publications_imported_video_idx")
      .on(t.channelId, t.videoId)
      .where(sql`${t.origin} = 'imported'`),
  ]
)

export const publicationStats = pgTable(
  "publication_stats",
  {
    id: text("id").primaryKey(),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    comments: integer("comments").notNull(),
    averageViewDurationS: doublePrecision("average_view_duration_s"),
    averageViewPercentage: doublePrecision("average_view_percentage"),
    retention: jsonb("retention").$type<RetentionPoint[]>(),
  },
  (t) => [
    index("publication_stats_publication_idx").on(t.publicationId, t.fetchedAt),
  ]
)

export const publicationDaily = pgTable(
  "publication_daily",
  {
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    views: integer("views").notNull(),
    estimatedMinutesWatched: doublePrecision(
      "estimated_minutes_watched"
    ).notNull(),
    likes: integer("likes").notNull(),
    subscribersGained: integer("subscribers_gained").notNull(),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.day] })]
)

export const channelDaily = pgTable(
  "channel_daily",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => youtubeChannels.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    contentType: text("content_type").$type<ChannelContentType>().notNull(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull(),
    comments: integer("comments").notNull(),
    shares: integer("shares").notNull(),
    subscribersGained: integer("subscribers_gained").notNull(),
    subscribersLost: integer("subscribers_lost").notNull(),
    estimatedMinutesWatched: doublePrecision(
      "estimated_minutes_watched"
    ).notNull(),
    averageViewDurationS: doublePrecision("average_view_duration_s"),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.day, t.contentType] })]
)

export const channelTopVideos = pgTable(
  "channel_top_videos",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => youtubeChannels.id, { onDelete: "cascade" }),
    period: integer("period").$type<AnalyticsPeriod>().notNull(),
    videoId: text("video_id").notNull(),
    views: integer("views").notNull(),
    through: date("through", { mode: "string" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.period, t.videoId] })]
)

export const youtubeQuotaUsage = pgTable(
  "youtube_quota_usage",
  {
    id: text("id").primaryKey(),
    day: text("day").notNull(),
    workspaceId: text("workspace_id"),
    kind: text("kind").$type<QuotaKind>().notNull(),
    units: integer("units").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("youtube_quota_usage_day_idx").on(t.day)]
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

export const workerHeartbeats = pgTable("worker_heartbeats", {
  owner: text("owner").primaryKey(),
  capabilities: jsonb("capabilities").$type<unknown>().notNull(),
  seenAt: timestamptz("seen_at").notNull(),
})
