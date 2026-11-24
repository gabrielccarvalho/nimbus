# YouTube Publishing (Phase 30) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an approved, rendered clip straight to the workspace's YouTube channel as a Short, with editable metadata. Uploads share one project-wide quota, so they wait for the daily reset when it's spent.

**Architecture:** New `features/publishing/` module. Pure metadata and quota-day logic; a `YouTubeClient` adapter (plain `fetch`, plus a fake for e2e); our own Google token refresh against the Better Auth `account` row; a `publish_clip` worker job doing a resumable upload with a saved session URI; Postgres tables for channels, publications and the quota ledger. The UI is a publish dialog opened from the clip dialog and the clip editor.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + Postgres (PGlite in tests), zod, Base UI/shadcn, Vitest + MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-youtube-publishing-and-insights-design.md` (sections: Constraints, Channel connection, Publishing, Quota sharing, Errors and edge cases). Stats (Phase 31) and Insights (Phase 32) get their own plans after this ships.

## Global Constraints

- Nothing publishes without an explicit click on that clip. No bulk publish.
- The publish action is enabled only when clip `status === "rendered"` (editing moves it back to `approved`, see `features/clips/service.ts`).
- Privacy defaults to `private`. Category `"20"` (Gaming). `selfDeclaredMadeForKids: false`. `defaultLanguage` = project spoken language.
- Title ≤ 100 chars, description ≤ 5,000 chars. YouTube rejects `<` and `>` in both, so strip them.
- `publishAt` is only sent with `privacyStatus: "private"`.
- Scopes: `YOUTUBE_SCOPES` = `youtube.readonly`, `youtube.upload`, `https://www.googleapis.com/auth/yt-analytics.readonly`.
- Quota day = the calendar date in `America/Los_Angeles`, resetting at midnight Pacific.
- Quota constants (checked against Google's docs in Task 1; uploads have their own bucket since 2026-06-01): `YOUTUBE_DAILY_QUOTA` env, default `10000`, covers every endpoint except `videos.insert`. `YOUTUBE_DAILY_UPLOADS` env, default `100`, with `UPLOAD_UNITS = 1` counted against it only. `LIST_UNITS = 1`. `STATS_RESERVE_UNITS` is gone: uploads no longer compete with stats reads.
- Plan daily publish limits: free `2`, creator `5`, studio `15`, admin `null`.
- Long work only in the worker. Files touching DB, network secrets or the filesystem start with `import "server-only"`. `features/*` never imports `app/` or `components/`.
- Comments only where code can't speak. Conventional Commits, no AI trailers. Never commit `.env*` or `data/`.
- Phase gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass.

## Review Focus

1. **Re-render while a publish is queued:** the re-render deletes the old asset (`render-clip.ts:183`). The queued publish has to upload the asset it was created with, so the old asset stays until no active publication references it (Task 8).
2. **Publish double-clicked:** only one publication is created, and the second call returns a clear "already publishing" error (Task 9).
3. **Channel disconnected while a publish waits for quota:** after the reset, the job fails once with the reconnect message and doesn't keep retrying (Task 8).
4. **Access token expires mid-upload:** on a 401, refresh once and resume from the server's byte offset, not from zero (Task 8).
5. **Title or description with `<`/`>`, or a title over 100 chars:** these are cleaned before upload instead of failing with a YouTube 400 (Task 3).

---

### Task 1: Check Google's current rules, then the ADR and docs

**Files:**

- Modify: `docs/DECISIONS.md` (append ADR-0065)
- Modify: `docs/ARCHITECTURE.md:3`
- Modify: `docs/PROGRESS.md` (add Phase 30 after Phase 29)

- [ ] **Step 1:** From Google's current docs, confirm: the `videos.insert` unit cost, the default daily quota, the private-only lock for unaudited projects (and how it shows up: forced `privacyStatus` or an error), the 7-day refresh token expiry in Testing mode, and the Shorts maximum length. If a value differs from Global Constraints, update the constant in this plan and in the spec.
- [ ] **Step 2:** Write ADR-0065 "Clips publish to YouTube from a hosted Nimbus". Include: Google APIs leave the machine; one Google Cloud project shared by every workspace; the quota ledger; our own token refresh; fetch over `googleapis`; the verified numbers from Step 1. Use the existing ADR format (Context / Decision / Alternatives / Consequences, one paragraph).
- [ ] **Step 3:** Change ARCHITECTURE line 3 to name Google (YouTube) APIs next to Anthropic as the only outbound calls. Add Phase 30 to PROGRESS with one `[ ]` per task below, plus a Blocker entry: "Google OAuth verification and YouTube API audit not started (needed before public launch)".
- [ ] **Step 4: Commit:** `git commit -m "docs: plan YouTube publishing (ADR-0065)"`

### Task 2: Schema, migration and repository

**Files:**

- Modify: `lib/db/schema.ts` (add three tables, `clips.description`)
- Modify: `features/accounts/schema.ts` (`YOUTUBE_SCOPES`, `Plan.publishesPerDay`)
- Create: `features/publishing/schema.ts`, `features/publishing/repository.ts`
- Create: migration via `pnpm db:generate` (lands in `lib/db/migrations/`)
- Test: `tests/integration/publishing-repository.test.ts`

**Interfaces:**

- Produces (`features/publishing/schema.ts`):
  - `publicationStatuses = ["queued","waiting_quota","uploading","processing","published","failed","removed"] as const`, `type PublicationStatus`.
  - `ACTIVE_PUBLICATION_STATUSES: ReadonlySet<PublicationStatus>`: queued, waiting_quota, uploading, processing.
  - `channelStatuses = ["ok","needs_reconnect"] as const`.
  - `privacyStatuses = ["private","unlisted","public"] as const`.
  - `publishInputSchema` (zod): `{ title: string 1..100, description: string ≤5000, tags: string[] (each ≤ 30 chars, total joined ≤ 500), privacy: PrivacyStatus, publishAt: Date | null }`, `type PublishInput`.
  - `quotaKinds = ["upload","list","stats"] as const`.
- Produces (`lib/db/schema.ts`):
  - `youtubeChannels`: `id, workspaceId (unique, FK cascade), accountId (FK account.id cascade), channelId, title, thumbnailUrl, status, ...timestamps`.
  - `publications`: `id, clipId (FK clips cascade), channelId (FK youtubeChannels cascade), renderAssetId (FK assets set null), metadata jsonb PublishInput, status, uploadUri text null, videoId text null, url text null, error text null, publishedAt timestamptz null, ...timestamps`, plus index `(clipId, createdAt)`.
  - `youtubeQuotaUsage`: `id, day text ("YYYY-MM-DD"), workspaceId text null, kind, units integer, createdAt`, plus index `(day)`.
  - `clips.description text not null default ""`.
- Produces (`publishingRepository(db)` in `features/publishing/repository.ts`):
  - `getChannel(workspaceId): Promise<YouTubeChannel | undefined>`, `upsertChannel(input)`, `setChannelStatus(id, status)`
  - `createPublication(input): Promise<Publication>`, `getPublication(id)`, `updatePublication(id, patch)`
  - `latestForClips(clipIds: string[]): Promise<Map<string, Publication>>`
  - `activeForClip(clipId): Promise<Publication | undefined>`
  - `assetInActiveUse(assetId): Promise<boolean>`
  - `countCreatedOnDay(workspaceId, day: string): Promise<number>`, which counts publications whose `createdAt` falls on that Pacific day.
  - `spendQuota({ day, workspaceId, kind, units, budget, reserve }): Promise<boolean>`. It runs in a transaction. Uploads may only spend up to `budget - reserve`, and `stats`/`list` up to `budget`. It returns false without inserting when the spend would cross that limit.

- [ ] **Step 1: Write failing tests** in `tests/integration/publishing-repository.test.ts` (PGlite, same setup as `repositories.test.ts`):
  - `spendQuota` returns true until uploads total `budget - reserve`, then false. A `stats` spend still succeeds after that.
  - `activeForClip` ignores `published`/`failed` and returns a `waiting_quota` row.
  - `assetInActiveUse` is true for a queued publication's asset and false once it's published.
  - `latestForClips` returns the newest row per clip.
  - Deleting a clip cascades its publications.
- [ ] **Step 2:** Run `pnpm vitest run tests/integration/publishing-repository.test.ts`. Expect FAIL (module not found).
- [ ] **Step 3:** Add the tables, columns, `YOUTUBE_SCOPES` entry and `publishesPerDay` (free 2, creator 5, studio 15, admin null). Then implement the repository and run `pnpm db:generate`.
- [ ] **Step 4:** Run the test (PASS), then `pnpm typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): channel, publication and quota tables"`

### Task 3: Pure metadata and quota-day logic

**Files:**

- Create: `features/publishing/metadata.ts`, `features/publishing/quota.ts`
- Test: `features/publishing/metadata.test.ts`, `features/publishing/quota.test.ts`

**Interfaces:**

- Produces:
  - `cleanText(s: string, max: number): string`: strips `<` and `>`, trims, cuts at `max` on a word boundary when possible.
  - `defaultPublishInput(clip: { title: string; description: string }, defaults: PublishingDefaults): PublishInput`
  - `type PublishingDefaults = { privacy: PrivacyStatus; tags: string[]; hashtags: string }`
  - `videoResource(input: PublishInput, language: string)`: returns the `{ snippet, status }` body for `videos.insert`.
  - `pacificDay(at: Date): string` (`"YYYY-MM-DD"`)
  - `nextQuotaReset(at: Date): Date` (the next midnight in `America/Los_Angeles`, DST-correct)
- [ ] **Step 1: Write failing tests:**
  - `cleanText("a <b> c", 100) === "a b c"`. A 120-char title comes back ≤ 100 chars and doesn't end mid-word.
  - `defaultPublishInput` appends `defaults.hashtags` on a new line, and adds `#Shorts` if it's missing.
  - `videoResource` gives `snippet.categoryId === "20"`, `status.selfDeclaredMadeForKids === false`, `snippet.defaultLanguage === "pt"` for `"pt"`. With `publishAt` set and privacy `"public"`, it forces `privacyStatus: "private"` and sets `status.publishAt` to an ISO string.
  - `pacificDay(new Date("2026-11-25T07:59:00Z")) === "2026-11-24"` and `"…T08:00:00Z"` gives `"2026-11-25"`.
  - `nextQuotaReset(new Date("2026-03-08T12:00:00Z"))` equals `new Date("2026-03-09T07:00:00Z")` (the DST change).
- [ ] **Step 2:** Run `pnpm vitest run features/publishing`. Expect FAIL.
- [ ] **Step 3:** Implement using `Intl.DateTimeFormat` with `timeZone: "America/Los_Angeles"`. No date library.
- [ ] **Step 4:** Run again. Expect PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): video metadata and quota day helpers"`

