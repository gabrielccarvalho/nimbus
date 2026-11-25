# Analytics (Phase 33) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring a channel's past Shorts into Nimbus, give every Short a daily growth curve and a same-age comparison, store channel metrics split into Shorts and long-form, and show it all on a new `/analytics` page with Overview, Shorts and Insights tabs.

**Architecture:** Imported Shorts are `publications` rows with `clipId` null and `origin: "imported"`, so the Phase 31 `sync_stats` pipeline serves them unchanged. A new `features/analytics/` holds the pure logic (Short detection, cumulative curves, same-age ratio, period deltas), the `publication_daily`/`channel_daily` repository, and the queries and actions for the page. Two new worker jobs, `sync_uploads` (Data API, booked in the ledger) and `sync_channel` (Analytics, not booked), run on demand and from the worker's existing 30-minute timer; `sync_stats` gains one Analytics call for the daily curve and a 28-day re-sync.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + Postgres (PGlite in tests), zod, Base UI/shadcn (`chart` from the registry, Recharts 3.8.0), Vitest + MSW, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-24-analytics-and-music-design.md` (Constraints, and Phase 33 only). Builds on `docs/superpowers/plans/2026-11-24-youtube-stats-and-insights.md` (Phases 31–32).

## Global Constraints

- One Google Cloud project for every workspace: the Data API's 10,000 units/day are shared through the existing ledger (`spendQuota`, `YOUTUBE_DAILY_QUOTA`). Book every new Data API call; Analytics calls are not booked (ADR-0066).
- `channels.list`, `playlistItems.list` and `videos.list` cost 1 unit each. `playlistItems.list` pages at most 50; `videos.list` is sent at most 50 ids. The uploads playlist is `contentDetails.relatedPlaylists.uploads`. Duration is `contentDetails.duration` (ISO 8601).
- The Data API has no Shorts flag. `creatorContentType` values: `SHORTS`, `VIDEO_ON_DEMAND`, `LIVE_STREAM`, `STORY`, `UNSPECIFIED`. Map `SHORTS` → `shorts`, `VIDEO_ON_DEMAND` → `long`, everything else → `other`.
- A Short is `durationMs > 0 && durationMs ≤ 180_000`, unless a per-video `creatorContentType` probe answered, in which case it is `SHORTS`. The probe is tried in the HTTP client; record which path ran in ADR-0067.
- Analytics daily metrics per Short: `views`, `estimatedMinutesWatched`, `likes`, `subscribersGained`. Per channel: `views`, `estimatedMinutesWatched`, `averageViewDuration`, `likes`, `comments`, `shares`, `subscribersGained`, `subscribersLost`. Data lags 48–72 h. Columns are read by `columnHeaders[].name`, never by position. Missing days count as 0 views.
- Daily ranges: from the publish day (Short) or 90 days back (channel, first run), otherwise from the last stored day minus 3, through today (Pacific, `pacificDay`).
- Refresh cadence: Nimbus Shorts keep days 1, 2, 7, 28. After 28 days, and for every imported Short, a sync is due every 28 days (keeps `videos.list` data inside the 30-day rule).
- Same-age ratio: a Short's cumulative views at age N (its age capped at 28) over the median of other Shorts' cumulative views at the same age. No ratio under 2 days or with fewer than 3 peers.
- Developer Policies III.E.4: Analytics data may be kept; other Authorized Data (`videos.list` statistics and snippets) must be refreshed or deleted within 30 days.
- Non-goals: revenue, demographics, traffic sources, geography; transcripts or moments for imported Shorts; long-form rows in the Shorts table; more than one channel per workspace.
- Nothing publishes without a click; nothing changes a prompt without approval.
- Long work only in the worker. Files touching DB, network or secrets start with `import "server-only"`. `features/*` never imports `app/` or `components/`. Pure logic is unit tested.
- shadcn-first: `pnpm dlx shadcn@latest add chart` (base-nova, Recharts 3.8.0, depends on `card`). Chart colours from `--chart-1…5` tokens only. Each chart has a text summary and its data is also in a table.
- Comments only where code can't speak. Conventional Commits, no AI trailers or attribution lines. Never commit `.env*` or `data/`.
- Phase gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass.

## Review Focus

1. **A Short published through Nimbus is also in the uploads playlist:** the import skips it, so it is never listed twice and keeps its clip link (Task 5).
2. **Importing 200 past Shorts on a plan with a daily publish limit:** imported rows don't count towards "publishes a day", and the channel card still counts only clips published from Nimbus (Task 3).
3. **YouTube's 2–3 day lag:** a Short's age for the same-age ratio and the Overview period end at the last day YouTube has data for, not today, so the lag never reads as zero views (Tasks 1, 8).
4. **Reconnecting the workspace to a different YouTube channel:** the old channel's imported Shorts and channel metrics disappear instead of showing under the new channel (Task 3).
5. **The daily import on a channel with thousands of uploads, many long-form:** after the first full pass it reads only uploads from about the last week, costing about 2 units a day, not the whole playlist again (Task 5).

---

### Task 1: Pure analytics logic

**Files:**

- Create: `features/analytics/schema.ts`, `features/analytics/shorts.ts`, `features/analytics/shorts.test.ts`, `features/analytics/curves.ts`, `features/analytics/curves.test.ts`
- Modify: `features/publishing/stats.ts`, `features/publishing/stats.test.ts`, `features/publishing/schema.ts`

**Interfaces:**

