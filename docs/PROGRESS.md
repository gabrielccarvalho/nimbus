# Progress

Legend: `[x]` done · `[~]` in progress · `[ ]` not started. Resume from the first non-`[x]` item.

## Recon (Phase 0, 2026-11-22)

| Item                 | Version / result                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                 | 22.22.1                                                                                                                                     |
| pnpm                 | 11.24.0                                                                                                                                     |
| Next.js              | 16.4.6 (docs in `node_modules/next/dist/docs/`)                                                                                             |
| React / React DOM    | 19.3.1                                                                                                                                      |
| Tailwind             | v4 (`@tailwindcss/postcss`), `tw-animate-css`                                                                                               |
| shadcn CLI           | 4.23.x, style `base-nova`, base color `neutral`, CSS variables, RTL on                                                                      |
| Component primitives | `@base-ui/react` 1.9 (Base UI, not Radix)                                                                                                   |
| Icons                | `@phosphor-icons/react`                                                                                                                     |
| `cn`                 | from the `cn` package, re-exported by `lib/utils.ts`                                                                                        |
| Fonts                | Nunito Sans (`--font-sans`), Oxanium (`--font-heading`), Geist Mono (`--font-mono`)                                                         |
| Theming              | `next-themes`, class strategy, `d` hotkey toggles dark mode                                                                                 |
| ESLint               | 9 flat config, `eslint-config-next` 16.4.6                                                                                                  |
| Prettier             | 3 + `prettier-plugin-tailwindcss`, no semicolons                                                                                            |
| ffmpeg / ffprobe     | 9.0.1 (Homebrew). libx264 ✅, videotoolbox ✅, `silencedetect` ✅, `ebur128` ✅, **libass ❌ (no `ass`/`subtitles` filter), no `drawtext`** |
| whisper.cpp          | **not installed** (`whisper-cli` not on PATH, no model)                                                                                     |

## Blockers

- ~~B1, libass missing from ffmpeg~~ Resolved 2026-11-22: `ffmpeg-full` 9.0.2 installed (keg-only) and set via `FFMPEG_PATH`/`FFPROBE_PATH` in `.env.local` (ADR-0028).
- ~~B2, whisper.cpp missing~~ Resolved 2026-11-22: `whisper-cpp` 1.9.5 and `models/ggml-base.en.bin` installed; the heavy test passes.
- ~~B3, no Anthropic credentials~~ Resolved 2026-11-22: `ANTHROPIC_API_KEY` set in `.env.local`.

## Phases

### Phase 0: Recon

- [x] Read configs and record versions
- [x] Check system deps
- [x] CLAUDE.md and PROGRESS.md

### Phase 1: Documentation

- [x] ARCHITECTURE.md
- [x] DEVELOPMENT_GUIDELINES.md
- [x] BUSINESS_LOGIC.md
- [x] DESIGN_SYSTEM.md
- [x] COMPONENTS.md
- [x] TESTING.md
- [x] PIPELINE.md
- [x] DECISIONS.md (ADR-0001…)
- [x] README.md

### Phase 2: Tooling and quality gates

- [x] TS strict flags (`noUncheckedIndexedAccess` etc.)
- [x] Prettier scripts, lint-staged + husky
- [x] Vitest projects (unit jsdom/node, integration), RTL, MSW
- [x] Playwright config
- [x] `scripts/make-fixtures.ts`, `scripts/doctor.ts`
- [x] `lib/env.ts` + `.env.example`
- [x] GitHub Actions CI
- [x] Trivial test per layer green

### Phase 3: Data layer and domain core

- [x] Drizzle schema + migrations + db singleton (WAL, FKs)
- [x] Repositories
- [x] Pipeline state machine + exhaustive tests
- [x] Shared zod schemas
- [x] Result / AppError

### Phase 4: Storage, upload, media

- [x] StorageAdapter (local) + contract tests
- [x] Streaming upload route
- [x] Range media route
- [x] Integration tests

### Phase 5: Job queue and worker

