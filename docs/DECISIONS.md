# Architecture decision records

Format: context → decision → consequences. Append new ADRs; supersede, don't edit, old ones.

## ADR-0001: Next.js App Router, installed version (16.4)

Context: the project was scaffolded with Next 16.4.6. Decision: App Router, Server Components by default, `"use client"` only at leaves. Consequences: APIs follow the bundled docs in `node_modules/next/dist/docs/`, not older habits.

## ADR-0002: TypeScript strict + noUncheckedIndexedAccess

Context: lots of array indexing over words, samples and segments. Decision: `strict`, `noUncheckedIndexedAccess`, no `any`, `unknown` + zod at boundaries. Consequences: some extra narrowing in hot loops, fewer runtime surprises.

## ADR-0003: shadcn/ui on the existing preset (base-nova, Base UI)

Context: the preset uses Base UI (`@base-ui/react`), not Radix. Decision: the shadcn-first rule; custom primitives build on Base UI and use its `render` prop where Radix would use `asChild`. Consequences: Radix-only snippets from the web don't apply directly.

## ADR-0004: Phosphor icons

Context: `components.json` sets `iconLibrary: phosphor`. Decision: use `@phosphor-icons/react` everywhere. Consequences: generated components already match.

## ADR-0005: zod for every boundary

Decision: shared schemas for forms, actions, API, env, settings and LLM output. Consequences: one source of truth for types via `z.infer`.

## ADR-0006: react-hook-form + zod resolver for forms

Decision: settings and clip editing forms use react-hook-form with `@hookform/resolvers/zod` and the shadcn field components. Consequences: forms submit to Server Actions that re-validate.

## ADR-0007: SQLite + better-sqlite3 + Drizzle

Context: local-first, zero infra. Decision: SQLite file in `DATA_DIR`, WAL mode, foreign keys on, drizzle-kit migrations, repositories per feature. Consequences: synchronous driver (fast, simple). Postgres later means a new schema dialect and repositories, callers unchanged.

## ADR-0008: Local disk storage behind StorageAdapter

Decision: files under `DATA_DIR` (default `./data`, gitignored), addressed by keys. Consequences: an S3 adapter can implement the same interface and contract tests.

## ADR-0009: DB-backed job queue

Context: no Redis wanted. Decision: `jobs` table with atomic leasing (`UPDATE … RETURNING`), heartbeats, exponential backoff, lease recovery. Consequences: throughput is limited by SQLite writes, which is far beyond what video jobs need.

## ADR-0010: Separate worker process via tsx

Decision: `worker/index.ts` run with tsx; `pnpm dev` runs Next and the worker with concurrently. Consequences: Next requests stay fast and independent of ffmpeg; two processes share SQLite (WAL handles it).

## ADR-0011: SSE for progress, polling fallback

Decision: `/api/projects/[id]/events` polls the DB inside the request and pushes changes as SSE. Consequences: no cross-process pub/sub needed; latency ≈ 500 ms.

## ADR-0012: System ffmpeg via spawn, no fluent-ffmpeg

Decision: pure argument/filtergraph builders plus a thin runner. Consequences: everything is golden-testable as strings; the runner owns timeouts and cancellation.

## ADR-0013: Transcriber interface; whisper.cpp default, fake for tests

Decision: whisper.cpp CLI with full JSON output for word timestamps. Consequences: model path and binary come from env; `pnpm run doctor` checks them.

## ADR-0014: Three highlight selectors

Decision: Anthropic (structured tool output, model from `ANTHROPIC_MODEL`, default `claude-opus-5-5`), Manual (copy prompt, paste JSON) and Heuristic (no LLM). Shared post-processing enforces the hard rules for all three. Consequences: works offline; LLM output can never bypass the rules.

## ADR-0015: Cache Components off; per-request reads via `connection()`

Context: Next 16 offers `cacheComponents`. This is a single-user local app whose data changes constantly from a second process. Decision: leave it off; query functions call `await connection()` so pages render per request; actions call `revalidatePath`. Consequences: no stale data, no cache invalidation across processes.

## ADR-0016: `server-only` and the worker

Context: `server-only` throws unless resolved under the `react-server` condition. Decision: run the worker with `tsx --conditions=react-server`, alias it to an empty module in Vitest. Consequences: the same server modules work in Next, the worker and tests.

## ADR-0017: Webcam detection in the browser