- Produces:
  - In `features/publishing/schema.ts`: `publicationOrigins = ["nimbus", "imported"] as const`, `PublicationOrigin`; `quotaKinds` gains `"import"`.
  - In `features/analytics/schema.ts`:
    - `channelContentTypes = ["shorts", "long", "other"] as const`, `ChannelContentType`
    - `ANALYTICS_PERIODS = [7, 28, 90] as const`, `AnalyticsPeriod`, `DEFAULT_PERIOD = 28`, `parsePeriod(value: unknown): AnalyticsPeriod`
    - `ANALYTICS_SYNC_EVERY_MS = 24 * 3_600_000`, `CHANNEL_BACKFILL_DAYS = 90`, `LATE_DATA_DAYS = 3`, `UPLOADS_OVERLAP_DAYS = 7`
    - `type DailyViews = { day: string; views: number; estimatedMinutesWatched: number; likes: number; subscribersGained: number }`
    - `type ChannelDay = { day: string; contentType: ChannelContentType; views: number; estimatedMinutesWatched: number; averageViewDurationS: number | null; likes: number; comments: number; shares: number; subscribersGained: number; subscribersLost: number }`
    - `type VideoDetails = { videoId: string; title: string; publishedAt: Date; durationMs: number | null; privacy: PrivacyStatus; uploadStatus: string }`
  - In `features/analytics/shorts.ts`: `SHORT_MAX_MS = 180_000`, `parseIsoDuration(value: string): number | null`, `contentTypeOf(raw: string): ChannelContentType`, `isShort(video: { durationMs: number | null; contentType: string | null }): boolean`, `importableShort(video: VideoDetails, contentType: string | null): boolean`
  - In `features/analytics/curves.ts`:
    - `AGE_CAP_DAYS = 28`, `MIN_RATIO_AGE_DAYS = 2`, `MIN_PEERS = 3`
    - `addDays(day: string, days: number): string`, `daysBetween(from: string, to: string): number`
    - `cumulativeViews(rows: readonly { day: string; views: number }[], publishedDay: string, throughDay: string): number[]`
    - `type ViewCurve = { publicationId: string; cumulative: number[] }`
    - `relativePerformance(target: ViewCurve, peers: readonly ViewCurve[]): number | null`
    - `medianCurve(curves: readonly number[][]): (number | null)[]`
    - `type PeriodWindow = { from: string; to: string; previousFrom: string; previousTo: string }`, `periodWindow(period: AnalyticsPeriod, through: string): PeriodWindow`
    - `type PeriodTotals = { views: number; watchHours: number; netSubscribers: number; averageViewDurationS: number | null; likes: number }`
    - `periodSummary(days: readonly ChannelDay[], window: PeriodWindow): { current: PeriodTotals; previous: PeriodTotals; change: Record<keyof PeriodTotals, number | null> }`
    - `type DailyPoint = { day: string; shorts: number; long: number; other: number }`, `dailySeries(days: readonly ChannelDay[], from: string, to: string): DailyPoint[]`
  - In `features/publishing/stats.ts`: `STATS_RESYNC_DAYS = 28`; `statsSyncDue(publication: { publishedAt: Date; origin: PublicationOrigin }, lastFetchedAt: Date | null, now: Date): boolean`. The old `relativePerformance`/`PerformanceSample` stay until Task 8 removes them.

- [ ] **Step 1: Write the failing tests**

```ts
// shorts.test.ts
it("parses ISO 8601 durations", () => {
  expect(parseIsoDuration("PT59S")).toBe(59_000)
  expect(parseIsoDuration("PT1M5S")).toBe(65_000)
  expect(parseIsoDuration("PT3M")).toBe(180_000)
  expect(parseIsoDuration("PT1H")).toBe(3_600_000)
  expect(parseIsoDuration("P1DT0S")).toBe(86_400_000)
  expect(parseIsoDuration("P0D")).toBe(0)
  expect(parseIsoDuration("soon")).toBeNull()
})

it("uses duration unless the probe answered", () => {
  expect(isShort({ durationMs: 180_000, contentType: null })).toBe(true)
  expect(isShort({ durationMs: 180_001, contentType: null })).toBe(false)
  expect(isShort({ durationMs: 0, contentType: null })).toBe(false)
  expect(isShort({ durationMs: null, contentType: null })).toBe(false)
  expect(isShort({ durationMs: 150_000, contentType: "VIDEO_ON_DEMAND" })).toBe(
    false
  )
  expect(isShort({ durationMs: 170_000, contentType: "SHORTS" })).toBe(true)
})

it("imports only processed public or unlisted Shorts", () => {
  const v = {
    videoId: "v",
    title: "t",
    publishedAt: new Date(),
    durationMs: 30_000,
    privacy: "public" as const,
    uploadStatus: "processed",
  }
  expect(importableShort(v, null)).toBe(true)
  expect(importableShort({ ...v, privacy: "unlisted" }, null)).toBe(true)
  expect(importableShort({ ...v, privacy: "private" }, null)).toBe(false)
  expect(importableShort({ ...v, uploadStatus: "uploaded" }, null)).toBe(false)
})

it("maps creatorContentType", () => {
  expect(contentTypeOf("SHORTS")).toBe("shorts")
  expect(contentTypeOf("VIDEO_ON_DEMAND")).toBe("long")
  expect(contentTypeOf("LIVE_STREAM")).toBe("other")
  expect(contentTypeOf("UNSPECIFIED")).toBe("other")
})

// curves.test.ts
it("accumulates from the publish day, missing days as 0", () =>
  expect(
    cumulativeViews(
      [
        { day: "2026-11-01", views: 10 },
        { day: "2026-11-03", views: 5 },
      ],
      "2026-11-01",
      "2026-11-04"
    )
  ).toEqual([10, 10, 15, 15]))
it("caps the curve at day 28", () =>
  expect(cumulativeViews([], "2026-10-01", "2026-11-20")).toHaveLength(29))
it("is empty when the data ends before the publish day", () =>
  expect(cumulativeViews([], "2026-11-20", "2026-11-19")).toEqual([]))

const c = (publicationId: string, cumulative: number[]) => ({
  publicationId,
  cumulative,
})
const peers = [
  c("a", [10, 20, 40, 50]),
  c("b", [10, 30, 60]),
  c("c", [5, 10, 80, 90]),
  c("d", [1, 2]),
]
it("compares cumulative views with peers at the same age", () =>
  expect(relativePerformance(c("t", [50, 80, 120]), peers)).toBe(2))
```

Also assert:

- `relativePerformance(c("a", [10, 20, 40, 50]), [...peers, c("e", [0, 0, 0, 0])])` is `null` (only `c` and `e` reach day 3).
- `relativePerformance(c("t", [50, 80]), peers)` is `null` (younger than 2 days).
- `relativePerformance(c("t", [50, 80, 120]), peers.slice(0, 2))` is `null` (two peers).
- the target's own id in `peers` is ignored.
- three peers with 0 views at that age → `null`.
- `medianCurve([[1, 2, 3], [3, 4], [5, 6, 7]])` equals `[3, 4, null]` (a day needs 3 curves).
- `periodWindow(28, "2026-11-21")` equals `{ from: "2026-10-25", to: "2026-11-21", previousFrom: "2026-09-27", previousTo: "2026-10-24" }`.
- `periodSummary`: two `shorts` days (views 300, minutes 60, avg 12 s, subs +5/−1) and one `long` day (views 100, minutes 400, avg 240 s) in the window give `views: 700`, `watchHours: 520 / 60`, `netSubscribers: 8`, `averageViewDurationS: (300*12*2 + 100*240) / 700`. With an empty previous period every `change` is `null`; with previous views 350 the views change is `1`.
- `dailySeries` fills every day of the range with zeros and sums per content type.

```ts
// stats.test.ts (replaces the cadence test)
const nimbus = { publishedAt: at, origin: "nimbus" as const }
const imported = { publishedAt: at, origin: "imported" as const }
it("keeps days 1, 2, 7, 28, then re-syncs every 28 days", () => {
  expect(statsSyncDue(nimbus, null, plus(day - 1))).toBe(false)
  expect(statsSyncDue(nimbus, null, plus(day))).toBe(true)
  expect(statsSyncDue(nimbus, plus(day), plus(2 * day))).toBe(true)
  expect(statsSyncDue(nimbus, plus(28 * day), plus(56 * day - 1))).toBe(false)
  expect(statsSyncDue(nimbus, plus(28 * day), plus(56 * day))).toBe(true)
})
it("syncs imported Shorts at once, then every 28 days", () => {
  expect(statsSyncDue(imported, null, plus(400 * day))).toBe(true)
  expect(statsSyncDue(imported, plus(400 * day), plus(427 * day))).toBe(false)
  expect(statsSyncDue(imported, plus(400 * day), plus(428 * day))).toBe(true)
})
```