- [x] Queue ops (enqueue, lease, heartbeat, complete, fail/backoff, cancel, recover)
- [x] Worker loop (concurrency, shutdown, timeout)
- [x] Progress → SSE (`lib/sse.ts`)
- [x] `pnpm dev` runs Next + worker
- [x] Integration tests

### Phase 6: App shell and components

- [x] Install shadcn components
- [x] App layout (sidebar, header, breadcrumbs, theme toggle)
- [x] EmptyState, StatCard, Dropzone
- [x] `/dev/components`
- [x] Component tests + first e2e

### Phase 7: Projects flow

- [x] Dashboard (upload, list, delete)
- [x] Probe step (ffprobe, aspect, thumbnail, proxy)
- [x] Project overview + PipelineStepper + SSE
- [x] e2e

### Phase 8: Transcription

- [x] Transcriber interface, WhisperCpp, Fake
- [x] Audio extraction
- [x] VideoPlayer
- [x] Transcript page
- [x] Tests (contract, normalize, heavy, e2e)

### Phase 9: Audio analysis

- [x] silencedetect + ebur128 parsers, speech density
- [x] Signals stored, Timeline loudness strip
- [x] Tests

### Phase 10: Highlight selection

- [x] Post-processing (snap, bounds, overlap, sort)
- [x] Anthropic, Manual and Heuristic selectors
- [x] Clips page
- [x] Tests (MSW, heuristic, e2e)

### Phase 11: Webcam detection and layout editor

- [x] border-heuristic (pure) + detect-webcam (client)
- [x] CropRegionEditor
- [x] Layout editor page + presets
- [x] Tests

### Phase 12: Captions

- [x] line-breaking + ASS generation + style presets
- [x] CaptionPreview
- [x] Tests (golden, property-style)

### Phase 13: Render engine

- [x] filtergraph builders + golden tests
- [x] ffmpeg runner (progress, timeout, cancel)
- [x] Render jobs + assets
- [x] Hardware encoder detection
- [x] Integration tests

### Phase 14: Review, clip editor, export

- [x] Clip editor (trim, title/hook, caption text per page, style, re-render) at `/projects/[id]/clips/[clipId]` (ADR-0035)
- [x] Render panel on the clips page (render approved clips, horizontal edit, live progress)
- [x] Per-clip download + streamed zip export with `clips.json` (ADR-0034)
- [x] Golden-path e2e: upload → detect → confirm layout → approve → render → download → zip → edit

### Phase 15: Settings

- [x] Settings persisted (env defaults, saved values win; ADR-0036) + `/settings` page: language, selector, clip lengths and count, captions, render quality, hardware encoding
- [x] Render quality and hardware encoding applied in clip and edit renders
- [x] e2e: save, reload, validation error, axe

### Phase 16: Hardening

- [x] `ReadableStream is already closed`: reproduced with any rejected upload. Next's body adapter enqueues after cancel; uploads now drain instead of cancelling (ADR-0038, workaround until fixed upstream).
- [x] Error/empty states: global 404 and `global-error`; boundaries use `retry()` (re-fetches) instead of `reset()`; expected action errors log at debug, real failures at error.
- [x] Disk check before storing uploads (and renders); orphan sweeper job scheduled by the worker; render work files removed in `finally`.
- [x] Performance + bundle: largest client chunk is react-dom (71 KB gz); MediaPipe (43 KB gz) loads only on the layout editor; zod (30 KB gz) reaches the client through caption style schemas, acceptable for a local app.
- [x] A11y: axe on every screen in e2e (dashboard, project, transcript, layout, clips, clip editor, settings, 404); keyboard-only clip approval in e2e.
- [x] Security: media allowlist (ADR-0037), traversal and upload-limit tests, e2e asserts the configured Anthropic key and `sk-ant-` strings never appear in client chunks.

### Phase 17: Final QA

