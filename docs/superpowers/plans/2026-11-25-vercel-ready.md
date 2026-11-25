# Ready for Vercel, still self-hostable (Phase 36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Nimbus deployable to Vercel Pro (web on functions, worker as a Daemon, S3-compatible storage, hosted Postgres) while `pnpm dev` and a self-hosted `docker compose` keep working.

**Architecture:** `StorageAdapter` stops exposing file paths. The worker works in a per-job scratch directory: `localCopy` brings inputs in, `putFile` sends results out. `LocalStorage` makes both free; `S3Storage` downloads and uploads. Browsers upload straight to storage through a signed target and finish with a server action. Everything that needs ffmpeg (music probing, capability checks) runs in the worker. One worker image serves Vercel Daemons and self-hosting.

**Tech Stack:** Next.js 16 route handlers and server actions, Drizzle + Postgres (PGlite in tests), zod, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@aws-sdk/lib-storage`, MinIO, Docker (linux/amd64), Vercel Daemons (public beta).

**Spec:** `docs/DECISIONS.md` → ADR-0070. This phase does not create the Vercel project, the bucket or the database, and does not deploy.

## Global Constraints

- `STORAGE_DRIVER`: `local` (default) | `s3`. `s3` reads `S3_ENDPOINT` (optional for AWS), `S3_REGION` (default `auto`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (booleanish, default false; true for MinIO). Missing values with `s3` fail `getEnv()` with a clear message.
- `SCRATCH_DIR` defaults to `path.join(os.tmpdir(), "nimbus")`. Each job gets `SCRATCH_DIR/<jobId>-<attempt>`, removed when the handler settles. Disk-space checks run against `SCRATCH_DIR` in the worker and are skipped in requests.
- Storage keys and `storageKeys` don't change. Existing rows keep working on both drivers.
- Signed GET URLs live 4 h; signed upload targets live 1 h. Video uploads stay capped by `MAX_UPLOAD_BYTES`, music by `MUSIC_MAX_BYTES` (50 MB).
- The web process never spawns ffmpeg, ffprobe, whisper or yt-dlp. Only modules under `features/pipeline/steps/`, `features/render/`, `features/transcription/`, `features/downloads/` and the `probe_music` handler may import `lib/process/run`.
- Files touching DB, filesystem or secrets start with `import "server-only"`. `features/*` never imports `app/` or `components/`. Pure logic is unit tested. Long work stays in the worker.
- Before using any AWS SDK or Next API, check the installed version and its docs (`node_modules/next/dist/docs/`).
- Comments only where code can't speak. Conventional Commits, no AI trailers or attribution lines. Never commit `.env*` (except `.env.example`), `data/`, models or generated media.
- Phase gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass; `pnpm test:s3` passes with MinIO up (it skips without it); `docker build -f Dockerfile.worker .` succeeds.

## Review Focus

1. **Abandoned uploads.** A browser that PUTs and never calls complete leaves `tmp/uploads/*` behind. The sweep must remove them after 24 h on both drivers (Task 4 test `sweep removes stale upload temps from S3`).
2. **A worker killed mid-render.** A retried step must not leave a half-written object at the final key, and `putFile` must not publish a partial file (Task 2 test `produceFile leaves no object when produce throws`; Task 3 contract `putFile is atomic`).
3. **Seeking after a redirect.** The `<video>` element sends `Range` to the signed URL. Bucket CORS must expose `Content-Range` and `Accept-Ranges` (Task 6 contract `signed GET honours Range`; CORS documented in Task 10).
4. **A forged or reused upload token.** Completing someone else's upload, completing twice, or completing after expiry must fail without side effects (Task 4 tests).
5. **A body bigger than declared.** The local PUT route and the signed S3 PUT must both reject bytes over the size signed into the token (Task 4 test `local PUT rejects bytes over the signed size`; Task 3 contract `upload target rejects a larger body`).

---

### Task 1: Storage contract without file paths

**Files:**
- Modify: `lib/storage/types.ts`, `lib/storage/local.ts`
- Create: `tests/contracts/storage.ts` (shared suite), `tests/contracts/storage-local.test.ts`

**Interfaces:**
- Produces, on `StorageAdapter` (replacing `resolve`):
  - `localCopy(key: string, scratchDir: string, signal?: AbortSignal): Promise<string>`: a readable local path for `key`. `LocalStorage` returns its own path without copying.
  - `putFile(file: string, key: string): Promise<{ bytes: number }>`: atomically stores `file` at `key`. `LocalStorage` renames, falling back to copy+unlink on `EXDEV`. The source is gone afterwards.
  - `readUrl(key: string, options?: { download?: string }): Promise<string | null>`: a signed GET URL, or `null` when the caller must stream.
  - `uploadTarget(key: string, options: { bytes: number; contentType: string }): Promise<UploadTarget>`
  - `export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> } | { url: null }`. `{ url: null }` means "use the app's local PUT route" (Task 4).
- `LocalStorage.path(key)` keeps the old `resolve` body, public on the class only, for the local PUT route and `LocalStorage` internals.

- [ ] **Step 1:** Write `tests/contracts/storage.ts` exporting `storageContract(name, make: () => Promise<{ storage: StorageAdapter; scratch: string; cleanup(): Promise<void> }>)` with these cases: `write then read round-trips`, `read honours a byte range`, `stat is null for a missing key`, `list returns keys under a prefix sorted`, `removePrefix removes everything under it`, `move replaces the target`, `localCopy returns a readable file with the same bytes`, `putFile stores the file and removes the source`, `putFile is atomic` (a `stat` during a 20 MB `putFile` is either null or the full size), `usage sums bytes`. `storage-local.test.ts` runs it against `LocalStorage` in a temp dir.
- [ ] **Step 2:** Run `pnpm vitest run tests/contracts/storage-local.test.ts`. Expected: fails on `localCopy` / `putFile` not being functions.
- [ ] **Step 3:** Add the four methods to the interface and to `LocalStorage`. `readUrl` returns `null`; `uploadTarget` returns `{ url: null }`. Keep `resolve` on the interface for now, so callers still compile; Task 2 removes it.
- [ ] **Step 4:** Run the contract test and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(storage): add localCopy, putFile and signed targets to the storage contract`.

### Task 2: Per-job scratch; steps stop using paths

**Files:**
- Create: `lib/storage/scratch.ts`, `lib/storage/scratch.test.ts`
- Modify: `lib/env.ts` (`SCRATCH_DIR`), `lib/storage/disk.ts`, `features/jobs/worker-loop.ts` (`JobContext.scratch`), `features/pipeline/steps/{common,probe,transcribe,analyze,select,render-clip,render-edit,download,publish-clip}.ts`, `app/api/projects/[id]/export/route.ts`, `tests/utils/test-env.ts` (sets `SCRATCH_DIR` to a temp dir and removes it), and the integration tests that call step functions directly.

**Interfaces:**
- Consumes: Task 1 `localCopy`, `putFile`.
- Produces:
  - `withScratch<T>(name: string, run: (dir: string) => Promise<T>): Promise<T>` in `lib/storage/scratch.ts`: creates `SCRATCH_DIR/<name>`, always removes it.
  - `JobContext.scratch: string`: the worker loop wraps each handler call in `withScratch(\`${job.id}-${job.attempts}\`, …)`.
  - `produceFile(scratch: string, key: string, produce: (file: string) => Promise<unknown>): Promise<void>`: writes into `scratch`, then `getStorage().putFile(file, key)`. The `projectId` parameter goes away.
  - `assertDiskSpace(directory, estimateBytes, action?)` keeps its signature; callers pass `getEnv().SCRATCH_DIR`.

- [ ] **Step 1:** Tests in `lib/storage/scratch.test.ts`: `withScratch removes the directory after success`, `withScratch removes the directory after a throw`. In `tests/integration/produce-file.test.ts`: update existing cases to the new signature and add `produceFile leaves no object when produce throws` and `produceFile leaves nothing in scratch after success`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement `withScratch`, `SCRATCH_DIR`, `JobContext.scratch` and the new `produceFile`.
- [ ] **Step 4:** Convert each step: inputs via `await storage.localCopy(key, ctx.scratch, ctx.signal)`; work files (`.ass`, `graph.txt`, `cmds.txt`, language samples, `audio.wav` while it's being made) as plain files in `ctx.scratch`; outputs via `produceFile`. `download.ts` lets yt-dlp write into `path.join(ctx.scratch, "download")` and `putFile`s the result. The `storageKeys.work` and `storageKeys.downloadDir` helpers go away if nothing uses them.
- [ ] **Step 5:** Export route: replace `zip.addFile(storage.resolve(key), …)` with `zip.addReadStream(storage.read(key), name, { compress: false, size })`, using the `bytes` from the `stat` it already does.
- [ ] **Step 6:** Remove `resolve` from `StorageAdapter` and rename it to `path` on `LocalStorage`. `pnpm typecheck` is now the check that nothing outside `lib/storage` uses paths. Run `pnpm typecheck && pnpm test`. Expected: PASS.
- [ ] **Step 7:** Commit `refactor(pipeline): work in per-job scratch directories`.

### Task 3: `S3Storage` and MinIO

**Files:**
- Create: `lib/storage/s3.ts`, `tests/contracts/storage-s3.test.ts`
- Modify: `lib/storage/index.ts`, `lib/env.ts`, `docker-compose.yml` (a `minio` service, port 9010, and a `minio-init` one-shot that creates the `nimbus` bucket and sets CORS), `package.json` (`test:s3` script, AWS SDK deps), `vitest.config.ts` (`s3` project), `.env.example`

**Interfaces:**
- Consumes: Task 1 contract.
- Produces: `class S3Storage implements StorageAdapter`, constructed with `{ client: S3Client; bucket: string }`. `getStorage()` picks the driver from `STORAGE_DRIVER`.
  - `write` streams through the existing transforms and `byteLimit` into `@aws-sdk/lib-storage` `Upload` (multipart) at a temp key, then copies to the final key and deletes the temp. Multipart only becomes visible on completion, so a straight upload to `key` is fine if `Upload` aborts on error. Decide by reading the installed `lib-storage` docs, and keep the `putFile is atomic` contract green.
  - `move`: `CopyObject` + `DeleteObject`. Above 5 GB use `UploadPartCopy` (sources can be 20 GB).
  - `localCopy` downloads to `path.join(scratchDir, "in", sha1(key) + path.extname(key))` and reuses it within the same scratch.
  - `list` / `removePrefix` page through `ListObjectsV2`; `removePrefix` batches `DeleteObjects` by 1000.
  - `usage` sums `ListObjectsV2` sizes without per-key `HeadObject`.
  - `readUrl` signs a GET for 4 h with `ResponseContentDisposition` when `download` is set.
  - `uploadTarget` signs a PUT for 1 h with `ContentLength` and `ContentType` signed; the returned headers must be sent verbatim.
- [ ] **Step 1:** `storage-s3.test.ts` runs `storageContract` against MinIO (`S3_TEST_ENDPOINT`, default `http://localhost:9010`), plus `upload target accepts a PUT of the signed size`, `upload target rejects a larger body`, `signed GET honours Range`, `move copies objects over 5 GB`, the last one skipped unless `S3_TEST_LARGE=1`. The suite skips (`describe.skipIf`) when the endpoint doesn't answer, like `test:heavy`.
- [ ] **Step 2:** `docker compose up -d minio minio-init && pnpm test:s3`. Expected: FAIL (no `S3Storage`).
- [ ] **Step 3:** Implement `S3Storage` and the env schema (a `superRefine` that requires the bucket and keys when `STORAGE_DRIVER=s3`).
- [ ] **Step 4:** `pnpm test:s3` and `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(storage): S3-compatible storage driver`.

### Task 4: Direct uploads

**Files:**
- Create: `features/uploads/token.ts` (+ `token.test.ts`), `features/uploads/actions.ts`, `features/uploads/service.ts`, `app/api/uploads/[token]/route.ts` (PUT, local driver only), `tests/integration/direct-upload.test.ts`
- Modify: `features/projects/upload.ts` (keep `magicByteCheck`, `projectSettingsFromApp`, `parseImportOptions`; drop `handleUpload`), `features/music/service.ts` (drop `handleMusicUpload`; Task 5 adds the completion), `features/pipeline/steps/sweep.ts`, `components/projects/project-uploader.tsx`, `components/music/music-upload-button.tsx`, their tests, `proxy.ts` if its matcher names the old routes
- Delete: `app/api/uploads/route.ts`, `app/api/uploads/music/route.ts`; move `tests/integration/upload-and-media.test.ts` upload cases into `direct-upload.test.ts`

**Interfaces:**
- Produces:
  - `type UploadClaim = { kind: "video" | "music"; key: string; workspaceId: string; userId: string; fileName: string; mime: string; bytes: number; options?: ImportOptions; exp: number }`
  - `signUploadToken(claim: UploadClaim): string` and `verifyUploadToken(token: string, now?: number): UploadClaim`: base64url JSON + HMAC-SHA256 with `NIMBUS_SECRET_KEY`; a bad signature or `exp < now` throws `AppError("VALIDATION", "This upload link has expired")`.
  - Server action `startUpload(input: { kind; fileName; mime; bytes; options? }): Promise<{ token: string; target: { url: string; method: "PUT"; headers: Record<string, string> } }>`. It checks the mime allow-list and size cap, then picks the key `storageKeys.uploadTemp(newId())`. When the storage target is `{ url: null }` it uses `/api/uploads/${token}`.
  - Server action `completeUpload(token: string): Promise<{ projectId: string } | { trackId: string }>`. It checks the claim's workspace against the session, `stat`s the key (missing → "The upload didn't arrive"; size ≠ claim → reject and remove), sniffs the first `MAGIC_BYTES_NEEDED` bytes through `read(key, range)`, then moves the file to the final key. For video it runs today's project create + `probe` enqueue transaction. For music it calls Task 5's `createProcessingTrack`. A second call with the same token finds no temp key and fails without side effects.
  - The PUT route verifies the token, rejects when `STORAGE_DRIVER` isn't `local`, and writes with `maxBytes: claim.bytes` plus `magicByteCheck` for video.
  - The client keeps XHR for progress: `startUpload` → `xhr.open("PUT", target.url)` with `target.headers` → `completeUpload(token)`.
- [ ] **Step 1:** Write the tests: `token.test.ts` (`round-trips a claim`, `rejects a tampered payload`, `rejects an expired claim`), and `direct-upload.test.ts` (`video upload creates a project and enqueues probe`, `completing twice fails the second time`, `completing another workspace's token is rejected`, `local PUT rejects bytes over the signed size`, `a non-video body is rejected at complete with UNSUPPORTED_MEDIA`, `sweep removes stale upload temps`, `sweep removes stale upload temps from S3` (in `storage-s3.test.ts`, skips without MinIO)). Update the uploader component tests to mock `startUpload` / `completeUpload` and assert the PUT goes to `target.url` with `target.headers`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement token, service, actions and the route; switch both components; delete the old routes.
- [ ] **Step 4:** `pnpm test` and `pnpm test:e2e` (the upload e2e runs on the local driver). Expected: PASS.
- [ ] **Step 5:** Commit `feat(uploads): upload straight to storage with signed targets`.

### Task 5: `probe_music` job

**Files:**
- Modify: `lib/db/schema.ts` (`music_tracks`: `status text not null default 'ready'` with values `processing | ready | failed`, `duration_ms` and `peaks` nullable, `error text`), new migration via `pnpm db:generate` (next free number), `features/jobs/schema.ts` (`"probe_music"`), `features/music/service.ts`, `features/music/queries.ts`, `features/pipeline/handlers.ts`, `features/music/probe-step.ts` (new, holds today's `runFfprobe` / `readPeaks` use), `components/music/*` (a processing row and a failed row with delete), the "Audio & text" track picker (only `ready` tracks are selectable), `features/clips` audio-mix validation (rejects a non-ready track)
- Test: `tests/integration/music-library.test.ts`, `tests/integration/probe-music-step.test.ts`

**Interfaces:**
- Consumes: Task 4 `completeUpload` → `createProcessingTrack(db, { id, workspaceId, userId, title, storageKey, mime, bytes }): Promise<MusicTrackSummary>`, which inserts `status: "processing"` and enqueues `probe_music` with `projectId: null` and `payload: { trackId }` (the `jobs.payload` jsonb column already exists).
- Produces: `MusicTrackSummary.status`; `durationMs: number | null`; `peaks: number[] | null`.
- [ ] **Step 1:** Tests: `probe_music sets duration and peaks and marks the track ready`, `a file without an audio stream marks the track failed with "This file has no audio"`, `a deleted track makes the job a no-op`, `saving an audioMix with a processing track is rejected`. Component test: `a processing track shows a spinner and can't be picked`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The track list refreshes while a track is processing (reuse the project page's polling or SSE pattern; don't add a new mechanism).
- [ ] **Step 4:** `pnpm test`, `pnpm test:e2e`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(music): probe uploaded tracks in the worker`.

### Task 6: Signed media URLs

**Files:**
- Modify: `lib/http/responses.ts` (`fileResponse`), `app/api/media/[...path]/route.ts`, `app/api/music/[id]/route.ts`, `app/api/avatars/[...path]/route.ts`, tests in `tests/integration/upload-and-media.test.ts`, `tests/integration/avatars.test.ts`

**Interfaces:**
- `fileResponse(request, storage, key, options)` keeps its signature. When `await storage.readUrl(key, { download })` returns a URL, it answers `302` with `Location` and `Cache-Control: private, max-age=0`. Otherwise it streams as today. Auth checks stay in the routes, before `fileResponse`.
- [ ] **Step 1:** Tests with a stub adapter whose `readUrl` returns `https://bucket.test/k?sig`: `media route redirects to the signed URL after the access check`, `media route returns 404 for another workspace without signing`, `download sets the content disposition on the signed URL`. Existing local-driver range tests stay as they are.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(media): serve files through signed URLs when storage has them`.

### Task 7: Worker heartbeat and capabilities

**Files:**
- Create: `features/jobs/heartbeat.ts`, `tests/integration/worker-heartbeat.test.ts`
- Modify: `lib/db/schema.ts` (`worker_heartbeats`: `owner text pk`, `capabilities jsonb not null`, `seen_at timestamptz not null`) + migration, `worker/index.ts` (record at start and every 60 s; delete the row on shutdown), `features/settings/queries.ts` (read the freshest row instead of calling `getFfmpegCapabilities`), the settings UI that shows encoder availability (a "No worker online" alert when there's no row newer than 3 min)

**Interfaces:**
- Produces: `recordHeartbeat(db, owner: string, capabilities: SerializedCapabilities): Promise<void>`, `latestWorker(db, now?: Date): Promise<{ owner: string; capabilities: SerializedCapabilities; seenAt: Date } | null>`, where `SerializedCapabilities` is `FfmpegCapabilities` with the sets as sorted arrays. `null` when the freshest row is older than 3 minutes.
- [ ] **Step 1:** Tests: `latestWorker returns the freshest heartbeat`, `latestWorker is null when every heartbeat is stale`, `settings encoders come from the heartbeat`, and a component test `settings shows "No worker online" without a heartbeat`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `rg "lib/process/run|getFfmpegCapabilities" app features/settings features/music/service.ts features/projects` returns nothing.
- [ ] **Step 4:** `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(worker): report heartbeat and ffmpeg capabilities through Postgres`.

### Task 8: Hosted configuration

**Files:**
- Modify: `lib/env.ts`, `features/downloads/index.ts`, `lib/db/index.ts` (pool), `features/accounts/auth.ts` (or wherever Better Auth is configured), `scripts/doctor.ts`, `.env.example`
- Test: `lib/env.test.ts` (or the existing env tests), `tests/integration/url-import.test.ts`

**Interfaces:**
- `YTDLP_COOKIES_TEXT` (optional): at worker start, if set and `YTDLP_COOKIES` isn't, write it to `SCRATCH_DIR/ytdlp-cookies.txt` with mode 0600 and use that path. `YTDLP_COOKIES_FROM_BROWSER` still wins when set (local development).
- `DATABASE_POOL_MAX` (default 10). Read the installed `@vercel/functions` docs for a Fluid pool helper (`attachDatabasePool` or similar) and use it only if it exists in the installed version; otherwise just lower the default on Vercel through the env var.
- Better Auth: when `VERCEL_URL` is set, add `https://${VERCEL_URL}` to the trusted origins so previews can sign in. `BETTER_AUTH_URL` stays the production URL.
- Doctor: report the storage driver; with `s3`, a `HeadBucket` plus a put/delete of a probe key. Report `SCRATCH_DIR` writable and free space. Skip the ffmpeg/whisper/yt-dlp checks with a "worker only" note when `NIMBUS_ROLE=web`.
- [ ] **Step 1:** Tests: `cookies text is written once and used as the cookies file`, `browser cookies win over cookies text`, `s3 driver without a bucket fails env parsing`, `VERCEL_URL is a trusted origin`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm test` and `pnpm run doctor` locally. Expected: PASS, doctor all ok.
- [ ] **Step 5:** Commit `feat(config): settings for hosted deployments`.

### Task 9: Containers and the Vercel daemon

**Files:**
- Create: `Dockerfile.worker`, `Dockerfile.web`, `.dockerignore`, `vercel.json`, `features/jobs/health.ts` (+ test)
- Modify: `worker/index.ts`, `docker-compose.yml` (profile `selfhost`: `web`, `worker`, `minio`, `minio-init`, `db`), `package.json` (`docker:worker` build script), `next.config.ts` only if `Dockerfile.web` needs `output: "standalone"`. Check in the bundled Next docs that this doesn't change the Vercel build; if it does, gate it on `NIMBUS_STANDALONE=1`.

**Interfaces:**
- `startHealthServer(port: number, isHealthy: () => boolean): http.Server`. It answers 200 on `GET /healthz` while the worker loop has polled within the last `3 × WORKER_POLL_MS + 30 s`, and 503 otherwise. Port from `WORKER_HEALTH_PORT` (default 8787); the server isn't started when the variable is `0`.
- `Dockerfile.worker`: `--platform=linux/amd64`, a Node base matching `engines` (add `engines.node` if missing; Vercel's default is 26), ffmpeg with libass and libx264 (verify with `ffmpeg -filters | grep ass` in the build), whisper.cpp built from a pinned release tag, yt-dlp pinned, the whisper model from `WHISPER_MODEL_URL` at build time into `/models`, `pnpm install --prod --frozen-lockfile`, `CMD ["pnpm", "worker"]`, `ENV NIMBUS_ROLE=worker SCRATCH_DIR=/tmp/nimbus`.
- `vercel.json`: framework `nextjs`; `buildCommand` `pnpm db:migrate && pnpm build`; `daemons.worker` with `root: "./"`, `entrypoint: "Dockerfile.worker"`, `instances: { "<region nearest the DB>": 1 }`, `resources.requests.memory: "8Gi"`, `terminationGracePeriodSeconds: 600`, `livenessProbe: { httpGet: { port: 8787, path: "/healthz" }, initialDelaySeconds: 30 }`. Check the field names against the installed CLI's `vercel.json` schema before committing.
- Worker shutdown: on SIGTERM, stop claiming jobs, let running jobs finish until `terminationGracePeriodSeconds − 30 s`, then abort them so they retry. Today's handler at `worker/index.ts:92` already stops the loop; add the deadline.
- [ ] **Step 1:** Test `health.test.ts`: `healthz is 200 while polling is fresh`, `healthz is 503 when polling stalls`. Integration: `SIGTERM lets a running job finish within the deadline` (inject the deadline).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement, write the Dockerfiles and `vercel.json`.
- [ ] **Step 4:** `docker build --platform linux/amd64 -f Dockerfile.worker -t nimbus-worker .` then `docker run --rm nimbus-worker pnpm run doctor`. Expected: ffmpeg (libass, libx264), whisper and yt-dlp ok. Then `docker compose --profile selfhost up` and upload the 30 s fixture through the UI on `STORAGE_DRIVER=s3` against MinIO until a clip renders.
- [ ] **Step 5:** Commit `build: worker and web images, compose self-host profile, Vercel daemon`.

### Task 10: Data migration, docs, phase close

**Files:**
- Create: `scripts/storage-push.ts` (+ `pnpm storage:push`)
- Modify: `docs/ARCHITECTURE.md` (web/worker/storage diagram and the "never spawns a binary on the web side" rule), `docs/DEVELOPMENT_GUIDELINES.md` (scratch and `localCopy` instead of paths), `docs/TESTING.md` (`test:s3`), `README.md` (a "Deploying" section: Vercel project + Neon from the Marketplace + R2 bucket with CORS for PUT/GET/HEAD, `Range` allowed, `Content-Range`/`Accept-Ranges`/`ETag` exposed; the env vars; previews have no worker; "Self-hosting" with the compose profile), `docs/PROGRESS.md`, `CLAUDE.md` commands table
- [ ] **Step 1:** `storage-push` copies every file under `DATA_DIR` (skipping `tmp/`) to the configured `s3` bucket, skips keys whose size already matches, and prints a summary. It is idempotent. Test it against MinIO in `storage-s3.test.ts`: `storage push copies new files and skips matching ones`.
- [ ] **Step 2:** Update the docs listed above.
- [ ] **Step 3:** Phase gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`, `pnpm test:s3` with MinIO up, the Task 9 docker build. Expected: all pass.
- [ ] **Step 4:** Tick Phase 36 in `docs/PROGRESS.md` and fill in its "Not verified" line from ADR-0070.
- [ ] **Step 5:** Commit `docs: deploying to Vercel and self-hosting`.
