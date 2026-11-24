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

## ADR-0048: Caption font picker with locally installed fonts

Context: users want to pick the caption font independently of the preset, including Pricedown, whose Typodermic desktop EULA allows rendered video but not redistributing the font file. Decision: `font` is a caption style override over a fixed registry (`CAPTION_FONTS`); every font file lives flat in `assets/fonts` (libass doesn't scan subfolders). OFL fonts are committed; Pricedown is gitignored and installed by hand. Pages pass the installed fonts to the picker, which disables missing ones, `pnpm run doctor` warns about them, and the browser preview loads non-`next/font` families from `/api/fonts/[font]`. Consequences: a clean clone still renders with the bundled fonts; a style saved with Pricedown on a machine without the file falls back to libass's default font, which doctor flags.

## ADR-0049: Indigo and highlighter-yellow rebrand

Context: the near-black + lime palette and Oxanium/Nunito pairing read as a generic gaming-tool template, and the Projects page was a stack of default blocks. Decision: indigo ink surfaces and a highlighter yellow `primary` that only marks what the pipeline found (clip ranges, the spoken word) and primary actions; Archivo for all UI text, condensed through its `wdth` axis for headings. The Projects page lists recordings as rows with a read-only `Timeline` showing every clip's position in the VOD. Caption fonts load from `/api/fonts/[font]` so the preview no longer depends on UI fonts. Consequences: the caption highlight is now yellow and the outline indigo ink (golden ASS updated); `highlight-ink` exists for readable yellow text on light surfaces; radius drops to 8 px.

## ADR-0050: yt-dlp cookies for YouTube's bot check

Context: YouTube answers anonymous yt-dlp requests from some IPs with "Sign in to confirm you're not a bot". We reported it as rate limiting and retried, which can't succeed and keeps hitting YouTube. Decision: opt-in `YTDLP_COOKIES_FROM_BROWSER` / `YTDLP_COOKIES`, passed to every yt-dlp call; the bot check maps to `DEPENDENCY_MISSING` (no retries) with a message naming the setting, and doctor warns when neither is set. Consequences: imports run as the signed-in browser profile; reading Chrome's cookies on macOS can show a Keychain prompt the first time.

## ADR-0051: Steer highlights away from cutscenes

Context: on GTA 6 streams the selector kept picking cutscenes and story moments (the streamer commenting on a phone call, a kidnapping scene) instead of fights, chases and loud reactions. Whisper transcribes the game's dialogue, so cutscenes look like dense, dramatic speech; the prompt rewarded "a reaction, a joke, a strong opinion" without saying what to avoid. Decision: three layers. The prompt now ranks action with a loud reaction first and lists what not to pick. The transcript gives Claude two cutscene hints: game dialogue stretches (bins dominated by another language's function words) and runs of hard camera cuts, from a new ffmpeg scene-detection pass over the proxy (~10 s per hour) stored in `signals.cuts`. Post-processing multiplies every selector's score by `1 − 0.6 × game-dialogue coverage`, and the heuristic counts only the streamer's words for speech rate, excitement and repetition. Alternatives: HUD or letterbox detection (GTA 6 cutscenes have no bars, and HUDs differ per game), motion energy (needs a full decode at higher resolution, and cutscene cameras move too), or penalizing camera cuts directly (on our streams chases and mission-fail screens cut as often as some cutscenes, so cuts are only a hint). Consequences: on two reviewed GTA 6 streams, a dry run picked no cutscenes and 5 of the 10 previously approved clips; the misses were calm moments (golf, rants, the map reveal), which now rank lower by design. Game dialogue in the streamer's own language isn't detected, so those streams rely on camera cuts and the prompt. Projects analyzed before this change have no cuts until analysis runs again.

## ADR-0052: Claude watches candidate frames, and clips start on the payoff