### Task 4: Google access tokens

**Files:**

- Create: `features/publishing/google-token.ts`
- Test: `tests/integration/google-token.test.ts` (MSW from `tests/utils/msw.ts`)

**Interfaces:**

- Consumes: `account` table, `publishingRepository.setChannelStatus`, env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- Produces: `googleAccessToken(db: Db, channel: YouTubeChannel, opts?: { force?: boolean }): Promise<string>`. It returns the stored token when it's valid for at least 60 s more, and otherwise refreshes it against `https://oauth2.googleapis.com/token` and saves the new access token and expiry. On `invalid_grant`, it sets the channel to `needs_reconnect` and throws `new AppError("UNAUTHORIZED", "Reconnect YouTube in Settings › Connected channels")`.
- [ ] **Step 1: Write failing tests:**
  - A valid token makes no network call.
  - An expired token makes one POST and is saved.
  - `force: true` refreshes even when the token is valid.
  - A 400 `{ error: "invalid_grant" }` throws UNAUTHORIZED and sets the channel status to `needs_reconnect`.
  - A 500 throws `EXTERNAL` (retryable).
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run it. Expect PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): refresh Google access tokens"`

### Task 5: YouTube client adapter

**Files:**

- Create: `features/publishing/youtube.ts` (interface + `getYouTubeClient()`), `features/publishing/youtube-http.ts`, `features/publishing/youtube-fake.ts`
- Modify: `lib/env.ts` (`YOUTUBE_CLIENT: z.enum(["http","fake"]).default("http")`, `YOUTUBE_DAILY_QUOTA` int default 10000, `YOUTUBE_DAILY_UPLOADS` int default 100)
- Modify: `.env.example`
- Test: `tests/contracts/youtube.test.ts` (MSW against the http client; the fake must pass the same contract cases where they apply)

