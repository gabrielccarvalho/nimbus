# YouTube Stats and Insights (Phases 31–32) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull each published clip's YouTube numbers back into Nimbus (Phase 31), then let Claude compare published clips and suggest playbook rules the user approves, which feed the selection and visual review prompts (Phase 32).

**Architecture:** Phase 31 adds a `sync_stats` worker job that reads `videos.list` and two YouTube Analytics reports through the existing `YouTubeClient` adapter, stores snapshots in `publication_stats`, and is scheduled by the worker on a timer. Pure functions in `features/publishing/stats.ts` decide when to sync, map the retention curve to clip moments and score relative performance. Phase 32 adds `features/insights/`: playbook and suggestion tables, an `analyze_performance` job that calls Claude with structured output, rule services that never edit text in place, and a playbook block injected into the prompts only when rules exist.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + Postgres (PGlite in tests), zod, Base UI/shadcn, `@anthropic-ai/sdk` (structured output via `betaZodOutputFormat`), Vitest + MSW, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-24-youtube-publishing-and-insights-design.md` (sections: Stats, Insights and the playbook, Errors and edge cases, Testing). Phase 30 shipped from `docs/superpowers/plans/2026-11-24-youtube-publishing.md`.

## Global Constraints

- Verified Google facts (2026-11-24): Analytics endpoint `GET https://youtubeanalytics.googleapis.com/v2/reports` with `ids=channel==MINE`, `startDate`/`endDate` as `YYYY-MM-DD`, `filters=video==ID` (one video per request). Totals: `metrics=views,averageViewDuration,averageViewPercentage` with no dimensions. Retention: `dimensions=elapsedVideoTimeRatio&metrics=audienceWatchRatio`, about 100 points from 0.01 to 1.0; `audienceWatchRatio` can exceed 1. No rows → the `rows` key is missing. Data lags 48–72 h. Whether retention is returned for Shorts is **not documented**: an empty curve is normal, never an error.
- `videos.list?part=statistics&id=ID` costs 1 unit from the shared `YOUTUBE_DAILY_QUOTA` bucket; book it as quota kind `"stats"`. A deleted video may come back as empty `items` **or** a 404 `videoNotFound`: treat both as removed. Analytics calls are not booked in the ledger (separate service quota with an undocumented limit).
- Sync schedule: `STATS_SYNC_AGES_DAYS = [1, 2, 7, 28]` after `publishedAt`. `STATS_LAG_MS = 72 h` ("Data still coming in"). The worker checks for due syncs every `STATS_SCHEDULE_INTERVAL_MS = 30 min`. Never two `sync_stats` jobs for the same publication at once.
- Insights: `INSIGHTS_MIN_CLIPS = 8` publications with a snapshot fetched at least `INSIGHTS_MIN_AGE_DAYS = 7` days after publishing. `PLAYBOOK_RULE_CAP = 12` active rules per target. `RULE_MAX_CHARS = 200`. Targets: `selection | review`. Suggestion kinds: `add | edit | retire`.
- Prompts never change without approval: with no active rules, every prompt is byte-for-byte what it is today.
- Rules never change text in place: editing retires the old row and inserts a new one with `supersedesId`.
- Removed publications (`status: "removed"`) drop out of stats lists and insights.
- Nothing publishes without a click; nothing here publishes.
- Long work only in the worker. Files touching DB, network or secrets start with `import "server-only"`. `features/*` never imports `app/` or `components/`. Pure logic is unit tested.
- shadcn-first for UI. A new generic UI part goes in `components/ui/` with a test, a `docs/COMPONENTS.md` entry and a `/dev/components` example.
- Comments only where code can't speak. Conventional Commits, no AI trailers or attribution lines. Never commit `.env*` or `data/`.
- Phase gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass.

## Review Focus

1. **Clip trimmed after it was published:** retention moments must map onto the range that was uploaded, not the clip's current range. Publications store the uploaded range (Task 2), and the mapping uses it (Task 1 test, Task 5).
2. **No retention curve for a Short:** a snapshot with views but no curve still shows the numbers, and the chart area says the curve isn't available yet. Insights still uses the clip (Tasks 4, 6, 10).
3. **The video was deleted on YouTube:** the next sync marks the publication `removed` without failing the job, and it disappears from the Channels list and the insights count (Tasks 4, 7, 10).
4. **Approving an `edit` or `retire` whose rule changed since the analysis:** approve fails with a clear message instead of retiring the wrong row (Task 11).
5. **Approving an `add` when 12 rules are already active:** the UI asks which rule to retire, and the server enforces the cap in the same transaction (Tasks 11, 12).

---

## Phase 31: Stats

### Task 1: Pure stats logic

**Files:**

- Create: `features/publishing/stats.ts`, `features/publishing/stats.test.ts`

**Interfaces:**

