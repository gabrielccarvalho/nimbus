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

- [ ] Dashboard (upload, list, delete)
- [ ] Probe step (ffprobe, aspect, thumbnail, proxy)
- [ ] Project overview + PipelineStepper + SSE
- [ ] e2e

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

### Not verified

- MediaPipe face detection on a real face (fixtures have none; the code path is unit tested and the model loads in e2e).
- Real recordings longer than the 20 s fixtures, and hardware encoders other than VideoToolbox.
- Linux and Windows.