**Interfaces:**

- Produces:

```ts
export interface YouTubeClient {
  myChannel(
    token: string
  ): Promise<{ channelId: string; title: string; thumbnailUrl: string | null }>
  startUpload(token: string, body: object, bytes: number): Promise<string> // session URI
  uploadedBytes(
    token: string,
    uploadUri: string,
    bytes: number
  ): Promise<number | { videoId: string }>
  uploadFrom(
    token: string,
    uploadUri: string,
    file: string,
    offset: number,
    bytes: number,
    signal: AbortSignal,
    onProgress: (sent: number) => void
  ): Promise<{ videoId: string }>
}
export function getYouTubeClient(): YouTubeClient
```

- The http client calls `channels.list?part=snippet&mine=true`. `startUpload` POSTs `upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` and reads the `Location` header. `uploadedBytes` PUTs `Content-Range: bytes */{bytes}`: a 308 response's `Range` header gives the offset, a 200/201 means already done. `uploadFrom` streams the file from `offset` with `Content-Range`.
- Errors map to `AppError` like this:
  - 401 → `UNAUTHORIZED` with `cause: "token"` (Task 8 refreshes and retries)
  - 403 `quotaExceeded` → `EXTERNAL` with `cause: "quota"`
  - 403 `uploadLimitExceeded` → `CONFLICT` "This channel hit YouTube's own upload limit for today"
  - other 4xx → `VALIDATION` with YouTube's message
  - 5xx and network errors → `EXTERNAL`
