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
| Fonts                | Geist and Geist Mono from the `geist` package (since Phase 29; was Archivo)                                                                 |
| Theming              | One dark heycamps theme, `dark` always on `<html>` (since Phase 29; was `next-themes`)                                                      |
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

- [x] Every setting is per project: spoken language, voice track, selector, clip length range, clip count, captions and style, render quality. Global settings are "defaults for new projects"; hardware encoding stays global (it's a property of the machine). A migration fills the new fields on existing projects
- [x] Upload and link import start straight away with the defaults; "Import options" on the home page sets language and selector up front (an `x-import-options` header for uploads, a second action argument for links)
- [x] Project Settings tab; changing a setting offers to re-run only what it affects (language or voice track → transcribe onward, selector or clip length → find highlights, captions or quality → re-render rendered clips). Re-runs keep approved and rendered clips
- [x] Spoken-language detection that ignores the game: 7 windows of 30 s across the recording, probability-weighted majority; yt-dlp's `language` field is used first for link imports; an explicit choice always wins. Checked on the 3 h GTA 6 stream: 2 of 5 windows said English (game dialogue), 3 said Portuguese, Portuguese won, ~0.7 s per window. whisper-cli's `-dl` ignores `-ot`, so each window is cut to its own file first
- [x] Default model is now multilingual (`ggml-large-v3-turbo-q5_0.bin`); English-only models can't detect or transcribe other languages, and `doctor` and Settings warn about them
- [x] Voice track picker: probe records every audio track; when there's more than one, the project settings offer a picker and transcription uses that track; analysis keeps using the full mix
- [x] Moved to Phase 23: down-weighting low-confidence segments is scoring, which Phase 23 rewrites

### Phase 23: Highlights that adapt to the language

- [x] Segments that don't match the spoken language (low-confidence game dialogue) are down-weighted: window score × (0.4 + 0.6 × mean word confidence); Claude sees them marked `(unclear)`
- [x] Hard-coded English keywords removed. Signals that work in any language, each against the surrounding 2 minutes: loudness spike, speech-rate jump, laughter and exclamations, repeated words, a pause before the peak
- [x] Reaction phrase lists as data (`features/highlights/phrases/{en,pt,es}.json`), picked by the transcript's language, plus per-project catchphrases (Settings → Highlights). Phrases count only above 1.5× the streamer's own rate, so verbal tics ("mano") don't dominate
- [x] Claude selector: told the spoken language, writes titles and hooks in it, and long transcripts are split into overlapping parts sent in parallel
- [~] Tuning: checked against the Portuguese transcript of the 3 h GTA 6 stream (top picks: "Corre, corre, corre…", "Meu Deus do céu… Não é possível", "Caralho, irmão, se você bater no meu carro de novo…"; the old scorer's 12-minute cluster around one sub-thanks segment is gone). The regression tests are synthetic (`heuristic.test.ts`); a real tuning set needs streams with known good moments, and the stream content isn't committed
- [x] Rejected clips leave the clip list, with Undo in the toast and a "Show rejected" toggle
- [x] "Find more highlights" adds candidates that don't overlap any existing clip, rejected ones included, without replacing anything

### Phase 24: Overview that changes with each step

- [x] The worker publishes step details (`jobs.detail`, validated by `stepDetailSchema`, pushed in the SSE snapshot for running jobs), not just a percentage
- [x] Downloading: size so far, speed and time left from yt-dlp; title and thumbnail were already there. Channel isn't shown (not stored)
- [~] Probing: the metadata cards fill in when probe saves the source (existing revision refresh). Preview frames: not done, probe takes under a second on local files
- [x] Transcribing: phase (extracting, detecting language, transcribing), language and how it was chosen, word count, words per minute, position, and the latest words as whisper prints them. Checked with real whisper on an 11-minute video
- [x] Analyzing: the loudness waveform and silences draw as ffmpeg reads the audio; the part not read yet is greyed out
- [x] Finding highlights: candidates with scores appear as Claude's parts come back (the built-in selector finishes at once)
- [x] Rendering: a grid of the clips being rendered, each with its own progress and a poster frame from the proxy
- [x] Elapsed time and an estimate for the running step

### Phase 25: Highlights that hook (ADR-0052)

- [x] Per-project niche (GTA, open world, horror, shooter, racing, general, auto from the title), in Settings → Highlights; changing it offers to re-run selection
- [x] Both Claude prompts list what hooks viewers in the niche; bugs and glitches rank first; clips start on the payoff
- [x] Visual review: the transcript pass over-fetches, Claude re-scores each candidate from 12 proxy frames and moves its start to the payoff; `ANTHROPIC_REVIEW_MODEL` overrides the model
- [ ] Check on a real GTA stream: compare picks with and without the review, and the token cost
- [ ] Tune frame count, pool size and the rubric once posted clips have retention numbers

### Phase 26: Clip effects and clips grid (ADR-0053, ADR-0054)

- [x] Effects per clip (focus, zoom, shake) at absolute source ms, `null` renders as before; pure `frameAt` shared by the canvas preview and the render
- [x] Planner places effects at selection (Claude, heuristic and pasted clips) from loudness, speech rate and review beats; `autoEffects` project setting (default on)
- [x] Visual review marks reaction and weird beats, stored on the clip so planning again doesn't call Claude
- [x] Render burns effects through `sendcmd`-driven scale and crop; clips without effects keep the plain graph and its goldens
- [x] Editor effects lane: add at playhead, drag, resize, delete, zoom scale and focus point, shake intensity; Tab from a selected block reaches its controls; "Reset to auto" plans locally (`planClipEffectsAction`, not saved until Save)
- [x] Clips page: grid of 9:16 tiles (rendered tiles play on hover), a dialog player per clip with Approve/Reject, Previous/Next and ←/→, Edit and Download; the source timeline opens a clip
- [x] e2e: grid → dialog → Approve, reject/show rejected, add a zoom in the editor and keep it after reload
- [x] Final review fixes: confirming the layout re-plans un-edited tracks (selection only had the probe placeholder); weird-beat focus mapped through the zoomed gameplay crop; a trim re-plans with the layout being saved and never creates a track over null
- [x] Hand check on the 16:9 e2e fixture, by a Playwright script rather than by eye in a browser: tiles render and a rendered tile plays on hover; the dialog plays the clip and its canvas is non-blank and changing (looping at the clip's end wasn't watched); a zoom added on the lane shows in the editor preview; the rendered MP4 (1080×1920, decodes cleanly) shows the same zoom framing as the preview at the same time
- [x] Full game effect: `focus` has a `target` (cam or game); full game shows the gameplay cover-cropped over the whole frame in the preview and the render, with its own lane row; stored tracks without a target read as cam
- [ ] Hand check by eye on a real project with `pnpm dev`
- [ ] Check auto effects on a real GTA stream and tune `PLANNER` constants

### Phase 27: Editable gameplay box (ADR-0055)

- [x] `CropRegion` supports several regions per editor, with its own controlled value and an aspect-locked resize
- [x] Geometry: slot aspect per mode, the effective gameplay box, fitting a rect to an aspect, refitting on a mode switch
- [x] Gameplay box draggable and resizable in the clip editor (clip layout override) and the layout step; "Gameplay focus" slider removed
- [x] e2e: drag the gameplay box in the clip editor, save, and keep it after reload
- [x] Review fixes: a mode switch leaves untouched layouts' crops alone; changing a clip's layout re-plans its auto effects; read-only crop regions are inert
- [ ] Hand check the gameplay box by eye on a real stream

### Phase 28: YouTube cookies from Dia (ADR-0056)

- [x] `YTDLP_COOKIES_FROM_BROWSER=dia[:profile]`: Nimbus decrypts Dia's YouTube/Google cookies (Keychain key, Chromium v10 format) into a temporary cookies.txt for each yt-dlp call and deletes it afterwards; other browsers still go to yt-dlp; doctor checks the profile's cookie DB
- [x] Unit tests: spec parsing, key derivation and decryption (schema 23 and 24), Chromium timestamps, Netscape output
- [x] Verified by hand: a real YouTube import that had failed the bot check downloads with `dia`

### Phase 29: Redesign and accounts (ADR-0057)

Spec: Claude Design handoff (`~/Downloads/nimbus-redesign-handoff/design/`). Auth: Better Auth. Sidebar links without a designed screen (Clip library, Exports, Caption styles) are left out; Channels goes to `/settings/channels`.

- [x] 1. Heycamps tokens, Geist, one dark theme; Button, Badge, Tabs, Input, Select, Switch, Dialog, Sheet, DropdownMenu, Popover, Tooltip, Kbd and Command restyled; StatusPill, SignalDot, DotMeter
- [ ] 2. App shell: Sidebar (workspace, nav, recent, usage, account menu) and ProjectHeader (breadcrumb, ⌘K, tabs); command palette
- [ ] 3. Better Auth (Google, Twitch, email/password, 2FA, sessions), `/login` and `/signup`, protected routes, user and workspace models, projects scoped to the workspace, Playwright login fixture
- [ ] 4. Projects home (one import card with overrides, needs-you banner, filtered grid), then Overview (one-line meta, paused-pipeline action card, stepper)
- [ ] 5. Layout & captions at `/projects/[id]/layout` with the live 9:16 preview
- [ ] 6. Clips review (export bar, filters, keyboard), then the clip editor (autosave)
- [ ] 7. Transcript (search, follow playback, grouped by clip, make a clip)
- [ ] 8. Settings (profile, plan and usage, channels, security, defaults, rendering); project settings move to a sheet in ProjectHeader's menu

### Not verified

- MediaPipe face detection on a real face (fixtures have none; the code path is unit tested and the model loads in e2e).
- Real multi-hour recordings end to end (a 3 h stream was transcribed and scored; rendering from it wasn't). Claude's chunking of long transcripts is tested against a mocked API only.
- Hardware encoders other than VideoToolbox.
- Linux and Windows.