- Produces:
  - `type RetentionPoint = { ratio: number; watch: number }`
  - `STATS_SYNC_AGES_DAYS`, `STATS_LAG_MS`, `STATS_SCHEDULE_INTERVAL_MS` (values in Global Constraints)
  - `statsSyncDue(publishedAt: Date, lastFetchedAt: Date | null, now: Date): boolean`
  - `statsEarly(publishedAt: Date, now: Date): boolean`
  - `type RetentionMoment = { atMs: number; kind: "drop" | "rise"; change: number; words: string; beats: Beat["kind"][]; effects: Effect["kind"][] }`
  - `retentionMoments(curve: readonly RetentionPoint[], range: { startMs: number; endMs: number }, context: { words: readonly Word[]; beats: readonly Beat[]; effects: readonly Effect[] }): RetentionMoment[]`
  - `type PerformanceSample = { publicationId: string; ageDays: number; views: number }`
  - `relativePerformance(target: PerformanceSample, samples: readonly PerformanceSample[]): number | null`
  - `markerRatios(range: { startMs: number; endMs: number }, beats: readonly Beat[]): number[]`

- [ ] **Step 1: Write the failing tests**

```ts
const day = 86_400_000
const at = new Date("2026-11-01T12:00:00Z")
const plus = (ms: number) => new Date(at.getTime() + ms)

it("is due once each sync age passes", () => {
  expect(statsSyncDue(at, null, plus(day - 1))).toBe(false)
  expect(statsSyncDue(at, null, plus(day))).toBe(true)
  expect(statsSyncDue(at, plus(day), plus(day + 1))).toBe(false)
  expect(statsSyncDue(at, plus(day), plus(2 * day))).toBe(true)
  expect(statsSyncDue(at, plus(28 * day), plus(90 * day))).toBe(false)
  expect(statsSyncDue(at, plus(3 * day), plus(40 * day))).toBe(true)
})

it("labels the first 72 hours as early", () => {
  expect(statsEarly(at, plus(71 * 3_600_000))).toBe(true)
  expect(statsEarly(at, plus(72 * 3_600_000))).toBe(false)
})

it("finds the steepest drops in clip time with what was said and shown", () => {
  const curve = Array.from({ length: 100 }, (_, i) => ({
    ratio: (i + 1) / 100,
    watch: i < 30 ? 1 : i < 31 ? 0.6 : 0.6 - i * 0.001,
  }))
  const moments = retentionMoments(
    curve,
    { startMs: 10_000, endMs: 30_000 },
    {
      words: [{ text: "wait", startMs: 16_000, endMs: 16_300, confidence: 1 }],
      beats: [{ ms: 16_100, kind: "reaction" }],
      effects: [
        {
          kind: "zoom",
          startMs: 15_500,
          endMs: 17_000,
          scale: 1.4,
          focus: { x: 0.5, y: 0.5 },
        },
      ],
    }
  )
  expect(moments[0]).toMatchObject({
    kind: "drop",
    atMs: 6_200,
    words: "wait",
    beats: ["reaction"],
    effects: ["zoom"],
  })
  expect(moments[0]!.change).toBeCloseTo(-0.4)
})

it("returns no moments for an empty curve", () => {
  expect(
    retentionMoments(
      [],
      { startMs: 0, endMs: 10_000 },
      { words: [], beats: [], effects: [] }
    )
  ).toEqual([])
})

it("scores views against the channel's median for the same sync age", () => {
  const s = (id: string, ageDays: number, views: number) => ({
    publicationId: id,
    ageDays,
    views,
  })
  const samples = [
    s("a", 7, 100),
    s("b", 7, 200),
    s("c", 7, 300),
    s("d", 1, 5000),
  ]
  expect(relativePerformance(s("t", 7.5, 400), samples)).toBe(2)
  expect(relativePerformance(s("t", 1, 400), samples)).toBeNull()
})

it("places beats as fractions of the uploaded range", () => {
  expect(
    markerRatios({ startMs: 10_000, endMs: 20_000 }, [
      { ms: 15_000, kind: "weird" },
      { ms: 25_000, kind: "weird" },
    ])
  ).toEqual([0.5])
})
```

- [ ] **Step 2: Run** `pnpm vitest run features/publishing/stats.test.ts` — expected FAIL (module not found).
- [ ] **Step 3: Implement.** Rules the tests leave open:
  - `statsSyncDue` is true when some age `a` in `STATS_SYNC_AGES_DAYS` has `publishedAt + a ≤ now` and `lastFetchedAt` is null or earlier than `publishedAt + a`.
  - `retentionMoments`:
    - Each point's clip time is `ratio × (endMs − startMs)`, rounded to 100 ms. `change` is `watch[i] − watch[i−1]`.
    - Keep at most 3 drops (most negative change, ≤ −0.05) and at most 2 rises (≥ 0.05), sorted by `atMs`.
    - Context is gathered within ±1,000 ms of the moment in recording time (`startMs + atMs`). `words` joins word texts with spaces. `beats` and `effects` are de-duplicated kinds.
    - `Beat.ms`, `Effect.startMs` and `Effect.endMs` are recording-absolute (see `normalizeEffects` in `features/effects/schema.ts`).
  - `relativePerformance` compares against samples whose age falls in the same bucket. A bucket is the largest `STATS_SYNC_AGES_DAYS` value ≤ `ageDays`, and ages under 1 day have no bucket. The target's own id is excluded. It needs ≥ 3 peers and a median > 0, else it returns `null`. The result is `target.views / median`.
  - `markerRatios` drops beats outside the range.