Decision: MediaPipe Tasks Vision face detector (WASM) on sampled proxy frames plus a pure border heuristic, confirmed by the user. Optional Claude vision check behind a setting. Consequences: no server GPU or Python; detection is testable through the pure heuristic.

## ADR-0018: ASS subtitles burned with libass

Decision: generate ASS with word-level highlight and burn with the `ass` filter. Consequences: requires an ffmpeg with libass (not present on the dev machine at bootstrap; see PROGRESS Blockers).

## ADR-0019: Horizontal edit via trim/atrim + concat

Context: `select`/`aselect` drops whole audio frames and drifts across many cuts. Decision: one trim/atrim pair per kept range plus `concat`, graph passed via `-/filter_complex <file>`. Consequences: sample-accurate cuts; large graphs live in a file, not argv.

## ADR-0020: pino logging

Decision: structured pino, pretty in dev, silent in tests. Consequences: logs carry `projectId`/`jobId` context.

## ADR-0021: Testing stack

Decision: Vitest (unit, component, integration, contract), RTL, MSW, Playwright + axe. Fixtures generated with ffmpeg lavfi. Consequences: no binary fixtures in git; tests need ffmpeg.

## ADR-0022: Quality tooling

Decision: existing ESLint + Prettier (tailwind plugin), husky + lint-staged pre-commit, GitHub Actions CI. Consequences: CI installs ffmpeg via apt.

## ADR-0023: Work on a feature branch

Context: the repo had only `master`. Decision: build on `build/auto-clipper`, commit per task group. Consequences: `master` stays at the initial scaffold until the user merges.

## ADR-0024: `pnpm run doctor`, not `pnpm doctor`

Context: pnpm 11 ships a built-in `pnpm doctor` that shadows the package script. Decision: keep the script name `doctor` and always invoke it as `pnpm run doctor`. Consequences: docs and CI use `pnpm run doctor`.

## ADR-0025: E2E against a production build on port 3217

Context: port 3100 was taken locally; dev-mode compilation makes e2e timing flaky. Decision: Playwright builds and starts Next on `E2E_PORT` (default 3217) and starts the worker as a second webServer, both with a fresh temp `DATA_DIR` per run. Consequences: e2e runs take a build (~30 s) but behave like production.

## ADR-0026: Structured outputs, not forced tool use, for Claude selection

Context: current Claude models reject forced `tool_choice` (`any`/`tool`) with a 400, and `messages.parse()` throws on an unparseable reply before `stop_reason` can be checked. Decision: call `beta.messages.create` with `output_config.format = betaZodOutputFormat(schema)`, check `stop_reason` first (refusal → heuristic fallback, `max_tokens` → repair turn), then validate with the format's own `parse()`. Default model `claude-opus-5-5` at effort `high`, with `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) so a classifier refusal is retried on another model server-side. Consequences: one code path for validation; the heuristic always produces a result.

## ADR-0027: Worker and scripts load env files like Next

Context: Next loads `.env*` files, but the worker (`tsx worker/index.ts`) and `pnpm run doctor` didn't, so `.env.local` settings such as `FFMPEG_PATH` or `ANTHROPIC_API_KEY` reached the web app but not the process that uses them. Decision: `lib/load-env.ts` calls `@next/env`'s `loadEnvConfig` (pinned to the installed Next version) as the first import of every Node entrypoint. Consequences: identical precedence in web and worker; variables already set in the process (e.g. by Playwright) still win.

## ADR-0028: ffmpeg-full for libass

Context: Homebrew's `ffmpeg` has no libass, so captions can't be burned in (Blocker B1). Decision: use the keg-only `ffmpeg-full` formula via `FFMPEG_PATH`/`FFPROBE_PATH` in `.env.local`; the system `ffmpeg` is untouched. Consequences: `pnpm run doctor` fails the libass check if the paths are missing, and the README documents the setup.

## ADR-0029: Blocking metadata

Context: Next 16 streams `generateMetadata` output into `<body>` after the first paint, so dynamic pages briefly have no `<title>` (caught by axe as an intermittent `document-title` violation). Screen readers announce the title on load. Decision: `htmlLimitedBots: /.*/` makes metadata blocking for every request. Consequences: slightly later first byte; irrelevant here because metadata is a local SQLite read.

## ADR-0030: Vision assets served locally