- [ ] **Step 2: Run** `pnpm vitest run features/analytics features/publishing/stats.test.ts` — expected FAIL (modules missing, signature mismatch).
- [ ] **Step 3: Implement.** Rules the tests leave open:
  - Days are `YYYY-MM-DD` strings; do date math in UTC on the string (`Date.UTC`), never local time.
  - `cumulativeViews` has length `min(daysBetween(publishedDay, throughDay), AGE_CAP_DAYS) + 1`; index `d` is the sum of views from `publishedDay` through `publishedDay + d`.
  - `relativePerformance`: `N = target.cumulative.length − 1`; peers are other ids with `cumulative.length > N`; result `target.cumulative[N] / median`.
  - `periodSummary`: `averageViewDurationS` is the views-weighted mean of the days' averages, `null` with 0 views. `change[k] = (current − previous) / previous`, `null` when previous is `null` or ≤ 0.
  - `statsSyncDue`: imported → `lastFetchedAt` null or `≤ now − 28 d`. Nimbus → the existing age rule, or age ≥ 28 d and `lastFetchedAt ≤ now − 28 d`.
  - Update `enqueueDueStatsSyncs` to pass `{ publishedAt, origin }` (the `origin` column arrives in Task 2; until then pass `"nimbus"`).
- [ ] **Step 4: Run** the same command — expected PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): short detection, same-age curves and period summaries"`

### Task 2: Schema, migration 0015, analytics repository and job types

**Files:**

- Modify: `lib/db/schema.ts`, `features/jobs/schema.ts`, `features/pipeline/state-machine.ts`, `features/pipeline/handlers.ts`, `features/publishing/repository.ts` (`spendQuota` bucket), `features/publishing/stats-service.ts` (pass `origin`)
- Create: `lib/db/migrations/0015_*` via `pnpm db:generate`, `features/analytics/repository.ts`, `tests/utils/publications.ts`
- Test: `tests/integration/analytics-repository.test.ts`

**Interfaces:**

- Consumes: Task 1 types.
- Produces:
  - `publications`: `clipId` nullable (FK unchanged, cascade); `origin` text `PublicationOrigin` not null default `"nimbus"`; `durationMs` int nullable; `channelId` FK changes to `on delete cascade` (channels are only deleted with their workspace, whose clips cascade anyway; without it imported rows would be orphaned); partial unique index `publications_imported_video_idx` on (`channelId`, `videoId`) `where origin = 'imported'`.
  - `youtube_channels`: `uploadsSyncedAt`, `analyticsSyncedAt` (timestamptz, nullable).
  - `publication_daily`: `publicationId` (FK cascade), `day` (`date`, mode `"string"`), `views` int, `estimatedMinutesWatched` double, `likes` int, `subscribersGained` int; primary key (`publicationId`, `day`).
  - `channel_daily`: `channelId` (FK → youtube_channels, cascade), `day` date string, `contentType` text, `views`, `likes`, `comments`, `shares`, `subscribersGained`, `subscribersLost` int, `estimatedMinutesWatched` double, `averageViewDurationS` double nullable; primary key (`channelId`, `day`, `contentType`).
  - Migration backfill appended to the generated SQL: `UPDATE "publications" SET "duration_ms" = "clip_end_ms" - "clip_start_ms" WHERE "clip_end_ms" IS NOT NULL;`
  - Job types `"sync_uploads"` (payload `{ channelId: string; pageToken?: string }`) and `"sync_channel"` (payload `{ channelId: string }`); `statusForJob` `null`; stall timeouts `sync_uploads` 15 min, `sync_channel` 5 min; handler stubs throwing `AppError("INTERNAL", "not implemented")` until Tasks 5 and 7.
  - `spendQuota` non-upload bucket becomes `["list", "stats", "import"]`.
  - `type ChannelJobType = "sync_uploads" | "sync_channel"`, `type ImportedShort = { videoId: string; title: string; publishedAt: Date; durationMs: number; privacy: PrivacyStatus }`
  - `analyticsRepository(db)` with:
    - `upsertPublicationDaily(publicationId: string, rows: DailyViews[]): Promise<void>`
    - `lastPublicationDay(publicationId: string): Promise<string | null>`
    - `earlyDaily(channelId: string): Promise<{ publicationId: string; day: string; views: number }[]>`: `published` publications of the channel, days ≤ the Pacific publish day + 28
    - `publicationDataThrough(channelId: string): Promise<string | null>`: max `day` over the channel's publications
    - `viewsBetween(channelId: string, from: string, to: string): Promise<Map<string, number>>`: summed views per publication
    - `upsertChannelDaily(channelId: string, rows: ChannelDay[]): Promise<void>`
    - `lastChannelDay(channelId: string): Promise<string | null>`
    - `channelDays(channelId: string, from: string, to: string): Promise<ChannelDay[]>`
    - `knownVideoIds(channelId: string): Promise<Set<string>>`: every publication of the channel with a `videoId`, any origin or status
    - `insertImported(channelId: string, videos: ImportedShort[]): Promise<Publication[]>`: `status: "published"`, `url: https://youtube.com/shorts/{videoId}` (the format `publish-clip.ts` uses), `metadata: { title, description: "", tags: [], privacy, publishAt: null }`; `on conflict do nothing`; skips any `videoId` already on a Nimbus publication of the channel; returns only inserted rows
    - `lockChannelJob(type: ChannelJobType, channelId: string): Promise<void>` (advisory xact lock, as `lockSync`)
    - `channelJobActive(type: ChannelJobType, channelId: string): Promise<boolean>`
    - `latestChannelJob(type: ChannelJobType, channelId: string): Promise<Job | undefined>`
    - `markSynced(channelId: string, field: "uploadsSyncedAt" | "analyticsSyncedAt", at: Date): Promise<void>`
    - `dueChannels(): Promise<YouTubeChannel[]>`: status `ok` and `accountId` not null
  - `tests/utils/publications.ts`: `insertImportedPublication(db: Db, channelId: string, patch?: Partial<NewPublication>): Promise<Publication>` for later tests.

- [ ] **Step 1: Write failing integration tests** (PGlite, `createTestEnv`):
  - Upserting the same `(publicationId, day)` twice keeps one row with the second values; same for `channel_daily`.
  - `earlyDaily` returns days 0–28 of a published Short and excludes day 29, removed publications and other channels.
  - `insertImported` inserts once for a repeated `videoId`, returns `[]` the second time, and skips a `videoId` that a Nimbus publication already has.
  - `channelJobActive` is true while a `sync_uploads` job with that `channelId` is queued or running, false for another channel.
  - `dueChannels` excludes `needs_reconnect` channels and ones whose `accountId` is null.
  - Deleting the workspace deletes its imported publications (cascade through the channel).