Context: short-form retention was very low. Claude picked clips from the transcript and audio signals alone, so it couldn't see what makes GTA clips work (bugs, physics chaos, crashes); on the transcript a glitch looks like any other "what?? bro". The prompt also asked for clips to start a few seconds before the action, which is where Shorts viewers swipe away. Decision: two passes. The transcript pass over-fetches (3× the clip count, at most 40) as recall. A visual pass sends 12 frames per candidate from the proxy (with 3 s of lead-in) plus its transcript to Claude, which re-scores it by what's on screen and moves the start to the payoff; its score replaces the first pass's. A per-project niche (preset profiles, auto-detected from the title) tells both passes what hooks viewers in that game. The review model is `ANTHROPIC_REVIEW_MODEL`, defaulting to `ANTHROPIC_MODEL` (Opus). A failed review keeps the first pass, marked on each clip, rather than failing the step. Alternatives: a better transcript prompt only (still blind to glitches), sending video (not supported by the API; frames are the equivalent), a motion-energy signal (doesn't tell a glitch from a cutscene camera move), or free-text niches (no built-in tuning; may come later as extra instructions). Consequences: roughly 100–150k extra input tokens per stream on Opus; selection takes longer (6 parallel requests after the first pass). The heuristic selector doesn't get the review or payoff starts. There's no retention data yet, so the frame count, pool size and scoring rubric are untuned guesses to revisit once posted clips have numbers.

## ADR-0053: Clip effects render through sendcmd-driven scale and crop

Context: zoom and shake change a region's crop every frame, and the render has to match the browser preview, which draws `frameAt` live. `crop` only re-evaluates x/y per frame and works in whole pixels. Decision: `effectCommands` samples `frameAt` once per output frame and writes a `sendcmd` file. Each region crops its fixed layout rect, then `scale@eN` resizes that rect so the current crop lands at the destination size, and a fixed-size `crop@eN` picks the offset. Commands are only written on frames where a value changes. Focus is a full-frame webcam branch overlaid with `enable='between(t,…)'` at half-frame edges, and its crop gets the same shake commands. Spike (cam-top, 1920×1080 testsrc2 fixture, 30 fps, 30 s with zooms, shakes and two focus ranges): plain graph 3.37 s on videotoolbox and 2.42–2.54 s on libx264; this mechanism 3.35–3.40 s (1.0×) and 2.81–3.02 s (1.1–1.25×). Sampled frames land within 0.5 output px of `frameAt`, on the right frame. Alternatives: `sendcmd` driving `crop` w/h/x/y on a ×2 upscaled input matched as closely but cost 1.3–1.4× on libx264, because every frame is upscaled even when nothing moves; `zoompan` with piecewise `if(between(on,…))` expressions was 2–4+ px off during shakes and fails to parse past a few hundred segments, so a 30 s clip wouldn't render. Consequences: clips with effects use a separate graph (`features/render/effects-graph.ts`); clips without keep `verticalGraph` and its goldens. `scale` re-initialises swscale whenever its size changes, which is cheap at these sizes. `sendcmd` refuses an empty file, so it is left out when no crop ever moves. The output frame rate is applied before the split, so commands are timed to output frames.

## ADR-0054: Clip effects share one frame function

Context: Shorts that hold attention cut to the streamer's face on a reaction, punch in on the game when something weird happens and shake on a scream. Clips used one fixed layout for their whole length. Effects have to be placed automatically, fixable by hand, and look the same in the browser preview as in the render. Decision: a clip stores `effects: { events, edited } | null` with three kinds (focus, zoom, shake) at absolute source ms, and a pure `frameAt(layout, source, events, t)` returns the crop rects for any time; the canvas preview draws it and the render samples it per frame into `sendcmd` (ADR-0053). A pure planner places events at selection from loudness, speech rate and optional "beats" that the visual review marks on frames it already sees (no extra calls); beats are stored on the clip so planning again is free. Tracks stay auto until the user edits them; "Reset to auto" returns a plan without saving (`planClipEffectsAction`) so unsaved edits elsewhere in the editor survive. The Clips page became a grid of 9:16 tiles with a dialog player that previews effects before rendering. Alternatives: a full-game focus kind (the stacked layout already shows the game), effects that move captions (they stay on the final frame), ffmpeg-only previews (a render per tweak), or placing effects from Claude alone (heuristic projects would get none). Consequences: `effects = null` renders byte-for-byte as before, so existing goldens hold. A layout without a webcam keeps its focus events but ignores them. The planner constants are guesses until checked on real streams. Addendum (2026-11-23): full game was added after all, as `focus` with `target: "game"` (default `"cam"`, so stored tracks parse unchanged): the no-cam-fill crop fills the frame on webcam layouts, zoom applies inside it, the render overlays it as a second slot, and only the user places it. Each focus target in use adds a full-resolution branch for the whole clip, so a clip with both pays for two. The clip repository parses `effects` with `clipEffectsSchema` on read (unparseable values read as null), so stored focus events without `target` reach every consumer as `"cam"`.

## ADR-0055: The gameplay box is stored in `gameplayRect`