Context: MediaPipe loads its WASM and model at runtime; the default is a CDN. Decision: `pnpm run setup:vision` copies the WASM from the pinned `@mediapipe/tasks-vision` package and downloads `blaze_face_short_range.tflite` once into `public/vendor/mediapipe` (gitignored). Consequences: detection works offline after setup and always matches the installed package version; e2e runs the setup before building.

## ADR-0031: Bundled caption fonts

Context: libass falls back to whatever system font matches, so captions would look different per machine, and the app fonts come from `next/font` at build time, which ffmpeg can't use. Decision: commit static ExtraBold TTFs of the two design-system families (Oxanium, Nunito Sans; SIL OFL, licenses in `assets/fonts/licenses`) and pass `fontsdir`. The preview uses the same families via the `--font-heading`/`--font-sans` variables. Consequences: deterministic renders from a clean clone; ~135 KB in the repo.

## ADR-0032: libx264 by default, hardware encoding opt-in

Context: VideoToolbox/NVENC/QSV are much faster but their quality-per-bit and rate-control knobs differ per vendor, and CRF output is predictable and identical across machines. Decision: `VIDEO_ENCODER=libx264` by default; `auto` or an explicit encoder name opts in. Capabilities are detected from `ffmpeg -encoders` and shown by `pnpm run doctor`. Consequences: consistent output by default; a 30 s 1080×1920 clip still renders in a few seconds with `veryfast`.

## ADR-0033: Tests load `.env.test.local`, never `.env.local`

Context: integration tests need machine-specific binaries (e.g. an ffmpeg with libass) but must never pick up personal settings like `ANTHROPIC_API_KEY` from `.env.local`. Decision: the integration setup imports `lib/load-env`, and because Vitest runs with `NODE_ENV=test`, `@next/env` loads `.env.test.local`/`.env.test` only. Consequences: put `FFMPEG_PATH`/`FFPROBE_PATH` in `.env.test.local` (gitignored); caption burn-in tests are skipped when the configured ffmpeg has no libass.

## ADR-0034: Streamed, uncompressed zip export

Context: rendered clips are already H.264/AAC, so deflate saves almost nothing and costs CPU, and a zip of several clips can be hundreds of MB. Decision: `GET /api/projects/[id]/export` streams a zip built with `yazl` in STORE mode straight from storage, names files `NN-<title-slug>.mp4` plus `edit-horizontal.mp4`, and adds a `clips.json` manifest (title, hook, range, `editedSinceRender`). Renders missing on disk are left out instead of failing the download. Consequences: constant memory, no temp files; a clip edited after rendering still exports its last render, and the manifest flags it.

## ADR-0035: Editing a rendered clip marks it out of date

Context: trims, text and caption edits change the output, but throwing away a good render on every save would be surprising. Decision: saving an edit moves a `rendered` clip back to `approved` and keeps `renderAssetId`; the UI shows "Out of date" and offers "Save and render". Changing the trim clears per-page caption overrides because page indices no longer line up. Consequences: downloads stay available while editing; "Render approved clips" picks up edited clips again.

## ADR-0036: Env sets defaults, Settings override

Context: some options (selector, transcription language, hardware encoding) were env-only, which means editing a file and restarting to change them. Decision: one `settings` row holds app settings; `getAppSettings` fills anything unsaved from env (`HIGHLIGHT_SELECTOR`, `WHISPER_LANGUAGE`, `VIDEO_ENCODER !== "libx264"`). Highlight and caption options are copied into each new project; language, render quality (CRF 26/20/17) and hardware encoding are read when a job runs. `VIDEO_ENCODER` still chooses which hardware encoder "on" means. The unimplemented "verify layout with Claude" flag was dropped from the schema. Consequences: no restart needed; existing projects keep their own highlight and caption settings.

## ADR-0037: Media route serves an allowlist, not all of `DATA_DIR`

Context: the media route served any key that resolved inside `DATA_DIR`, which included `app.db`, partial uploads and render work files. Decision: `isServableKey` allows only `projects/<id>/<file>` and `projects/<id>/renders/<file>` with video, audio or JPEG extensions; anything else is a 404 before storage is touched. Traversal protection in `LocalStorage.resolve` stays as a second layer. Consequences: new servable asset types must be added to the allowlist.

## ADR-0038: Drain rejected upload bodies instead of cancelling them (workaround)