- [ ] **Step 4: Run** the same command — expected PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): pure stats scheduling, retention moments and relative performance"`

### Task 2: Stats schema, migration, repository and job type

**Files:**

- Modify: `lib/db/schema.ts`, `features/jobs/schema.ts`, `features/pipeline/state-machine.ts` (`statusForJob`), `features/pipeline/handlers.ts` (`jobStallTimeoutMs`: `sync_stats` 5 min), `features/publishing/service.ts` (`queuePublication`)
- Create: `lib/db/migrations/0013_*` via `pnpm db:generate`, `features/publishing/stats-repository.ts`
- Test: `tests/integration/stats-repository.test.ts`, extend `tests/integration/publish-actions.test.ts`

**Interfaces:**

- Consumes: `RetentionPoint` (Task 1)
- Produces:
  - Table `publication_stats`:
    - `id`
    - `publicationId` (FK → publications, cascade)
    - `fetchedAt`
    - `views`, `likes`, `comments` (int, not null)
    - `averageViewDurationS`, `averageViewPercentage` (double, nullable)
    - `retention` (jsonb `RetentionPoint[]`, nullable)
    - index on (`publicationId`, `fetchedAt`)
  - `publications.clipStartMs`, `publications.clipEndMs` (int, nullable; the migration backfills them from `clips` for existing rows). `queuePublication` sets them from the locked clip row.
  - Job type `"sync_stats"`, payload `{ publicationId: string }`, `statusForJob` `null`.
  - `statsRepository(db)` with:
    - `add(input: NewSnapshot): Promise<Snapshot>`
    - `latestFor(publicationIds: string[]): Promise<Map<string, Snapshot>>`
    - `history(publicationId: string): Promise<Snapshot[]>` (oldest first)
    - `dueCandidates(): Promise<{ publication: Publication; lastFetchedAt: Date | null }[]>`: status `published`, `videoId` not null
    - `syncActive(publicationId: string): Promise<boolean>`: a queued or running `sync_stats` job with that payload id
    - `forChannel(channelId: string): Promise<{ publication: Publication; clip: Clip; projectId: string; latest: Snapshot | null }[]>`: published only, newest first

- [ ] **Step 1: Write failing integration tests** (PGlite, `createTestEnv`):
  - `latestFor` returns the newest snapshot per publication.
  - `dueCandidates` excludes `removed` and `failed` publications.
  - `syncActive` is true only while a matching job is queued or running.
  - `forChannel` excludes `removed`.
  - In `publish-actions.test.ts`, a queued publication has `clipStartMs`/`clipEndMs` equal to the clip's range.
- [ ] **Step 2: Run** `pnpm vitest run tests/integration/stats-repository.test.ts` — expected FAIL.
- [ ] **Step 3: Implement.** Add the columns and table following the existing Drizzle conventions (`timestamptz`, `newId()`). Run `pnpm db:generate`, then append the backfill `UPDATE publications p SET clip_start_ms = c.start_ms, clip_end_ms = c.end_ms FROM clips c WHERE c.id = p.clip_id;` to the generated SQL. Register a handler stub in `pipelineHandlers` that throws `AppError("INTERNAL", "not implemented")` so the record type checks; Task 4 replaces it.
- [ ] **Step 4: Run** the tests, `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): stats snapshots table and uploaded clip range"`

### Task 3: YouTube client reads stats

**Files:**

- Modify: `features/publishing/youtube.ts`, `youtube-http.ts`, `youtube-fake.ts`
- Test: `tests/integration/youtube-http-stats.test.ts` (MSW)

**Interfaces:**

- Produces (on `YouTubeClient`):
  - `videoStats(token: string, videoId: string): Promise<{ views: number; likes: number; comments: number } | null>`. `null` means the video is gone (empty `items` or 404 `videoNotFound`).
  - `videoAnalytics(token: string, videoId: string, startDate: string, endDate: string): Promise<{ averageViewDurationS: number | null; averageViewPercentage: number | null; retention: RetentionPoint[] }>`: two Analytics requests. A missing `rows` gives nulls / `[]`. Columns are read by `columnHeaders[].name`, never by position.
  - Fake: `videoStats` returns `{ views: 1234, likes: 56, comments: 7 }` for any `fake-*` id and `null` otherwise. `videoAnalytics` returns `averageViewDurationS: 11.5`, `averageViewPercentage: 64.2` and a 100-point curve declining linearly from 1 to 0.4.