- [ ] **Step 2: Run** `pnpm vitest run tests/integration/analytics-repository.test.ts` — expected FAIL.
- [ ] **Step 3: Implement.** Follow the Drizzle conventions in `lib/db/schema.ts` (`timestamptz`, `newId()` for `publications.id`). `pnpm db:generate`, then append the backfill. Check that the generated SQL drops and re-adds `publications_channel_id_youtube_channels_id_fk` with `ON DELETE cascade`.
- [ ] **Step 4: Run** the test and `pnpm typecheck`. Typecheck fails wherever `clipId` is now `string | null`; leave those for Task 3 and confirm the failures are only in the files Task 3 lists.
- [ ] **Step 5: Commit** together with Task 3 (the tree doesn't typecheck between them).

### Task 3: Publications without a clip (audit)

**Files:**

- Modify: `features/publishing/repository.ts`, `features/publishing/stats-repository.ts`, `features/publishing/actions.ts`, `features/publishing/service.ts`, `features/pipeline/steps/publish-clip.ts`, `features/pipeline/steps/sync-stats.ts`, `features/publishing/queries.ts`, `features/insights/service.ts`, `features/insights/queries.ts`
- Test: `tests/integration/publishing-repository.test.ts`, `tests/integration/stats-repository.test.ts`, `tests/integration/publish-actions.test.ts`, `tests/integration/sync-stats-step.test.ts`, `tests/integration/publish-step.test.ts`

**Interfaces:**

- Consumes: Task 2 schema, `insertImportedPublication`.
- Produces: every query that reads publications with clips, handled as below. Later tasks rely on `forChannel` returning `{ publication: Publication; clip: Clip | null; projectId: string | null; latest: Snapshot | null }[]`.

| #   | Query or code path                                                                 | Change                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `statsRepository.forChannel`                                                       | `innerJoin(clips)` → `leftJoin`; `clip`/`projectId` nullable                                                                                                                                                               |
| 2   | `publishingRepository.latestForClips`                                              | map key typed from the non-null `clipId` filter; imported rows never match                                                                                                                                                 |
| 3   | `publishingRepository.activeForClip`                                               | unchanged (filters by a clip id); add a test that an imported row with the same `videoId` doesn't block publishing                                                                                                         |
| 4   | `publishingRepository.countCreatedOnDay`                                           | add `origin = 'nimbus'` (plan publish limit)                                                                                                                                                                               |
| 5   | `publishingRepository.countPublished`                                              | add `origin = 'nimbus'` (channel card "N clips published")                                                                                                                                                                 |
| 6   | `publishingRepository.upsertChannel`                                               | when the stored YouTube `channelId` differs from the incoming one, in the same transaction delete the row's imported publications and `channel_daily` rows and null both sync timestamps                                   |
| 7   | `retryPublicationAction`                                                           | `clipId` null → `NOT_FOUND` "Publication not found"                                                                                                                                                                        |
| 8   | `refreshStatsAction`                                                               | `clipId` null → skip `assertProjectAccess`, keep the channel ownership check                                                                                                                                               |
| 9   | `releaseRenderAsset`                                                               | skip the clip lookup when `clipId` is null                                                                                                                                                                                 |
| 10  | `publishClipStep`                                                                  | `clipId` null → `AppError("CANCELLED", "Imported Shorts can't be published")`                                                                                                                                              |
| 11  | `syncStatsStep`                                                                    | resolve the channel from `publication.channelId` with `getChannelById`, apply the same `accountId`-null → `needs_reconnect` rule as `getChannel`, book quota against `channel.workspaceId`; drop the clip → project lookup |
| 12  | `getPublishedClips`, `eligibleInsightClips`, `eligibleInsightCount`, `getInsights` | for now skip rows with `clip === null`, so behaviour is unchanged; Task 8 brings imported rows in                                                                                                                          |
| 13  | `getPublishing`, `onJobFinalFailure`, `requeuePublication`                         | no clip join; verify they compile unchanged                                                                                                                                                                                |

- [ ] **Step 1: Write failing tests:**
  - `countCreatedOnDay` and `countPublished` ignore an imported publication created today.
  - `forChannel` returns an imported row with `clip: null` next to a Nimbus row.
  - `upsertChannel` with a new YouTube `channelId` removes imported publications and `channel_daily` rows; with the same id it keeps them.
  - `retryPublicationAction` on an imported id → `NOT_FOUND`; `refreshStatsAction` on an imported id enqueues a `sync_stats` job.
  - `syncStatsStep` on an imported publication stores a snapshot and books quota for the channel's workspace.
  - Publishing a clip still works when an imported row exists on the channel (`publish-step.test.ts`).
- [ ] **Step 2: Run** those files — expected FAIL.
- [ ] **Step 3: Implement** the table above.
- [ ] **Step 4: Run** `pnpm typecheck`, the five integration files and `tests/integration/insights-actions.test.ts` — PASS.
- [ ] **Step 5: Commit** Tasks 2 and 3: `git commit -m "feat(analytics): daily tables, imported publications and the clip-less audit"`

### Task 4: YouTube client reads uploads and daily analytics

**Files:**

- Modify: `features/publishing/youtube.ts`, `youtube-http.ts`, `youtube-fake.ts`
- Test: `tests/contracts/youtube-analytics.test.ts` (MSW), extend `tests/integration/youtube-http-stats.test.ts`

**Interfaces:**

- Consumes: Task 1 (`parseIsoDuration`, `contentTypeOf`, `DailyViews`, `ChannelDay`, `VideoDetails`).
- Produces (on `YouTubeClient`):
  - `uploadsPlaylist(token: string): Promise<string>`: `channels?part=contentDetails&mine=true`
  - `playlistPage(token: string, playlistId: string, pageToken: string | null): Promise<{ items: { videoId: string; publishedAt: Date | null }[]; nextPageToken: string | null; total: number }>`: `playlistItems?part=contentDetails&maxResults=50`, from `contentDetails.videoId` and `contentDetails.videoPublishedAt`, total from `pageInfo.totalResults`
  - `videoDetails(token: string, videoIds: string[]): Promise<VideoDetails[]>`: `videos?part=snippet,contentDetails,status&id=a,b`; more than 50 ids throws `AppError("INTERNAL")` before any request; ids missing from `items` are simply absent
  - `videoContentType(token: string, videoId: string, startDate: string, endDate: string): Promise<string | null>`: `dimensions=creatorContentType&metrics=views&filters=video==ID`; no rows → `null`; HTTP errors go through `failure()` (a 400 becomes `VALIDATION`)
  - `videoDaily(token: string, videoId: string, startDate: string, endDate: string): Promise<DailyViews[]>`: `dimensions=day&metrics=views,estimatedMinutesWatched,likes,subscribersGained&filters=video==ID&sort=day`
  - `channelDaily(token: string, startDate: string, endDate: string): Promise<{ split: boolean; rows: ChannelDay[] }>`: first `dimensions=day,creatorContentType` with the eight channel metrics; on a `VALIDATION` error, one retry with `dimensions=day` and every row as `other`, `split: false`. Rows for one day and mapped type are summed (`LIVE_STREAM` and `STORY` both become `other`).
  - `videoStats` now requests `part=statistics,snippet,status` (still 1 unit) and adds `title: string` and `privacy: PrivacyStatus`.
  - Fake (exported `FAKE_PAST_UPLOADS` for tests), all public and processed:

    | id               | title            | duration | published   | content type    |
    | ---------------- | ---------------- | -------- | ----------- | --------------- |
    | `fake-past-1`    | Past short one   | 45 s     | 40 days ago | SHORTS          |
    | `fake-past-2`    | Past short two   | 30 s     | 20 days ago | SHORTS          |
    | `fake-past-3`    | Past short three | 58 s     | 5 days ago  | SHORTS          |
    | `fake-past-4`    | Past video four  | 150 s    | 10 days ago | VIDEO_ON_DEMAND |
    | `fake-past-long` | Past long video  | 600 s    | 15 days ago | VIDEO_ON_DEMAND |
    - `uploadsPlaylist` → `"UU-fake"`. The playlist is the fake's own uploads (newest first; "Fake upload", 30 s, published at upload time) followed by the table, paged 2 at a time with `pageToken` = the next offset as a string.
    - `videoDaily` returns one row per day from `max(startDate, publish day)` through `endDate − 2 days`: with `i` days since publishing and `k` the id's trailing digit (1 if none), `views = k × (i === 0 ? 120 : i === 1 ? 60 : 10)`, `estimatedMinutesWatched = views × 0.2`, `likes = floor(views / 10)`, `subscribersGained = i === 0 ? k : 0`.
    - `channelDaily` returns, per day from `startDate` through `endDate − 2 days`, a `shorts` row (views 300, minutes 60, avg 12 s, likes 20, comments 3, shares 2, subs +5/−1) and a `long` row (views 100, minutes 400, avg 240 s, likes 5, comments 1, shares 0, subs +2/−0), `split: true`.
    - `videoStats` returns the table title (or "Fake upload") and `privacy: "public"`.

- [ ] **Step 1: Write failing MSW tests:**
  - `uploadsPlaylist` reads `relatedPlaylists.uploads` and sends `mine=true`.
  - `playlistPage` sends `maxResults=50` and `pageToken` only when given; a missing `nextPageToken` → `null`; a missing `videoPublishedAt` (private or deleted item) → `publishedAt: null`.
  - `videoDetails` joins ids with commas, parses `PT45S` to 45,000 and `publishedAt` to a `Date`; 51 ids throw and no request is made.
  - `videoContentType` returns `"SHORTS"`; no `rows` → `null`; a 400 → `AppError` with code `VALIDATION`.
  - `videoDaily` maps reordered `columnHeaders` correctly and sends `filters=video==ID`.
  - `channelDaily`: a split response maps to `shorts`/`long`/`other`; a 400 on the split request is retried once without `creatorContentType` and returns `split: false` with `other` rows; a 401 still throws `cause: "token"`.
  - `videoStats` returns `title` and `privacy`.
- [ ] **Step 2: Run** `pnpm vitest run tests/contracts/youtube-analytics.test.ts tests/integration/youtube-http-stats.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Reuse `send`, `failure` and a shared column-index reader for multi-row reports.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): read uploads, daily video and channel analytics from YouTube"`

### Task 5: The `sync_uploads` job and "Import past Shorts"

**Files:**

- Create: `features/pipeline/steps/sync-uploads.ts`, `features/analytics/service.ts`, `features/analytics/actions.ts`
- Modify: `features/pipeline/handlers.ts`
- Test: `tests/integration/sync-uploads-step.test.ts`, `tests/integration/analytics-actions.test.ts`

**Interfaces:**

- Consumes: Tasks 1–4, `enqueueStatsSync`, `withGoogleToken`, `spendQuota`, `nextQuotaReset`.
- Produces:
  - `syncUploadsStep: JobHandler`
  - `enqueueUploadsSync(db: Db, channelId: string): Promise<boolean>`: under `lockChannelJob`, enqueues `sync_uploads` (`projectId: null`, `maxAttempts: 3`) unless `channelJobActive`
  - `importShortsAction(): Promise<ActionResult>`: `requireActor`; no channel → `CONFLICT` "Connect YouTube first"; needs reconnect → `CONFLICT` `RECONNECT_MESSAGE`; already active → `CONFLICT` "Already importing your Shorts"; revalidates `/analytics`, `"layout"`.

- [ ] **Step 1: Write failing tests** (fake client):
  - A first run imports `fake-past-1`, `-2` and `-3` as `origin: "imported"`, `status: "published"`, `clipId: null`, with `durationMs`, `metadata.title` and `publishedAt` from the fake; `fake-past-4` (probe says long-form) and `fake-past-long` are not imported. `uploadsSyncedAt` is set.
  - A Nimbus publication whose `videoId` is a fake upload (create it with `getYouTubeClient().uploadFrom(...)` first) isn't imported again (Review Focus 1).
  - Each new import enqueues exactly one `sync_stats`; a second run imports nothing and enqueues nothing.
  - Ledger units (kind `import`), on a fake with no uploads of its own (spy `getYouTubeClient` to return a `new YouTubeFake()`): the first run books 1 + 3 pages + 3 `videos.list` = 7; a second run after `uploadsSyncedAt` is set books 2, because page 1 already reaches uploads older than `UPLOADS_OVERLAP_DAYS` before the last pass (Review Focus 5).
  - With `YOUTUBE_DAILY_QUOTA: "3"` the job stops after page 1 and enqueues `sync_uploads` with `{ channelId, pageToken: "2" }` and `runAfter = nextQuotaReset(now)`; a Google `cause: "quota"` error does the same.
  - `videoContentType` rejecting with `VALIDATION` (`vi.spyOn`) falls back to duration, so `fake-past-4` (150 s) is imported, and the probe is called only once in that run.
  - A `needs_reconnect` channel fails with `RECONNECT_MESSAGE` and makes no Google call.
  - The job reports progress (`jobs.progress` > 0 after page 1).
  - Action: the three refusal messages above; a successful call enqueues one job.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `syncUploadsStep`:
  1. Check the channel as `syncStatsStep` does (Task 3 row 11).
  2. Spend 1 unit (kind `import`) before each `uploadsPlaylist`, `playlistPage` and `videoDetails` call; when a spend fails or Google says `quota`, re-enqueue with the page token not yet read and return.
  3. Per page: drop ids in `knownVideoIds`. When `uploadsSyncedAt` is set, also drop items published before `uploadsSyncedAt − UPLOADS_OVERLAP_DAYS`, and stop after this page if any item was that old. (Knowing only imported ids isn't enough to stop: long-form uploads are never imported, so they would look new every day.) `videoDetails` what remains, probe `videoContentType` (from the publish day to today) for candidates ≤ 180 s while the probe hasn't failed in this run, keep `importableShort`, `insertImported`, then `enqueueStatsSync` each returned row.
  4. Progress is `seen / total × 100`. After the last page, `markSynced(channelId, "uploadsSyncedAt", now())`.
  5. Log which Short-detection path ran (`probe` or `duration`) once per run, for the ADR.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): import past Shorts from the channel's uploads"`

### Task 6: `sync_stats` stores the daily curve and re-syncs every 28 days

**Files:**

- Modify: `features/pipeline/steps/sync-stats.ts`, `features/publishing/stats-repository.ts` (`dueCandidates` returns `origin`), `features/publishing/stats-service.ts`
- Test: `tests/integration/sync-stats-step.test.ts`

**Interfaces:**

- Consumes: Task 1 `statsSyncDue`, Task 2 `upsertPublicationDaily`/`lastPublicationDay`, Task 4 `videoDaily` and the extended `videoStats`.

- [ ] **Step 1: Write failing tests:**
  - A sync of imported `fake-past-1` stores `publication_daily` rows from its publish day through today − 2.
  - The next sync calls `videoDaily` from the last stored day − 3 (spy on the arguments).
  - `videoDaily` throwing a 403 still stores the snapshot and no daily rows.
  - An imported publication gets `metadata.title` updated from `videoStats`; `privacy: "private"` marks it `removed`.
  - A Nimbus publication whose video is private stays `published` (Nimbus can publish privately).
  - `enqueueDueStatsSyncs` enqueues a never-synced imported Short and a 60-day-old Nimbus Short last fetched 30 days ago, and skips one fetched 10 days ago.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** After `videoAnalytics`, a third Analytics call `videoDaily(token, videoId, from, pacificDay(now()))` with `from = lastPublicationDay ? addDays(last, −LATE_DATA_DAYS) : pacificDay(publishedAt)`, errors handled like `videoAnalytics` (rethrow `UNAUTHORIZED`, otherwise `logger.warn`). Title and privacy changes apply to `origin: "imported"` only.
- [ ] **Step 4: Run** the file and `tests/integration/stats-repository.test.ts` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): daily growth per Short and a 28-day re-sync"`