- The fake keeps state in memory, returns `videoId: "fake-<n>"`, and fails the first `uploadFrom` when env `YOUTUBE_FAKE_FAIL_ONCE=1`.
- [ ] **Step 1: Write failing contract tests:**
  - `startUpload` returns the `Location`.
  - `uploadedBytes` parses `Range: bytes=0-524287` as `524288`.
  - `uploadFrom` sends `Content-Range: bytes 524288-{n-1}/{n}`.
  - 403 `quotaExceeded` maps to `cause: "quota"`, and 401 maps to UNAUTHORIZED.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3:** Implement the http and fake clients.
- [ ] **Step 4:** Run it. Expect PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): YouTube client with resumable uploads"`

### Task 6: Channel connection and the Channels pages

**Files:**

- Create: `features/publishing/service.ts` (`ensureYouTubeChannel`)
- Modify: `features/accounts/queries.ts:69-110` (`getChannelSettings`)
- Modify: `components/settings/account-settings.tsx` (`ChannelList`: "Reconnect" when `needsReconnect`)
- Modify: `app/(app)/channels/page.tsx` (replace coming soon with the YouTube channel card. Other providers keep a small "coming soon" row)
- Modify: `scripts/doctor.ts` (Google credentials configured: warn, not fail)
- Test: `tests/integration/publishing-channel.test.ts`, `components/settings/account-settings.test.tsx` (create if absent)

**Interfaces:**

- Produces:
  - `ensureYouTubeChannel(db, workspaceId, googleAccount): Promise<YouTubeChannel | undefined>`. If all `YOUTUBE_SCOPES` are granted and there's no channel row, it calls `myChannel` (books `LIST_UNITS`) and inserts one. If the row exists with `needs_reconnect` and the account was updated after the row, it sets the status back to `ok`.
  - `getChannelSettings()` YouTube entry gains `needsReconnect: boolean` and `channelTitle: string | null`.
- [ ] **Step 1: Write failing tests:**
  - With scopes granted, a channel is created once, and a second call makes no network call.
  - With only the old two scopes, nothing is created and the entry shows not connected.
  - A `needs_reconnect` row whose account `updatedAt` is newer becomes `ok`.
  - RTL: `ChannelList` shows a "Reconnect" button for a YouTube entry with `needsReconnect`.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement it. The `/channels` card shows the avatar, title, published-clip count (`publications` with status `published`) and status. Use the existing `ChannelIcon` and design tokens.
- [ ] **Step 4:** Run the tests (PASS), then `pnpm lint`.
- [ ] **Step 5: Commit:** `git commit -m "feat(channels): connect a YouTube channel to the workspace"`

### Task 7: Description drafted at selection

**Files:**