- [x] Clean-clone run via README (2026-11-22): `pnpm install --frozen-lockfile`, `.env.local` from `.env.example` plus the `ffmpeg-full` paths, `db:migrate`, `setup:vision`, `doctor` all green except the expected missing Anthropic key; lint, typecheck, 320/320 tests, heavy whisper test and 17/17 e2e pass. The README now documents `ffmpeg-full` (what was actually verified) instead of the homebrew-ffmpeg tap.
- [x] Real run through the production build with whisper.cpp `base.en`, libass and the Claude selector on speech versions of both fixtures (macOS `say` over the fixture video): transcript word-accurate, webcam found (16:9 at 66%, 21:9 at 90%, border heuristic only since the fixtures have no face), Claude picked and titled a clip, renders are 1080×1920 with audio and burned-in captions, per-clip download and zip export work. Found and fixed nested `<main>` landmarks on the way; axe now enforces landmark rules.
- [x] Docs match reality
- [x] 10-minute recording through the real pipeline (2026-11-22): upload to highlights in 30 s (whisper `base.en` + Claude), transcript page with 1,029 words loads in ~0.4 s, three clips rendered in 7 s, zip export 34 MB. The full transcript is sent to Claude (no truncation); with looped speech it returned 3 distinct moments instead of 12 duplicates.
- [x] Claude API failures fall back to the heuristic with a readable reason (bad key, rate limit, transcript too long, overloaded) instead of the raw SDK message.

### Phase 18: Shorts from any landscape recording

- [x] 4:3 and 16:10 classified; every landscape source goes through webcam detection and the layout step (ADR-0039)
- [x] `no-cam-fill` layout mode ("Fill, no webcam"): full-screen 9:16 gameplay crop with the focus slider; blur-fill now fits tall sources
- [x] "Approve all" on the clips page
- [x] Border heuristic only prefers a larger box when it encloses the best one (a static outline elsewhere used to win)
- [x] Tests: 4:3 fixture (probe, detection in Node, fill render 1080×1920), fill golden graph, decoy-outline unit test, Shorts e2e (4:3 → Fill → Approve all → render → download)
- Known issue: on the synthetic 4:3 fixture, browser detection scores the webcam border just under the 0.6 threshold (Node, same frames: 0.66), so it proposes "no webcam". Pixel data matches ffmpeg's closely; the margin is simply thin for this fixture. Real webcams usually get confirmed by face detection; worth re-checking on a real 4:3 recording.

### Phase 19: Import from a link

- [x] `downloading` status and `download` job before probe; `projects.source_url` (migration `0001_source_url`); ADR-0040
- [x] `features/downloads`: link validation, yt-dlp adapter (info, ≤1080p download, progress, readable errors), fake downloader; `doctor` check
- [x] Dashboard "Or import from a link" field; project takes the video title
- [x] Sweep clears stale `tmp/downloads`
- [x] Tests: link validation and yt-dlp parsing units, integration (import → download → highlights, private video failure and retry, live stream refusal), e2e (import from link, readable failure)
- [x] Verified by hand against YouTube with yt-dlp 2026.10.26: 10-minute video downloaded and merged to H.264/AAC MP4 with progress to 100%; removed video and playlist links fail with readable reasons in ~2 s

### Phase 20: Quick wins

- [x] Live project page: the snapshot carries a `revision` (name, source and thumbnail assets, aspect) and the page refreshes when it changes, not only on status changes. Fixes the stale title after a link import and the empty stat cards
- [x] Thumbnail early: link imports save the site's thumbnail (ffmpeg reads the URL from yt-dlp's details, ~0.6 s) before the download starts; probe keeps an existing thumbnail. Uploads show a frame captured in the browser while uploading; the project's own thumbnail comes from probe a few seconds after the upload ends (sending the browser frame to the server wasn't worth an extra endpoint). Empty thumbnails show a placeholder
- [x] Cancel button uses an X instead of the square stop icon
- [x] Renamed Auto-Clipper → Nimbus (title, sidebar, README, CLAUDE.md, architecture doc, temp dir prefixes)
- [x] Verified by hand with yt-dlp against YouTube: title set ~3 s after import, YouTube thumbnail saved and kept through probe