### Task 7: The `sync_channel` job and the daily schedule

**Files:**

- Create: `features/pipeline/steps/sync-channel.ts`
- Modify: `features/analytics/service.ts`, `features/pipeline/handlers.ts`, `worker/index.ts`
- Test: `tests/integration/sync-channel-step.test.ts`

**Interfaces:**

- Consumes: Tasks 2 and 4.
- Produces:
  - `syncChannelStep: JobHandler`
  - `enqueueChannelSync(db: Db, channelId: string): Promise<boolean>` (`maxAttempts: 3`, same lock pattern as `enqueueUploadsSync`)
  - `enqueueDueAnalyticsSyncs(db: Db, now: Date): Promise<number>`: for each `dueChannels()` row, a channel sync when `analyticsSyncedAt` is null or older than `ANALYTICS_SYNC_EVERY_MS`, and an uploads sync when `uploadsSyncedAt` is set and older than that (no automatic import until the person clicked once).

- [ ] **Step 1: Write failing tests:**
  - A first run calls `channelDaily` from `addDays(today, −CHANNEL_BACKFILL_DAYS)` to today, stores the fake's `shorts` and `long` rows and sets `analyticsSyncedAt`.
  - A second run starts at the last stored day − 3 and overwrites those days.
  - `split: false` (spy) stores `other` rows only.
  - A `needs_reconnect` channel fails with `RECONNECT_MESSAGE` and makes no call.
  - `enqueueDueAnalyticsSyncs`: enqueues a channel sync for a fresh `ok` channel, none for `needs_reconnect`, no uploads sync while `uploadsSyncedAt` is null, one when it is 25 h old, and never a second job while one is active.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** In `worker/index.ts`, `scheduleStats` also awaits `enqueueDueAnalyticsSyncs(db, new Date())` on the same 30-minute timer, logging failures separately ("couldn't schedule analytics syncs").
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): sync daily channel metrics on a schedule"`