- Modify: `features/highlights/types.ts` (`rawCandidateSchema.description: z.string().optional()`)
- Modify: `features/highlights/prompt.ts` (ask for `description`: 1–2 sentences, no hashtags, the clip's language)
- Modify: `features/highlights/heuristic.ts` (description = the hook)
- Modify: the place selection results are saved as clips (`features/pipeline/steps/select.ts`) and `createClipAction`: store `description ?? hook`
- Test: `features/highlights/prompt.test.ts`, `tests/integration/select-step.test.ts`
- [ ] **Step 1: Write failing tests:**
  - The selection prompt text contains `"description"` in the JSON shape.
  - `select-step` stores a candidate's `description` on the clip, and falls back to `hook` when it's absent.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the tests. Expect PASS. Prompt snapshot tests may change; update them and check the diff only adds the description field.
- [ ] **Step 5: Commit:** `git commit -m "feat(highlights): draft a description for each clip"`

### Task 8: The `publish_clip` job

**Files:**

- Create: `features/pipeline/steps/publish-clip.ts`
- Modify: `features/jobs/schema.ts` (`"publish_clip"`, payload `{ publicationId: string }`)
- Modify: `features/pipeline/handlers.ts` (register; stall 30 min; `onJobFinalFailure` marks the publication `failed` with the user message and returns before `markFailed`; `onJobCancelled` sets it `failed` "Cancelled")
- Modify: `features/pipeline/steps/render-clip.ts:174-184` (skip deleting `previous` when `assetInActiveUse(previous.id)`)
- Test: `tests/integration/publish-step.test.ts`

**Interfaces:**

- Consumes: `publishingRepository`, `googleAccessToken`, `getYouTubeClient`, `videoResource`, `pacificDay`, `nextQuotaReset`, `UPLOAD_UNITS`, `getEnv().YOUTUBE_DAILY_UPLOADS`, `getEnv().YOUTUBE_DAILY_QUOTA`.
- Produces: `publishClipStep: JobHandler`.

**Behaviour, in order:**

1. Load the publication, clip, project and channel. If any is missing, throw `CANCELLED`. If the channel is `needs_reconnect`, throw `UNAUTHORIZED` with the reconnect message.
2. If there's no `uploadUri`, try `spendQuota(upload)`. If that's refused, set `waiting_quota`, enqueue a new `publish_clip` with `runAfter: nextQuotaReset(now)` and return.
3. Set `uploading`. Get a token. If there's no `uploadUri`, call `startUpload` and save the URI. Otherwise call `uploadedBytes` to find the offset.
4. Call `uploadFrom`, reporting progress as a fraction. On `UNAUTHORIZED` with `cause: "token"`, get a token with `force: true`, re-read the offset and continue, once only. On `cause: "quota"`, behave as in step 2, keeping the saved `uploadUri`.
5. On success, set `published` with `videoId`, `url = https://youtube.com/shorts/{videoId}` and `publishedAt`. If the clip no longer points at this asset and `assetInActiveUse` is false, delete the asset.

- [ ] **Step 1: Write failing tests** (fake client, PGlite):
  - The happy path ends `published` with a `videoId`.
  - An exhausted budget leaves `waiting_quota` and enqueues a job whose `runAfter` is the next Pacific midnight.
  - A failure after `startUpload` keeps `uploadUri`, and the retry resumes from `uploadedBytes` without calling `startUpload` again.
  - A 401 mid-upload refreshes once and finishes. A second 401 fails UNAUTHORIZED.
  - A channel `needs_reconnect` at run time ends `failed` with "Reconnect YouTube…" after one attempt.
  - Re-rendering the clip while its publication is `queued` keeps the old asset, the job uploads it, and it's deleted afterwards.
  - A deleted clip cancels the job.
- [ ] **Step 2:** Run `pnpm vitest run tests/integration/publish-step.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the test (PASS), then `pnpm test`.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): publish_clip job with resumable upload and quota wait"`

### Task 9: Server actions and queries

**Files:**

- Create: `features/publishing/actions.ts` (`"use server"`), `features/publishing/queries.ts`
- Test: `tests/integration/publish-actions.test.ts`

**Interfaces:**

- Produces:
  - `publishClipAction(clipId: unknown, input: unknown): Promise<Result<{ publicationId: string }>>`. It parses with `publishInputSchema`, scopes to the viewer's workspace (same check as `updateClipAction`), and runs these checks in order:
    1. Clip status is `rendered`, else `CONFLICT` "Render the latest edit first".
    2. The channel exists and is `ok`, else `CONFLICT` "Connect YouTube first" or the reconnect message.
    3. `activeForClip` is none, else `CONFLICT` "This clip is already publishing".
    4. `countCreatedOnDay < plan.publishesPerDay`, else `CONFLICT` "Your plan allows N publishes a day".

    Then it creates a `queued` publication with the clip's `renderAssetId`, enqueues `publish_clip` and calls `revalidatePath` for the clips page.

  - `retryPublicationAction(publicationId: unknown)`: only from `failed`. Creates a new publication with the same metadata, through the same checks.
  - `getPublishing(projectId): Promise<{ channel: { title: string; status: ChannelStatus } | null; defaults: PublishingDefaults; publications: Record<clipId, { status; url; error; progress? }>; publishesLeftToday: number | null }>`
- [ ] **Step 1: Write failing tests:** one test for each rejection above (including a double call where the second fails), the happy path enqueues exactly one job, and another workspace's clip returns NOT_FOUND.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): publish and retry actions"`

### Task 10: Publishing defaults and plan usage

**Files:**

- Modify: `features/settings/schema.ts` (`publishPrivacy` default `"private"`, `publishTags` default `[]`, `publishHashtags` default `"#Shorts #gaming"`)
- Modify: the Project defaults settings page/form under `app/(app)/settings/workspace/` (a "Publishing" group: privacy select, tags input, hashtags line)
- Modify: `app/(app)/settings/workspace/plan/page.tsx` ("Publishes today: x of y", or "No limit")
- Test: `tests/integration/settings.test.ts`, `tests/e2e/settings.spec.ts` (an existing spec; add one case)
- [ ] **Step 1: Write failing tests:** stored settings without the new keys parse to the defaults, and saving `publishPrivacy: "unlisted"` round-trips.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement it with existing shadcn Select and Input components.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(settings): publishing defaults and daily publish usage"`

### Task 11: Publish dialog and status on clips

**Files:**

- Create: `components/projects/publish-dialog.tsx`, `components/projects/publish-dialog.test.tsx`
- Modify: `components/projects/clip-player-dialog.tsx:~300` (a "Publish" button next to Download)
- Modify: `components/projects/clip-editor.tsx:~598` (same, in the output panel)
- Modify: `components/projects/clips-grid.tsx` (a tile badge: "Publishing…" / "Waiting for YouTube's daily limit" / "Published ↗" / "Publish failed")
- Modify: the clips page loader to pass `getPublishing(projectId)` down

**Interfaces:**

- Produces: `<PublishDialog clip={{ id, title, description }} publishing={...from getPublishing} />`. It's built from the existing Dialog, Input, Textarea, Select and Switch, with a datetime input for the schedule. The fields are prefilled with `defaultPublishInput`.
- Copy (exact):
  - Under privacy: "Until Nimbus passes Google's review, YouTube keeps API uploads private. You can make it public in YouTube Studio."
  - Disabled reasons: "Render the latest edit first", "Connect YouTube in Settings › Connected channels", and the plan-limit message.
- [ ] **Step 1: Write failing RTL tests:**
  - The dialog prefills the title and description, and the description ends with the hashtags line.
  - Choosing a schedule with "Public" switches privacy to "Private" and shows why.
  - Submit calls `publishClipAction` with the parsed input.
  - The button is disabled with the render reason when the clip isn't `rendered`.
  - The grid shows "Published" with a link to the url.
- [ ] **Step 2:** Run `pnpm vitest run components/projects/publish-dialog.test.tsx components/projects/clips-grid.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement it. Upload progress comes through the existing `useProjectEvents` refresh.
- [ ] **Step 4:** Run the tests (PASS), then `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat(clips): publish a clip to YouTube"`

### Task 12: End to end and phase close

**Files:**

- Modify: `playwright.config.ts` webServer env (`YOUTUBE_CLIENT=fake`)
- Create: `tests/e2e/publish.spec.ts`. Seed a `youtube_channels` row for the test user's workspace through a helper in `tests/e2e/utils/`, following `user.ts`.
- Modify: `docs/PROGRESS.md` (tick Phase 30 items), `docs/TESTING.md` (the fake YouTube client)
- [ ] **Step 1: Write the e2e:** render a clip → open the dialog → Publish → change the title → submit → the tile shows "Published" and links to `https://youtube.com/shorts/fake-1`. Include an axe check on the open dialog. Second case: a clip edited after the render shows the disabled reason.
- [ ] **Step 2:** Run `pnpm test:e2e tests/e2e/publish.spec.ts`. Expect FAIL, then make it pass.
- [ ] **Step 3:** Run the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. Everything PASSES.
- [ ] **Step 4:** Tick PROGRESS. Add under "Not verified": "A real upload to YouTube (needs a Google project with the YouTube Data API enabled)".
- [ ] **Step 5: Commit:** `git commit -m "test(e2e): publish a clip to YouTube"`