- [ ] **Step 1: Write failing MSW tests:**
  - Statistics strings are parsed to numbers (`"1234"` → 1234).
  - Empty `items` → `null`, and 404 `videoNotFound` → `null`.
  - 401 → `AppError` with `cause: "token"`, and 403 `quotaExceeded` → `cause: "quota"` (reuse `failure()`).
  - Analytics with `columnHeaders` in a different order still maps correctly.
  - No `rows` → nulls and `[]`.
  - The retention request carries `dimensions=elapsedVideoTimeRatio` and `filters=video==ID`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): read video statistics and analytics from YouTube"`

### Task 4: The `sync_stats` job and its scheduler

**Files:**

- Create: `features/pipeline/steps/sync-stats.ts`, `features/publishing/stats-service.ts`
- Modify: `features/publishing/google-token.ts` (extract the refresh-once helper), `features/pipeline/steps/publish-clip.ts` (use it), `features/pipeline/handlers.ts`, `worker/index.ts`
- Test: `tests/integration/sync-stats-step.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3, `spendQuota`, `pacificDay`, `nextQuotaReset`
- Produces:
  - `withGoogleToken<T>(db: Db, channel: YouTubeChannel, call: (token: string) => Promise<T>): Promise<T>`. On a `cause: "token"` error it forces one refresh and retries. If that also fails, it sets the channel to `needs_reconnect` and throws `AppError("UNAUTHORIZED", RECONNECT_MESSAGE)`. `publish-clip.ts`'s local `authorized` is replaced by this, with no behaviour change, and its existing tests must still pass.
  - `syncStatsStep: JobHandler`
  - `enqueueStatsSync(db: Db, publicationId: string): Promise<boolean>`: enqueues `sync_stats` (`projectId: null`, `maxAttempts: 3`) unless `syncActive`. Returns whether it enqueued.
  - `enqueueDueStatsSyncs(db: Db, now: Date): Promise<number>`

- [ ] **Step 1: Write failing tests** (fake client unless stated):
  - It stores a snapshot with the fake's numbers and curve.
  - A `null` from `videoStats` sets the publication to `removed` and stores nothing.
  - A spent stats quota stores nothing and enqueues a retry with `runAfter = nextQuotaReset(now)`.
  - The channel is `needs_reconnect` → the job fails with `RECONNECT_MESSAGE` and no Google call is made.
  - `videoAnalytics` throws a 403 (`vi.spyOn`) → the snapshot is still stored with null analytics and `[]` retention.
  - A publication that isn't `published` → returns without a snapshot.
  - `enqueueDueStatsSyncs` enqueues once for a publication published 1 day ago and skips it on a second call (job active).
  - `enqueueStatsSync` returns `false` while a sync is queued.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Steps:
  1. Book the `videos.list` unit only after the channel checks pass.
  2. Analytics `startDate = pacificDay(publishedAt)` and `endDate = pacificDay(now)`.
  3. Analytics errors other than `cause: "token"` are logged with `logger.warn` and swallowed.
  4. In `worker/index.ts`, add a timer like the sweep's, calling `enqueueDueStatsSyncs` every `STATS_SCHEDULE_INTERVAL_MS`, logging failures and cleared on shutdown.
- [ ] **Step 4: Run** the new test, `tests/integration/publish-step.test.ts`, then `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): sync published clip stats on a schedule"`

### Task 5: Stats in the clip dialog

**Files:**

- Create: `components/ui/sparkline.tsx` (+ test, `docs/COMPONENTS.md` entry, `/dev/components` example), `components/projects/clip-stats.tsx` (+ test)
- Modify: `features/publishing/queries.ts` (`getPublishing`), `features/publishing/actions.ts`, `components/projects/clip-player-dialog.tsx`

**Interfaces:**

- Consumes: `statsRepository.latestFor`, `statsEarly`, `markerRatios`, `enqueueStatsSync`
- Produces:
  - Each `getPublishing().publications[clipId]` gains:
    - `publishedAt: Date | null`
    - `stats: { fetchedAt: Date; views: number; likes: number; comments: number; averageViewDurationS: number | null; averageViewPercentage: number | null; retention: number[]; markers: number[] } | null`. `retention` is the `watch` values in order. `markers` comes from `markerRatios` over the publication's `clipStartMs`/`clipEndMs`.
    - `early: boolean`
    - `refreshing: boolean`
  - `refreshStatsAction(publicationId: unknown): Promise<ActionResult>`. It checks workspace access the same way `retryPublicationAction` does and returns a `CONFLICT` "Stats are already refreshing" when `enqueueStatsSync` returns false.
  - `<Sparkline values: number[] markers?: number[] label: string className? />`: an SVG polyline scaled to its box, with markers as vertical ticks at fractions 0–1, `role="img"` and `aria-label={label}`.
  - `<ClipStats publication={PublicationState} />`