Context: Next 16.4's request body adapter (`requestToBodyStream`) keeps calling `controller.enqueue` after the body is cancelled, which surfaced as an `uncaughtException: Invalid state: ReadableStream is already closed` whenever an upload was rejected mid-stream (wrong magic bytes, over the limit). Decision: uploads read the body through `readableFromRequestBody`, which drains and discards the rest of a rejected body rather than cancelling it. This is a workaround; the proper fix is upstream in Next (guarding enqueue after cancel), after which `Readable.fromWeb` can return. Consequences: a rejected upload keeps reading until the client stops sending; the client sees the error once its request completes or it aborts.

## ADR-0039: Every landscape source goes through layout; a fill mode for Shorts

Context: the app is used to turn 16:9, 4:3 and 21:9 recordings into YouTube Shorts in volume. 4:3 was classified `other`, which forced blur-fill and skipped webcam detection, and there was no full-screen option for recordings without a webcam. Blur-fill also assumed the source was wider than 9:16. Decision: classify `4:3` and `16:10` too; route any source with `w ≥ 1.2 h` through `awaiting_layout`; add `no-cam-fill` (a 9:16 gameplay crop steered by the focus slider); fit the blur-fill foreground inside the frame. Add "Approve all" for bulk review. Layout presets per resolution remain the way to skip the layout step for repeat setups. Consequences: one more layout mode in the renderer, preview and caption baselines, all through `planLayout`.

## ADR-0040: Import from a link with yt-dlp as a pipeline step

Context: creators want to make Shorts from videos already on YouTube without finding the original file. Decision: a `download` job and `downloading` status ahead of `probe`, behind a `Downloader` port with a yt-dlp adapter and a fake for tests (same pattern as the transcriber). The link is stored on the project (`projects.source_url`) so retry needs no payload. yt-dlp is optional: `doctor` warns when it's missing and uploads are unaffected. Alternatives: downloading inside the request (blocks it for minutes), or a JS YouTube library (breaks whenever YouTube changes; yt-dlp is maintained against those changes and covers Twitch and other sites too). Consequences: one more status and migration; YouTube's terms limit downloading, so the UI tells users to import only videos they own or have rights to.

## ADR-0041: Postgres in Docker instead of SQLite

Context: the app is moving from a single-user tool towards something more standard to run and eventually host. SQLite serialised writers, so the worker and Next contended on one file lock, and a second worker process wasn't practical. Decision: Postgres 17 via Docker Compose (only the database; Next and the worker stay on the host for VideoToolbox and whisper's Metal acceleration). The queue leases with `FOR UPDATE SKIP LOCKED`. Unit and integration tests use PGlite so they run without Docker; one race test and the e2e suite use the compose server. Existing SQLite data is copied once with `pnpm db:import-sqlite`. `LISTEN/NOTIFY` for SSE was considered and dropped: the stream still has to read the snapshot on each change, and one indexed query per open tab every 500 ms is negligible. Consequences: Docker is needed to run the app; every repository is async, and code inside `withTransaction` must use the transaction handle; `DATA_DIR` is now created by the storage layer, since the database no longer lives in it.

## ADR-0042: Per-project settings and spoken-language detection

Context: one global settings row meant changing a language or clip length for one stream changed it for every later one, and whisper's language detection only listened to the first 30 s, which on a stream is often game audio. A Portuguese streamer playing an English game was transcribed as English. Decision: every pipeline setting lives on the project (language, voice track, selector, clip lengths, count, captions, render quality); global settings are defaults copied into new projects, and imports can override language and selector. Hardware encoding stays global because it depends on the machine. Changing a setting offers to re-run the earliest affected step; the state machine allows idle projects back into `transcribing` or `selecting`, and candidate replacement keeps approved and rendered clips. Language is the explicit setting, else the video page's language (yt-dlp), else a probability-weighted vote over 7 windows of 30 s across the recording. The default whisper model becomes the multilingual `large-v3-turbo-q5_0`. Alternatives: whisper's own detection (first 30 s only), or detecting per segment and transcribing each in its own language (much slower and splits the transcript). Consequences: ~5 s of detection per transcription; English-only models can't serve non-English streams, and `doctor` warns about them.

## ADR-0043: Language-independent highlight scoring