### Task 8: Analytics queries and imported Shorts in Insights

**Files:**

- Create: `features/analytics/queries.ts`
- Modify: `features/analytics/service.ts`, `features/publishing/queries.ts` (remove `getPublishedClips`/`PublishedClipRow`), `features/publishing/stats.ts` (remove the old `relativePerformance`, `PerformanceSample` and `ageBucket`), `features/insights/service.ts`, `features/insights/prompt.ts`, `features/insights/queries.ts`, `features/pipeline/steps/analyze-performance.ts`, `components/channels/suggestion-card.tsx`
- Test: `tests/integration/analytics-queries.test.ts`, `features/insights/prompt.test.ts`, `tests/integration/analyze-performance.test.ts`, `tests/integration/insights-actions.test.ts`

**Interfaces:**

- Consumes: Tasks 1–7.
- Produces:
  - `channelCurves(db: Db, channelId: string): Promise<{ dataThrough: string | null; curves: Map<string, number[]> }>` in `service.ts`: `dataThrough = publicationDataThrough`; a curve for each published publication that has at least one snapshot, built with `cumulativeViews(rows, pacificDay(publishedAt), dataThrough)`.
  - `getAnalyticsChannel(): Promise<{ title: string; needsReconnect: boolean } | null>`
  - `getAnalyticsOverview(period: AnalyticsPeriod): Promise<{ dataThrough: string | null; split: boolean; summary: ReturnType<typeof periodSummary> | null; series: DailyPoint[]; topShorts: TopShort[]; syncing: boolean }>`
    - The window ends at `lastChannelDay`. `split` is true when any row in the window is `shorts` or `long`.
    - `TopShort = { publicationId: string; title: string; clipId: string | null; projectId: string | null; url: string | null; views: number }`, the 5 highest `viewsBetween` in the window.
    - With a channel that is `ok` and `analyticsSyncedAt` null or older than 24 h, it calls `enqueueChannelSync`. `syncing` is whether a `sync_channel` is active.
  - `getShorts(): Promise<{ rows: ShortRow[]; median: (number | null)[]; dataThrough: string | null; importing: ImportState; uploadsSyncedAt: Date | null }>`
    - `ShortRow = { publicationId: string; origin: PublicationOrigin; clipId: string | null; projectId: string | null; title: string; url: string | null; publishedAt: Date; ageDays: number; views: number | null; averageViewPercentage: number | null; viewsDay1: number | null; viewsDay7: number | null; viewsDay28: number | null; relative: number | null; early: boolean; curve: number[] }`
    - `ImportState = { state: "idle"; error: string | null } | { state: "running"; progress: number } | { state: "waiting_quota"; resumesAt: Date }`, from `latestChannelJob("sync_uploads")`: a running job → `running`; a queued job with `runAfter > now` → `waiting_quota`; otherwise `idle`, with `error` set when the latest job failed.
    - `viewsDayN` is `curve[N]`, or `null` when the curve is shorter. `relative` is `relativePerformance` against every other row's curve. Rows are published only, newest first. `ageDays` is whole days since `publishedAt`.
  - `InsightClip` becomes a union: `{ origin: "nimbus"; id: string /* clip id */; …today's fields except clipId }` and `{ origin: "imported"; id: string /* publication id */; title: string; durationMs: number | null; moments: RetentionMoment[]; views: number; averageViewPercentage: number | null; relative: number | null }`. Evidence ids are clip ids for Nimbus clips (stored suggestions stay valid) and publication ids for imported Shorts.
  - `EvidenceClip = { id: string; title: string; clipId: string | null; projectId: string | null; url: string | null; views: number | null }`. `suggestion-card.tsx` links Nimbus evidence to the clip page and imported evidence to `url`, followed by "(posted outside Nimbus)".