Context: the dashed gameplay box was display-only, moved sideways by a "Gameplay focus" slider in the layout step, and couldn't be changed per clip. Decision: the box is a second crop region in both editors, shape-locked to the slot it fills and stored in the existing `gameplayRect`. A rect already at the slot's shape passes through `coverCrop` unchanged, so there's no schema or render change; an edit resets `gameplayFocusX` to 0.5 so full game shows the centre of the box. The slider is removed. The editors show the stored rect when it is within 1% of the slot's shape and only derive the box from `coverCrop` otherwise, because re-deriving it from even pixels on every render made it creep. The render still cover-crops that stored rect to the slot, so the editor box and the rendered crop can differ by up to ~1% (plus even-pixel rounding). Alternatives: a free-shape box (the render would cover-crop it and silently cut what the user framed) or new offset and zoom fields (duplicating `gameplayRect`). Consequences: untouched layouts render as before, including after a mode switch: a mode switch only refits a box the user has edited (one already at its slot's shape), around its centre with the same area, and a box at full height or width stays at the largest size the new slot allows.

## ADR-0056: Nimbus reads Dia's cookies itself

Context: the bot check (ADR-0050) needs signed-in cookies, and exported cookies.txt files go stale when YouTube rotates the session. The daily browser here is Dia, which yt-dlp's `--cookies-from-browser` can't decrypt: it looks for Chrome's Keychain entry, not "Dia Safe Storage". Decision: `parseBrowserSpec` claims `dia` (optionally `dia:<profile>`); before each yt-dlp call Nimbus copies the profile's `Cookies` DB, reads the youtube.com and google.com rows with the system `sqlite3`, decrypts them with the Keychain key (PBKDF2 "saltysalt", AES-128-CBC, schema 24's 32-byte host hash stripped) and passes a 0600 temporary cookies.txt via `--cookies`, deleted when the call ends. The key is cached for the process. Any other browser name still goes to yt-dlp unchanged. Alternatives: a manual cookies.txt export (goes stale), Safari or Firefox (a second browser to keep signed in), or a yt-dlp plugin (more moving parts than one small module). Consequences: cookies are read fresh on every import, so nothing needs refreshing while Dia stays signed in. macOS asks once for Keychain access ("Always Allow"). It's macOS-only and depends on Dia keeping Chromium's cookie format; a format change shows up as the bot-check error again.

## ADR-0057: Heycamps theme, one dark mode, glass by default

Context: the redesign (Claude Design handoff) replaces the indigo-and-yellow edit-bay palette with heycamps: a single dark theme, graphite surfaces, inset-ring hairlines instead of borders, Geist, pill buttons, and five crew colours that only ever mean status. Decision: `globals.css` holds the heycamps tokens in one `:root` and points the shadcn variables at them; `<html>` always carries `dark`, so the preset's `dark:` variants still apply, and `next-themes`, the theme toggle and the `d` hotkey are removed. The generated primitives keep their structure and API and only swap classes. `Button`'s default variant is glass and the white pill is an explicit `primary`, so "one white primary per view" holds unless a screen opts in; `outline` and `secondary` are dropped. Status colour goes through `StatusPill`, `SignalDot`, `DotMeter` and `toneVariants`. Burned-in caption colours stop mirroring the UI tokens: they stay at their current OKLCH values in `features/captions/styles.ts`, and the test that compared them with `globals.css` is removed. Alternatives: keep light mode (the design has none), copy `nimbus.css` wholesale (a second styling system next to Tailwind), or map captions to the new crew colours (changes every render and the golden files for a UI change). Consequences: screens not yet rebuilt show the new tokens on their old layouts until their step of Phase 29 lands; existing caption styles render exactly as before.

## ADR-0058: App shell without the shadcn Sidebar

Context: the redesign's sidebar is a 260 px column that stacks above the page on phones, with a collapse button, a New project pill (`N`), recent projects with signal dots and, later, the workspace, usage and account menu. The project pages get a header with title, status, one-line meta, a ⋯ menu and pill tabs, and ⌘K opens a palette. Decision: a small `AppSidebar` in `components/app-shell` replaces the shadcn `Sidebar` (removed with `hooks/use-mobile.ts`). Collapsed is a 68 px icon rail on desktop, kept in the `sidebar_state` cookie as before; under 768 px the sidebar sits on top with its body behind a menu button. Project tabs are Overview, Transcript, Layout & captions (`/layout`, the old `/layout-editor` redirects) and Clips; the Settings tab moves into a sheet opened from the ⋯ menu, next to Delete, and `/projects/[id]/settings` redirects to the overview. Status in the shell comes from one mapping, `projectSignal`: amber when the project waits on the user (layout to confirm, highlights to paste), lav while running, mint when clips are ready (with the count to review), sky when rendered, pink when failed. The palette loads its index (projects and clips) from a server action each time it opens. Alternatives: restyle the shadcn Sidebar (its mobile mode is an off-canvas sheet, not the stacked column in the design, and its rail and cookie logic would be overridden almost entirely) or keep project settings as a tab (the design has no such tab). Consequences: the account menu at the bottom of the sidebar opens Settings (`,`) since step 3; Channels joins the nav with its page.

## ADR-0059: Accounts with Better Auth, one personal workspace each

Context: the redesign adds sign-in, a workspace with a plan and usage, connected channels and a per-workspace Claude key; until now Nimbus had no users and one global settings row. Decision: Better Auth (email and password, optional Google and Twitch, TOTP two-step with backup codes) on the existing Drizzle/Postgres database, with its tables in `lib/db/schema.ts`. Signing up creates a personal workspace ("<first name>'s studio"); projects get a `workspace_id`, and the first workspace ever created claims the projects and the settings row from before accounts. Workspace defaults live in the settings table under `workspace:<id>`. `proxy.ts` only checks that a session cookie exists; every page, server action and route checks the session itself (`requireViewer`, `forProject`, `assertProjectAccess`), and another workspace's project reads as not found. `/api/uploads` is left out of the proxy because a proxy buffers request bodies and truncates them past 10 MB. The Claude key is stored AES-256-GCM encrypted with `NIMBUS_SECRET_KEY`, shown only as `sk-ant-…last4`, and preferred over `ANTHROPIC_API_KEY`. Usage is a `usage_events` row per render (seconds) and per Claude run, summed per UTC month against plan numbers that aren't enforced yet. Channels are Better Auth linked accounts: YouTube is Google with the YouTube scopes, Twitch is the Twitch account, and their tokens never leave the server; TikTok and Instagram show as not configured. Password reset writes the link to the server log, since Nimbus sends no email. Alternatives: Auth.js (no built-in two-step or session listing), a hand-rolled session table (more security surface to own), or keeping one global settings row (two accounts would share defaults). Consequences: every existing route needs a session, and Playwright signs up a user in a setup project and reuses its storage state. Teams, invites, billing and limits are out of scope; the plan numbers are placeholders. Losing `NIMBUS_SECRET_KEY` makes stored Claude keys unreadable, so they'd have to be entered again.

## ADR-0060: The clip editor saves as you go

Context: the redesigned editor has no Save button; the toolbar says "Saved just now". Decision: edits autosave 600 ms after the last change through the existing `updateClipAction`, sending the whole edit each time. The toolbar shows Saved, Unsaved changes, Saving… or the error, and "Render this clip" saves any pending edit first. Previous and next follow the Clips page's best-first order and skip rejected clips. Rejected clips stay in the Clips grid, dimmed, and the filters replace the old show/hide toggle. Alternatives: keep an explicit Save (out of step with the design), or save each field on its own (more requests and partial states). Consequences: a failed save stays on screen until the next edit succeeds, and leaving the page within 600 ms of an edit drops it.

## ADR-0061: Admin plan for nimbus.dev accounts

Context: the team needs accounts without plan limits. Decision: a fourth plan, `admin`, whose limits are `null`, meaning unlimited. A workspace gets it when it's created if the owner's email ends in exactly `@nimbus.dev` (case-insensitive; subdomains and look-alikes don't count), and migration 0010 moves workspaces already owned by such accounts. The sidebar and Plan & usage show "Unlimited" instead of a meter. Usage is still recorded. Alternatives: an admin flag on the user (the plan is what limits hang off, so this is the smaller change), or an allowlist in the environment (more setup for the same result). Consequences: Nimbus doesn't verify email addresses, so anyone can sign up with a `@nimbus.dev` address and get the plan. That's harmless while limits aren't enforced, but the plan must require a verified email (or a Google sign-in on that domain) before limits are. The plan is set once; changing the account's email later doesn't change it.

## ADR-0062: Profile photos and workspace logos

Context: people want their own photo and a logo for the workspace. Decision: the browser crops the chosen image to a square and re-encodes it at 256 px (WebP, or PNG where the browser can't encode WebP), then a server action stores it under `avatars/users/<id>/` or `avatars/workspaces/<id>/` with a timestamped name and saves `/api/avatars/…` in `user.image` or the new `workspaces.image`. The server accepts PNG, JPEG or WebP by their magic bytes, up to 512 KB, and deletes the previous file. `/api/avatars` serves a photo only to its owner and a logo only to its workspace. Deleting an account removes both. Alternatives: resizing on the server (needs an image library; ffmpeg would work but is heavy for this), or storing images in the database (bloats every user query). Consequences: an image from Google sign-in stays a remote URL until someone uploads their own. When workspaces get more members, the logo check has to accept any member.

## ADR-0063: Settings live under the workspace

Context: project defaults, captions and rendering sat on one `/settings` page while the nav listed them as separate places, and the Claude key sat under the person's sign-in settings although it belongs to the workspace. Decision: Settings has two groups. Account (Profile, Connected channels, Sign-in & security) is the person's. Workspace (General with name, logo and Claude key; Plan & usage; Project defaults; Captions; Rendering) holds everything stored per workspace. Each workspace page saves the whole `AppSettings` object it loaded, so the pages don't need partial updates. `/settings` redirects to Profile. Captions gets its own page with the style, font, position and a live 9:16 preview. Consequences: two tabs open on different workspace pages can overwrite each other's unsaved-elsewhere changes; acceptable for one person per workspace, revisit with members.

## ADR-0064: Captions placed by hand

Context: the four position presets don't fit every layout, and people want to drop captions exactly where they look right. Decision: a fifth position, `custom`, stores `positionY`, the caption baseline as a fraction of the 1920 px height (0.1–0.95, rounded to 0.5%). `captionBaseline` returns it as is, so the ASS renderer and every preview agree. Dragging the caption in any preview (workspace Captions, project Layout & captions, clip editor) sets it; in the clip editor it goes into the clip's own caption style. Movement is vertical only: captions stay centred with the same side margins, which keeps line breaking and the safe area the same. Alternatives: free x/y placement (needs per-position line widths and safe-area rules), or a numeric field only (no direct manipulation). Consequences: a custom height ignores the camera position, by design.

## ADR-0065: Clips publish to YouTube from a hosted Nimbus

Context: people want to publish a rendered clip to their channel and later see how it did, which means Nimbus calls Google's APIs and, as a hosted service, serves many workspaces from one Google Cloud project. Google's current rules, read on 2026-11-24: `videos.insert` costs 1 unit in its own bucket of 100 calls a day, separate from the 10,000 units a day shared by every other endpoint (the bucket split took effect 2026-06-01, and the cost fell from about 1,600 units in late 2025; <https://developers.google.com/youtube/v3/revision_history>, <https://developers.google.com/youtube/v3/determine_quota_cost>, <https://developers.google.com/youtube/v3/getting-started>); quotas reset at midnight Pacific; videos from unverified API projects are no longer locked to private since 2026-11-02, so there is no forced `privacyStatus` or error to handle (<https://developers.google.com/youtube/v3/revision_history>, <https://developers.google.com/youtube/v3/guides/uploading_a_video>); an OAuth app in "Testing" status gets refresh tokens that expire after 7 days (<https://developers.google.com/identity/protocols/oauth2#expiration>); a Short can be up to 3 minutes (<https://support.google.com/youtube/answer/10059070>). Not confirmed: whether the 100 uploads a day bucket applies after OAuth verification and the audit, how many named test users Testing mode allows (the spec says 100), and that `invalid_grant` is what an expired Testing-mode token returns (Google's page documents it only for revoked and policy-ended sessions). Decision: Google APIs are the second outbound dependency after Anthropic. One Google Cloud project serves every workspace, so Nimbus keeps a quota ledger in two buckets (uploads against `YOUTUBE_DAILY_UPLOADS`, default 100; everything else against `YOUTUBE_DAILY_QUOTA`, default 10,000), keyed to the Pacific day, and a publish that doesn't fit waits for the reset. Nimbus refreshes Google access tokens itself from the stored refresh token and treats `invalid_grant` as "needs reconnect". Calls to YouTube use `fetch` with the resumable upload protocol. Alternatives: the `googleapis` package (a large dependency for four endpoints, and it hides the upload offset we need to resume from), per-workspace Google Cloud projects (each user would have to create one), or no ledger and relying on Google's 403 (a burst of publishes would fail instead of queueing). Consequences: public launch needs Google's OAuth verification and the YouTube API audit, tracked as blocker B4; until then Testing mode makes channels drop off every 7 days; the ARCHITECTURE line on outbound calls changes; and the two-bucket ledger replaces the single-pool design the plan started with.