- [ ] **Step 1: Write failing component tests:**
  - **Published with stats:** shows "1,234 views", "56 likes", "7 comments", "11.5 s average view" and "64% watched on average", plus a sparkline with an accessible name containing "Retention".
  - **`early: true`:** shows "Data still coming in".
  - **`stats: null`:** shows "No stats yet" and a "Refresh stats" button.
  - **`retention: []`:** shows "YouTube hasn't shared the retention curve yet" instead of the chart.
  - **`status: "removed"`:** shows "Removed from YouTube" and no refresh button.
  - **`refreshing: true`:** the button is disabled and says "Refreshing…".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Render `<ClipStats>` in `ClipDetails` below the action buttons when the clip's publication is `published` or `removed`. Format numbers with `Intl.NumberFormat`. Refresh calls the action through the dialog's existing `useAction`/toast pattern, then `router.refresh()`.
- [ ] **Step 4: Run** the tests, `pnpm typecheck`, `pnpm lint` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): show published clip stats in the clip dialog"`

### Task 6: Published clips on the Channels page

**Files:**

- Create: `components/channels/published-clips.tsx` (+ test)
- Modify: `features/publishing/queries.ts` (add `getPublishedClips`), `app/(app)/channels/page.tsx`

**Interfaces:**

- Consumes: `statsRepository.forChannel`, `relativePerformance`, `statsEarly`
- Produces:
  - `getPublishedClips(): Promise<PublishedClipRow[]>`
  - `type PublishedClipRow = { publicationId: string; clipId: string; projectId: string; title: string; url: string | null; publishedAt: Date; views: number | null; averageViewPercentage: number | null; likes: number | null; relative: number | null; early: boolean }`
  - `relative` uses each row's latest snapshot age (`fetchedAt − publishedAt` in days) against every other row's latest snapshot.

- [ ] **Step 1: Write failing component tests:**
  - Rows render with the title linking to `/projects/{projectId}/clips/{clipId}`, plus views and "64%".
  - `relative` 2 shows "2.0× usual" and `null` shows "—".
  - Clicking the "Views" column header sorts descending, then ascending.
  - The default sort is newest first.
  - Empty → "Published clips show up here with their numbers."
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** with `components/ui/table.tsx`. Sortable headers are buttons inside `<th>` with `aria-sort`. On `/channels`, put the YouTube card first, then `<Tabs>` with "Published clips" (this list in its own `Suspense`) and an "Insights" tab that Task 12 fills. Until then the Insights tab shows the empty state "Insights arrive once clips have a week of stats."
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(channels): list published clips with their numbers"`

### Task 7: Phase 31 end to end, docs and close

**Files:**