- [ ] **Step 1: Write failing tests:**
  - **`getShorts`** (mock session as in `insights-actions.test.ts`): an imported and a Nimbus Short are both listed; a Short 5 days old has `viewsDay7: null`; with four peers the ratio matches `relativePerformance`; `removed` rows are absent.
  - **Lag (Review Focus 3):** with daily rows only through 3 days ago, a Short published 4 days ago has `curve.length === 2` (age measured to `dataThrough`), so it shows no ratio, not a ratio from zero-view days.
  - **`getAnalyticsOverview`:** sums the fake-shaped rows for 28 days (`views` 11,200), `split` true, top Shorts ordered by views gained; a stale channel enqueues one `sync_channel` and a `needs_reconnect` channel enqueues none.
  - **Insights:** imported Shorts count towards `eligible` and reach Claude. `buildInsightsPrompt` renders an imported Short as `Short {id} — "{title}" (posted outside Nimbus, no transcript)` with `Duration: 45.0s`, its stats and retention moments (no words), and no `Hook:`/`Transcript:` lines. The existing prompt tests pass unchanged, so a channel without imported Shorts sends the same prompt as today. `cleanSuggestions` keeps an imported publication id as evidence.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `eligibleInsightClips` builds imported entries with `retentionMoments(curve, { startMs: 0, endMs: durationMs ?? 0 }, { words: [], beats: [], effects: [] })` and takes `relative` from `channelCurves`. When imported Shorts are present, `buildInsightsPrompt` adds one line before the clip list: "Shorts posted outside Nimbus have no transcript or edit data; use their numbers, but don't base a rule on what happens in them."
- [ ] **Step 4: Run** these tests, `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): overview, shorts and same-age queries; imported Shorts in insights"`

### Task 9: The `/analytics` page and the Overview tab

**Files:**

- Create: `components/ui/chart.tsx` (via `pnpm dlx shadcn@latest add chart`), `app/(app)/analytics/layout.tsx`, `app/(app)/analytics/page.tsx`, `components/analytics/analytics-nav.tsx`, `components/analytics/period-picker.tsx`, `components/analytics/overview.tsx` (+ test), `components/analytics/views-chart.tsx`
- Modify: `components/app-shell/app-sidebar.tsx`, `components/app-shell/breadcrumbs.tsx`, `components/app-shell/app-shell.test.tsx`, `docs/COMPONENTS.md`

**Interfaces:**