Context: the heuristic counted a fixed list of English words and scored loudness and speech density against the whole video, so a Portuguese stream got no keyword credit and a loud game section outranked a real reaction elsewhere. Decision: score every signal against the surrounding two minutes (loudness spike, speech-rate jump, laughter and exclamations, repeated words, pause before the peak, question and answer), add reaction phrases from per-language data files plus per-project catchphrases, and count phrases and exclamations only above 1.5× the streamer's own rate so verbal tics don't count. Low word confidence scales the score down, which mostly catches game dialogue in another language. The Claude selector is told the language and splits multi-hour transcripts into overlapping parts sent in parallel. Alternatives: translating the English list (still misses slang and tics), or asking Claude for every stream (needs a key and costs per stream). Consequences: weights are set by hand and checked on one real stream; they should be revisited once there are streams with known good moments.

## ADR-0044: Step details on the job row

Context: the overview only showed a percentage, so a long transcription or download looked frozen. Decision: each step reports a small typed detail object, stored in `jobs.detail` and sent in the existing polled SSE snapshot, rather than a separate event channel or table. The worker writes it with the heartbeat (at most every 500 ms), so detail updates cost no extra writes, and flushes it before completing. Payloads are capped (transcript tail ~400 characters, 240 waveform points, 300 silences, 30 candidates) because every open tab polls the snapshot twice a second. Alternatives: LISTEN/NOTIFY or an append-only events table (finer grained, but more moving parts for one local user), or reading partial outputs from disk in the request (couples the web app to each tool's files). Consequences: a step that finishes in under 500 ms may never show its detail, which is fine because its result appears right after.

## ADR-0045: Stall timeouts instead of fixed job timeouts

Context: each job type had a fixed wall-clock limit (probe 10 min). A 7-hour upload failed three times in probe because transcoding the preview proxy takes longer than that, even though ffmpeg was progressing. Separately, expired leases were only recovered when a worker started, so a job orphaned by a worker that died after another had started stayed "running" forever. Decision: a job fails when it reports no progress for a per-type limit (10–30 min), with a 24 h cap on total run time; lease recovery runs every lease interval. Alternatives: scaling fixed limits by media duration (needs the duration before probe has read it, and still guesses machine speed). Consequences: a step that does long work without reporting progress must report it, or it will be stopped.

## ADR-0046: Caption only the streamer's language, and clear captions in pauses

Context: on Portuguese streams of GTA 6, the burned-in captions included the game's English dialogue, and whisper hallucination loops (the same line every second for minutes; 922 of 2381 segments on one stream). Whisper also stretched words across the pause after them (up to 7 s), so captions stayed on screen through silences. Decision: filter at caption time, not in the stored transcript, so existing transcripts benefit without re-transcribing hours of audio. A segment is dropped when more of its words are function words exclusive to another language (pt, en, es, fr, de, it lists) than function words of the transcript's language; languages without a list are not filtered. Repeats of a line said 3+ times in a row are dropped, keeping the first. Each word's visible time is capped by its length, and page gaps and hold are shorter. Alternatives: whisper language detection per segment (minutes of extra work per stream), a language-ID package (couldn't be added here, and models trained on long text are weak on 2–5 word lines), or speaker diarization (the real fix for game dialogue in the streamer's own language, but a heavy Python dependency). Consequences: dubbed game dialogue in the streamer's language is still captioned; short English interjections from the streamer are dropped; per-clip caption page edits are indexed by page, so clips edited before this change may need their caption text checked.

## ADR-0047: YouTube replay heatmap as a highlight signal

Context: imports from YouTube come with "Most replayed" data, which yt-dlp already returns in the details the download step fetches. Decision: store it on the project (`audience_heatmap`, `null` = not fetched yet, `[]` = the video has none) and use it as a 0.2-weight signal in the heuristic and as a hint in the Claude prompt, never as a filter. It is scored on its own 0–1 scale above the median rather than rescaled like the other signals, and the weighted sum is normalized so projects without it score as before. Older imports get it the next time highlights are selected; if the site refuses (bot checks, rate limits), selection continues without it and tries again next time. The review timeline shows it as a band along the top. Alternatives: the YouTube Data API (doesn't expose the heatmap and needs a key), or using the heatmap to pick clips directly (buckets are 1% of the video, minutes long on a stream, and replays don't always mean a good Short). Consequences: only popular YouTube videos have it; a fresh upload or a Twitch VOD won't, so it's a bonus rather than something the selector relies on. The 0.2 weight hasn't been tuned on real heatmaps yet.