### Phase 21: Postgres + Docker for local development

- [x] `docker-compose.yml` with Postgres 17 (volume, healthcheck, port 5442); `pnpm dev` starts it and migrates first. Next and the worker stay on the host, because VideoToolbox and whisper's Metal acceleration don't work inside Docker on macOS
- [x] Drizzle pg schema and migrations; all repositories and their callers become async; transactions via `db.transaction`. `no-floating-promises` and `no-misused-promises` are on so a missing `await` fails lint
- [x] Job queue claims with `SELECT … FOR UPDATE SKIP LOCKED`, with a four-connection race test against real Postgres
- [x] Dropped: `LISTEN/NOTIFY` for SSE. Each event still has to read the snapshot, so it would only save one cheap query per open tab every 500 ms (ADR-0041)
- [x] Tests: PGlite (in-process Postgres) for unit and integration tests so they don't need Docker; e2e against a fresh `nimbus_e2e` database on the compose server
- [x] One-off script to copy existing SQLite projects into Postgres (`pnpm db:import-sqlite`; the GTA 6 stream came over with its 12 clips); `doctor` checks the database connection
- [x] ADR: why Postgres (concurrent workers, NOTIFY, standard tooling, path to hosting) and what it costs (Docker needed to run)

### Phase 22: Per-project settings and spoken language

- [ ] Every setting is per project: spoken language, selector, clip length range, clip count, captions and style, render quality. Global settings become "defaults for new projects"
- [ ] Upload and link import start straight away with the defaults; an "Options" section in the import form sets language and selector up front
- [ ] Project Settings tab; changing a setting offers to re-run only what it affects (language → transcribe onward, selector or clip length → find highlights, captions or quality → re-render)
- [ ] Spoken-language detection that ignores the game: detect on several windows across the recording and take the majority instead of only the first 30 s; use yt-dlp's `language` field as a hint for link imports; an explicit choice always wins
- [ ] Voice track picker: when the source has more than one audio track (common with OBS: mic on its own track), transcribe the chosen track; analysis keeps using the full mix
- [ ] Segments that don't match the spoken language (low-confidence game dialogue) are down-weighted when finding highlights

### Phase 23: Highlights that adapt to the language

- [ ] Remove the hard-coded English keyword list. Score with signals that work in any language: loudness spikes against a rolling baseline, sudden speech-rate jumps, shouting and laughter, repeated words ("vai vai vai"), exclamations, a pause before a peak
- [ ] Per-language reaction phrase lists as data files (en, pt, es to start), chosen from the transcript's language; extra phrases per project for a streamer's catchphrases
- [ ] Claude selector: tell it the spoken language, write titles and hooks in that language, and split very long transcripts (multi-hour streams) into chunks
- [ ] Tune weights against a few real streams with known good moments; keep the tuning set as a regression test

### Phase 24: Overview that changes with each step

- [ ] The worker publishes step details (stored with the job, pushed over SSE), not just a percentage
- [ ] Downloading: thumbnail, title, channel, speed, ETA, size so far
- [ ] Probing: metadata cards fill in as they're read; preview frames appear
- [ ] Transcribing: the transcript streams in live, with detected language and words per minute
- [ ] Analyzing: the loudness waveform draws as it's computed, with silences marked
- [ ] Finding highlights: candidate clips appear as they're found, with scores
- [ ] Rendering: a grid of clips, each with its own progress and poster frame
- [ ] Elapsed time and an estimate for each step

### Not verified

- MediaPipe face detection on a real face (fixtures have none; the code path is unit tested and the model loads in e2e).
- Real multi-hour recordings (10 minutes verified). Very long transcripts go to Claude in one request; past the model's context limit the project falls back to the heuristic with "the transcript is too long for one request". Chunking isn't implemented.
- Hardware encoders other than VideoToolbox.
- Linux and Windows.