- Modify: `tests/e2e/publish.spec.ts`, `docs/PROGRESS.md`, `docs/DECISIONS.md` (ADR-0066), `docs/PIPELINE.md` (the `sync_stats` job), `docs/TESTING.md` (the fake's stats)

- [ ] **Step 1: Extend the publish e2e:**
  - After the "Published" link appears, open the clip and click "Refresh stats".
  - Expect "1,234 views" within 60 s, after reloading if needed.
  - Go to `/channels`: the clip's title is in the Published clips table.
  - Run `expectNoSeriousA11yViolations` on both.
- [ ] **Step 2: Write ADR-0066 "Published clip stats and the channel playbook".** Use the existing ADR format and cover:
  - the sync ages
  - only `videos.list` is booked in the ledger, because Analytics has a separate quota whose limit isn't documented
  - removed detection handles both response shapes
  - the stored uploaded range
  - unverified: retention for Shorts, and how long YouTube's developer policies allow analytics to be stored (an audit item under B4)
- [ ] **Step 3:** Add Phase 31 to PROGRESS with Tasks 1–7 checked, a "Not verified: stats from a real channel" line, and a mention of the B4 storage-policy question.
- [ ] **Step 4: Run the full gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. All must pass.
- [ ] **Step 5: Commit:** `git commit -m "test(e2e): stats after publishing; docs for phase 31 (ADR-0066)"`

---

## Phase 32: Insights

### Task 8: Pure playbook logic

**Files:**

- Create: `features/insights/schema.ts`, `features/insights/playbook.ts`, `features/insights/playbook.test.ts`

**Interfaces:**

- Produces:
  - `ruleTargets = ["selection", "review"] as const`, `RuleTarget`
  - `suggestionKinds = ["add", "edit", "retire"] as const`
  - `suggestionStatuses = ["pending", "approved", "rejected"] as const`
  - `PLAYBOOK_RULE_CAP = 12`, `RULE_MAX_CHARS = 200`, `INSIGHTS_MIN_CLIPS = 8`, `INSIGHTS_MIN_AGE_DAYS = 7`
  - `ruleTextSchema = z.string().trim().min(1, "Write the rule").max(RULE_MAX_CHARS)`
  - `insightsResponseSchema`: `{ suggestions: Array<{ target, kind, ruleId: string | null, text: string, rationale: string, evidenceFor: string[], evidenceAgainst: string[], confidence: number (0–1) }> }` with max 10 suggestions
  - `type RawSuggestion`
  - `cleanSuggestions(raw: RawSuggestion[], known: { rules: { id: string; target: RuleTarget }[]; clipIds: string[] }): RawSuggestion[]`
  - `playbookSection(rules: readonly string[]): string`

- [ ] **Step 1: Write failing tests:**

```ts
it("is empty with no rules", () => expect(playbookSection([])).toBe(""))
it("lists rules under one heading", () =>
  expect(playbookSection(["Open on the crash", "Skip menus"])).toBe(
    "What has worked on this channel, learned from how its published clips did:\n- Open on the crash\n- Skip menus\n"
  ))
```

For `cleanSuggestions`, each case is dropped:

- an `edit` or `retire` whose `ruleId` is unknown, or belongs to the other target
- an `add`/`edit` with blank text or text over 200 characters
- a suggestion with no known `evidenceFor` clip

Separately, unknown clip ids are stripped from both evidence lists, and an `add` keeps `ruleId: null` whatever Claude sent.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(insights): playbook prompt block and suggestion cleaning"`

### Task 9: Playbook tables and prompt injection with provenance

**Files:**

- Modify: `lib/db/schema.ts`, `features/highlights/prompt.ts`, `features/highlights/review.ts`, `features/highlights/types.ts`, `features/highlights/anthropic.ts` (pass the review rules through), `features/pipeline/steps/select.ts`, `features/projects/queries.ts` (manual prompt), `features/clips/repository.ts` (accept `playbookRuleIds`)
- Create: migration `0014_*`, `features/insights/repository.ts`
- Test: `features/highlights/prompt.test.ts`, `features/highlights/review.test.ts`, `tests/integration/insights-repository.test.ts`, `tests/integration/select-step.test.ts`

**Interfaces:**

- Consumes: `playbookSection`, enums from Task 8
- Produces:
  - Table `playbook_rules`:
    - `id`
    - `channelId` (FK → youtube_channels, cascade)
    - `target`, `text`
    - `status` `active | retired`
    - `sourceSuggestionId` (nullable)
    - `supersedesId` (nullable)
    - `createdAt`, `retiredAt` (nullable)
  - Table `insight_suggestions`:
    - `id`
    - `channelId` (FK cascade)
    - `target`, `kind`
    - `ruleId` (nullable, FK → playbook_rules, set null)
    - `text`, `rationale`
    - `evidenceFor`, `evidenceAgainst` (jsonb `string[]` clip ids)
    - `confidence` (double)
    - `status`
    - `createdAt`, `decidedAt` (nullable)
  - `clips.playbookRuleIds` jsonb `string[]`, nullable.
  - `insightsRepository(db)` with:
    - `activeRules(channelId)`
    - `rules(channelId)` (all, newest first)
    - `getRule(id)`
    - `insertRule`
    - `retireRule(id)`
    - `restoreRule(id)`
    - `countActive(channelId, target)`
    - `pendingSuggestions(channelId)`
    - `rejectedSuggestions(channelId)`
    - `replacePending(channelId, suggestions)`: deletes the channel's pending suggestions, then inserts
    - `getSuggestion(id)`
    - `decideSuggestion(id, status)`
  - `PromptInput.playbook?: readonly string[]` (selection rules). `buildSelectionPrompt` inserts `\n${playbookSection(playbook)}` right after the niche block when non-empty.
  - `SelectorInput.playbook?: { selection: readonly string[]; review: readonly string[] }`. `buildReviewContent` prefixes its first text block with `${playbookSection(review)}\n` when non-empty.
  - `select.ts` loads the workspace channel's active rules, passes them, and stores every active rule id (both targets) on each inserted clip as `playbookRuleIds`, or `null` when there are none. The manual prompt passes the selection rules too.

- [ ] **Step 1: Write failing tests:**
  - With `playbook: []` or undefined, `buildSelectionPrompt` and `buildReviewContent` return strings equal to today's (compare against a call without the field).
  - With rules, the section appears once, right after the niche text.
  - Repository round-trips.
  - `select-step`: with two active rules on the workspace's channel, the request body sent to Claude (captured in the existing MSW handler) contains the section, and the inserted clips' `playbookRuleIds` equal both ids.
  - With no channel, `playbookRuleIds` is `null` and the body has no section.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (`pnpm db:generate` for 0014). **Step 4: Run** the highlights unit tests and `select-step` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(insights): playbook tables and rules in the selection and review prompts"`

### Task 10: The `analyze_performance` job

**Files:**

- Create: `features/insights/prompt.ts` (+ test), `features/insights/service.ts` (eligibility part), `features/pipeline/steps/analyze-performance.ts`
- Modify: `features/jobs/schema.ts` (`analyze_performance`, payload `{ channelId }`), `features/pipeline/state-machine.ts`, `features/pipeline/handlers.ts` (stall 15 min), `features/highlights/anthropic.ts` (export `createClient` and `requestJson`; widen `requestJson`'s refusal and invalid-JSON messages through a `subject` parameter, default `"highlight"`, so selection messages don't change), `features/accounts/usage.ts` (`recordUsage` accepts `project.id: string | null`)
- Test: `tests/integration/analyze-performance.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2, 8, 9; `resolveAnthropicKey`, `recordUsage`
- Produces:
  - `type InsightClip = { clipId: string; title: string; hook: string; reason: string; score: number; niche: string; transcript: string; effects: string[]; beats: string[]; moments: RetentionMoment[]; views: number; averageViewPercentage: number | null; relative: number | null; ruleIds: string[] }`
  - `INSIGHTS_SYSTEM_PROMPT: string`
  - `buildInsightsPrompt(clips: InsightClip[], rules: { id: string; target: RuleTarget; text: string }[], rejected: { target: RuleTarget; text: string }[]): string`, a pure function
  - `eligibleInsightClips(db: Db, channelId: string): Promise<InsightClip[]>`: published, not removed, with a snapshot fetched at least `INSIGHTS_MIN_AGE_DAYS` after `publishedAt` (the latest such snapshot). The transcript is the uploaded range's lines via `transcriptLines`.
  - `analyzePerformanceStep: JobHandler`

- [ ] **Step 1: Write failing tests:**
  - **Prompt unit tests:** the prompt lists each clip id once, the current rules with ids and targets, and the rejected texts under a "Already rejected, don't suggest again" heading. It states the 200-character limit and the 12-per-target cap.
  - **Integration, with Claude mocked through MSW the way `anthropic-selector.test.ts` does it:**
    - 8 eligible clips → stored pending suggestions after `cleanSuggestions`, with earlier pending ones replaced and rejected ones kept.
    - One `claude_run` usage row, with `projectId` null.
    - Fewer than 8 eligible → fails with "Find patterns needs 8 published clips with a week of stats".
    - No Claude key → fails with "Add a Claude API key in Workspace settings to use Claude."
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `INSIGHTS_SYSTEM_PROMPT` explains:
  - the job: find what separates the channel's clips that held viewers from the ones that didn't
  - selection rules steer which moments get picked, and review rules steer the final edit, hook and beats
  - each rule is one instruction of at most 200 characters
  - cite clip ids as evidence for and against
  - prefer editing or retiring a rule over adding a near-duplicate
  - suggest nothing when the evidence is weak

  Use `requestJson` with effort `"high"` and `insightsResponseSchema`.

- [ ] **Step 4: Run** — PASS, plus `tests/integration/anthropic-selector.test.ts` unchanged.
- [ ] **Step 5: Commit:** `git commit -m "feat(insights): analyze published clips with Claude into pending suggestions"`

### Task 11: Insights actions and rule services

**Files:**

- Modify: `features/insights/service.ts`
- Create: `features/insights/actions.ts`, `features/insights/queries.ts`
- Test: `tests/integration/insights-actions.test.ts`

**Interfaces:**

- Consumes: Tasks 8–10
- Produces:
  - All mutations run in one transaction and are scoped to the viewer's workspace channel (`NOT_FOUND` otherwise):
    - `approveSuggestion(db, channelId, suggestionId, { text?: string; retireRuleId?: string })`
    - `rejectSuggestion(db, channelId, id)`
    - `editRule(db, channelId, ruleId, text)`: retires the old rule and inserts one with `supersedesId`
    - `retireRule(db, channelId, ruleId)`
    - `restoreRule(db, channelId, ruleId, { retireRuleId?: string })`
  - Action wrappers return `ActionResult`, following `features/publishing/actions.ts`:
    - `approveSuggestionAction`, `rejectSuggestionAction`, `editRuleAction`, `retireRuleAction`, `restoreRuleAction`
    - `findPatternsAction()`: enqueues `analyze_performance` (`projectId: null`, `maxAttempts: 1`) after checking the gates below
  - `getInsights(): Promise<{ channel: { title: string } | null; eligible: number; needed: number; claudeAvailable: boolean; running: boolean; lastError: string | null; suggestions: SuggestionView[]; rules: { selection: RuleView[]; review: RuleView[]; retired: RuleView[] } }>`
    - `SuggestionView` adds the evidence clips' titles, project ids and views, for the cards.
    - `lastError` is the error of the newest `analyze_performance` job for the channel if it failed and no newer job succeeded.
  - Error copy (exact):
    - The cap is reached and there's no `retireRuleId` → `CONFLICT` "This list already has 12 rules. Pick one to retire."
    - The suggestion's rule is no longer active → `CONFLICT` "That rule changed since this suggestion was made. Run Find patterns again."
    - A non-pending suggestion → `CONFLICT` "This suggestion was already decided."
    - `findPatternsAction` refuses when Claude is unavailable, when `eligible < INSIGHTS_MIN_CLIPS`, or when a job is already active ("Already looking for patterns").

- [ ] **Step 1: Write failing tests:**
  - Approve `add` creates an active rule with `sourceSuggestionId`.
  - Approve with edited text stores the edited text.
  - Approve `edit` retires the old rule and creates one with `supersedesId`.
  - Approve `retire` retires the rule.
  - A 13th `add` fails with the cap copy, and succeeds with `retireRuleId`, leaving exactly 12 active.
  - A stale `edit` fails with the "changed" copy.
  - Reject keeps the row as `rejected`.
  - Restore respects the cap.
  - Another workspace's channel id → `NOT_FOUND`.
  - **The approval reaches the prompt:** after an approved selection rule, building the selection input for that workspace's next `select` run includes the rule (assert through the `select-step` path from Task 9).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(insights): approve, reject, edit, retire and restore playbook rules"`

### Task 12: Insights UI on the Channels page

**Files:**

- Create: `components/channels/insights.tsx` (+ test), `components/channels/suggestion-card.tsx`, `components/channels/playbook.tsx`
- Modify: `app/(app)/channels/page.tsx`

**Interfaces:**

- Consumes: `getInsights`, the Task 11 actions

- [ ] **Step 1: Write failing component tests:**
  - **Find patterns gating:**
    - Disabled with "3 of 8 clips have a week of stats" when `eligible: 3`.
    - Disabled with the Claude-key copy when `claudeAvailable: false`.
    - Shows "Looking for patterns…" when `running`.
    - `lastError` is shown in a `role="alert"`.
  - **Suggestion card:**
    - Shows the target ("Picking clips" / "Editing clips"), the kind ("New rule" / "Change rule" / "Retire rule"), the rule text, the rationale, and evidence links with views.
    - Approve calls `approveSuggestionAction`.
    - "Edit, then approve" opens a textarea (prefilled, 200-char limit with a counter).
    - Reject calls `rejectSuggestionAction`.
  - **Cap dialog:** an Approve that returns the cap error opens a dialog listing the active rules for that target as radio options. Confirming calls approve again with `retireRuleId`.
  - **Playbook:**
    - Two lists, "Picking clips" and "Editing clips", each with an "x / 12" count.
    - Each rule has Edit (inline textarea) and Retire.
    - A collapsed "Retired" list with Restore.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** with the existing `Card`, `Button`, `Textarea`, `Dialog`, `RadioGroup` and `StatusPill`. Toasts follow the `useAction` pattern used in `components/settings/account-settings.tsx`, then `router.refresh()`. While a job is running, refresh the page every 5 s (`router.refresh` on an interval cleared on unmount). Fill the Insights tab from Task 6.
- [ ] **Step 4: Run** the tests, `pnpm lint`, `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(channels): insights suggestions and the playbook"`

### Task 13: Phase 32 end to end, docs and close

**Files:**

- Create: `tests/e2e/insights.spec.ts`
- Modify: `tests/e2e/utils/youtube.ts` (seed helpers), `docs/PROGRESS.md`, `docs/DECISIONS.md` (ADR-0066 addendum), `docs/BUSINESS_LOGIC.md` (playbook rules), `docs/PIPELINE.md`, `docs/TESTING.md`

- [ ] **Step 1: Add `seedInsightSuggestion()`** to `tests/e2e/utils/youtube.ts`. It inserts one pending `add` suggestion for `e2e-channel` (target `selection`, text "Open on the crash, not the build-up", evidence `[]`), with cleanup in `removeYouTubeChannel`. Evidence can be empty here because seeding bypasses `cleanSuggestions`.
- [ ] **Step 2: Write `insights.spec.ts`:**
  - Seed the channel and the suggestion, then go to `/channels` and open the Insights tab.
  - Expect the suggestion card and run axe.
  - Click Approve, then expect "Open on the crash, not the build-up" under "Picking clips" with "1 / 12".
  - Retire it, then expect it under Retired.
- [ ] **Step 3: Update the docs:**
  - ADR-0066 addendum covering:
    - a new analysis replaces pending suggestions
    - restore flips status, with no new row
    - manual-mode clips don't record provenance
    - the analysis counts as one Claude run with no project
  - PROGRESS Phase 32 with Tasks 8–13 checked, and the Phase 25 "tune … once posted clips have retention numbers" item noted as unblocked.
  - BUSINESS_LOGIC: the playbook rules and cap.
- [ ] **Step 4: Run the full gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. All must pass.
- [ ] **Step 5: Commit:** `git commit -m "test(e2e): approve an insight into the playbook; docs for phase 32"`