- Consumes: `getAnalyticsChannel`, `getAnalyticsOverview`, `parsePeriod`.
- Produces:
  - Sidebar: "Analytics" (`/analytics`, `ChartLineUpIcon`, active on `/analytics*`) between Projects and Channels; `NavItem.href` widens to `"/" | "/analytics" | "/channels"`. Breadcrumb labels `analytics: "Analytics"`, `shorts: "Shorts"`, `insights: "Insights"`, with no "Projects" crumb under `/analytics`.
  - Layout: `PageTitle` "Analytics"; `<AnalyticsNav>` (links styled like the project header's section nav, `aria-label="Analytics sections"`, `aria-current="page"`) with Overview (`/analytics`), Shorts (`/analytics/shorts`), Insights (`/analytics/insights`). No channel → an `Empty` "Connect a YouTube channel to see how your Shorts do." with a Connect link to `/settings/channels`, and no tabs. `needsReconnect` → an `Alert` "Reconnect YouTube to keep these numbers up to date." with a Reconnect link, above the tabs and existing data.
  - `<PeriodPicker value={AnalyticsPeriod} />`: links `?period=7|28|90` labelled "7 days", "28 days", "90 days".
  - `<Overview {...Awaited<ReturnType<typeof getAnalyticsOverview>>} period={AnalyticsPeriod} />`.
  - `<ViewsChart series={DailyPoint[]} split={boolean} />`: stacked Recharts bars with `ChartContainer`, `--chart-1` for Shorts and `--chart-2` for long-form (one "Views" series when `split` is false); a visible summary line, and a "Show as table" `<details>` holding the same numbers in a `Table`.

- [ ] **Step 1: Write failing component tests:**
  - Five tiles: "Views", "Watch hours", "Net subscribers", "Average view duration", "Likes". With a summary of 11,200 views and change 0.25 the tile reads "11,200" and "+25%"; a `null` change shows "—".
  - "Data through Nov 21, 2026" with the lag note "YouTube shares numbers 2–3 days late."
  - The period picker marks "28 days" `aria-current="page"`.
  - The chart summary reads "11,200 views in the last 28 days: 8,400 from Shorts, 2,800 from long-form."; with `split: false` it reads "11,200 views in the last 28 days." and the table has one value column.
  - "Top Shorts this period" lists up to 5 titles with views gained; a Nimbus row links to `/projects/{projectId}/clips/{clipId}`, an imported row to its YouTube URL.
  - `summary: null` and `syncing: true` → "Fetching your channel's numbers from YouTube…"; `summary: null` and not syncing → "No views in this period yet."
  - `app-shell.test.tsx`: the sidebar lists Projects, Analytics, Channels in that order; `buildCrumbs("/analytics/shorts", {})` equals `[{ href: "/analytics", label: "Analytics" }, { href: "/analytics/shorts", label: "Shorts" }]`.
- [ ] **Step 2: Run** `pnpm vitest run components/analytics components/app-shell` — FAIL.
- [ ] **Step 3: Implement.** Add the chart with the shadcn CLI and record it in `docs/COMPONENTS.md` (no edits to the generated file). `page.tsx` awaits `searchParams`, calls `parsePeriod`, and renders `<Overview>` inside `Suspense` with a `Skeleton`. Watch hours show one decimal and average view duration shows `m:ss`.
- [ ] **Step 4: Run** the tests, `pnpm lint`, `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): analytics page with the channel overview"`

### Task 10: Shorts and Insights tabs; `/channels` keeps the connection card

**Files:**

- Create: `app/(app)/analytics/shorts/page.tsx`, `app/(app)/analytics/insights/page.tsx`, `components/analytics/shorts-panel.tsx`, `components/analytics/growth-chart.tsx` (+ test), `components/analytics/import-shorts.tsx` (+ test)
- Move (`git mv`): `components/channels/published-clips.tsx` (+ test) → `components/analytics/shorts-table.tsx` (+ test); `components/channels/{insights,suggestion-card,playbook,use-insight-action}` (+ test) → `components/analytics/`
- Modify: `app/(app)/channels/page.tsx`, `next.config.ts`, `features/insights/actions.ts` (`INSIGHTS_PATH = "/analytics/insights"`)

**Interfaces:**

- Consumes: `getShorts`, `getInsights`, `importShortsAction`.
- Produces:
  - `<ShortsTable rows={ShortRow[]} highlightedId={string | null} onHighlight={(id: string | null) => void} />`. Columns: Title, Published, Age, Views, Watched, Day 1, Day 7, Day 28, Same age. Imported rows show a "Posted outside Nimbus" `Badge` and link the title to `url`. Sorting as today, extended to the new numeric columns. Row hover or focus calls `onHighlight`.
  - `<GrowthChart rows={ShortRow[]} median={(number | null)[]} highlightedId={string | null} />`: cumulative views (y) against days since upload (x, 0–28). One faint line per Short (`--chart-4`, low opacity), the median bold (`--chart-1`), the highlighted Short at full opacity (`--chart-3`). A summary paragraph, plus an `aria-live="polite"` line naming the highlighted Short.
  - `<ImportShorts importing={ImportState} uploadsSyncedAt={Date | null} />`
  - `<ShortsPanel {...Awaited<ReturnType<typeof getShorts>>} />` (client) owns `highlightedId` and lays out import, chart and table.
  - `/channels`: the YouTube card and the "Soon" list only.
  - `next.config.ts` redirects: `/channels` with query `tab=clips` → `/analytics/shorts`, and with `tab=insights` → `/analytics/insights` (`has: [{ type: "query", key: "tab", value: … }]`, `permanent: false`).

- [ ] **Step 1: Write failing component tests:**
  - **Table:** the moved tests pass with `ShortRow` fixtures; an imported row shows "Posted outside Nimbus" and its title links to the YouTube URL; `viewsDay7: null` shows "—"; clicking "Day 7" sorts descending; focusing a row calls `onHighlight` with its id.
  - **Empty:** no rows → "No Shorts yet. Publish a clip, or import the Shorts you posted before Nimbus." next to the import button.
  - **Growth chart:** with a median reaching 1,200 at day 7 the summary reads "Growth since upload for 3 Shorts. The channel median reaches 1,200 views by day 7."; `highlightedId` set → the live line reads "Highlighted: Past short one".
  - **Import:**
    - `idle` → an enabled "Import past Shorts" button that calls `importShortsAction` through the `useAction` toast pattern, then `router.refresh()`.
    - `running` with progress 40 → disabled, "Importing… 40%".
    - `waiting_quota` → "Import continues after YouTube's daily quota resets."
    - `idle` with an error → the error in `role="alert"`.
    - `uploadsSyncedAt` set → "New uploads are imported daily."
    - While `running` or `waiting_quota`, the panel calls `router.refresh()` every 5 s (interval cleared on unmount).
  - The Insights tests pass after the move, unchanged.
- [ ] **Step 2: Run** `pnpm vitest run components/analytics` — FAIL.
- [ ] **Step 3: Implement.** The Shorts page renders `<ShortsPanel>` in `Suspense`. The Insights page renders `<Insights {...await getInsights()} />`. Remove the tabs and the two lists from `/channels`.
- [ ] **Step 4: Run** the tests, `pnpm lint`, `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(analytics): shorts growth and import, insights tab; channels keeps the connection"`

### Task 11: End to end, docs and phase close

**Files:**

- Create: `tests/e2e/analytics.spec.ts`
- Modify: `tests/e2e/utils/youtube.ts`, `tests/e2e/insights.spec.ts`, `tests/e2e/publish.spec.ts`, `docs/DECISIONS.md` (ADR-0067), `docs/PROGRESS.md`, `docs/BUSINESS_LOGIC.md`, `docs/PIPELINE.md`, `docs/TESTING.md`, `docs/COMPONENTS.md`

- [ ] **Step 1: Update helpers and the existing specs:**
  - `removeYouTubeChannel` also deletes `sync_uploads`/`sync_channel` jobs whose payload `channelId` is `e2e-channel` (publications and daily rows go with the channel by cascade).
  - `insights.spec.ts` goes straight to `/analytics/insights`, with no tab click.
  - `publish.spec.ts` checks the title under `/analytics/shorts`.
- [ ] **Step 2: Write `analytics.spec.ts`:**
  - Seed the channel, go to `/analytics/shorts`, click "Import past Shorts".
  - Within 60 s (reloading if needed), expect "Past short one", "Past short two" and "Past short three" in the table, each with "Posted outside Nimbus", and neither "Past video four" nor "Past long video". Run axe.
  - Go to `/analytics`. Within 60 s, expect the Views tile to read "11,200" and "Past short three" under "Top Shorts this period". Run axe.
  - `page.goto("/channels?tab=insights")` lands on `/analytics/insights`.
- [ ] **Step 3: Write ADR-0067 "Analytics for every Short on the channel"** in the existing format. Cover:
  - imported Shorts as clip-less publications (`origin`), and the `channel_id` FK now cascading
  - Short detection: say which path ran against the fake and that a real channel hasn't confirmed the probe
  - import cost per run, the stop-at-first-known-page rule, and booking under kind `import`
  - `publication_daily`/`channel_daily` and the lag rule (ages and periods end at the last day with data)
  - the same-age ratio replacing the sync-age buckets (closing the parked Phase 31 minor)
  - the 28-day re-sync for the 30-day rule, with titles refreshed from `videos.list`
  - private or deleted imported Shorts → `removed`, while Nimbus private uploads stay `published`
  - a changed YouTube channel on reconnect drops the old channel's imports
  - the old `/channels` tabs had no URLs, so only `?tab=` links redirect
  - unverified: the 50-id cap of `videos.list`, the probe and `creatorContentType` with channel subscriber metrics on a real channel, and the Analytics quota cost model
- [ ] **Step 4: Update the docs:**
  - **PROGRESS:** a "Phase 33: Analytics (ADR-0067)" section with Tasks 1–11 checked and a "Not verified: import and daily analytics from a real channel" line.
  - **BUSINESS_LOGIC:** Short detection, the same-age ratio, the refresh cadence, and period deltas.
  - **PIPELINE:** `sync_uploads` and `sync_channel` sections, and the daily curve in `sync_stats`.
  - **TESTING:** the fake's uploads table, daily and channel rows.
  - **COMPONENTS:** `chart` and the `components/analytics/*` parts.
- [ ] **Step 5: Run the full gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. All must pass.
- [ ] **Step 6: Commit:** `git commit -m "test(e2e): import past Shorts and see the overview; docs for phase 33 (ADR-0067)"`
