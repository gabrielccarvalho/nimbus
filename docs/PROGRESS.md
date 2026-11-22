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

- [ ] Clip editor (trim, captions, style, re-render)
- [ ] Download + zip
- [ ] Golden-path e2e

### Phase 15: Settings

- [ ] Settings persisted + page
- [ ] e2e

### Phase 16: Hardening

- [ ] Investigate `TypeError: Invalid state: ReadableStream is already closed` logged by `next start` during the upload → project page → dashboard e2e. Next catches it, so nothing fails or crashes, but it's noisy. It doesn't reproduce with curl against the upload, SSE or media routes (with or without the worker), so it's likely a browser-side abort of an RSC or image request. Media now uses a pull-based `toWebStream` instead of `Readable.toWeb`, and SSE writes are guarded.

- [ ] Error/empty states, boundaries, toasts
- [ ] Disk check, temp cleanup, orphan sweeper
- [ ] Performance + bundle check
- [ ] A11y pass + manual keyboard walkthrough
- [ ] Security tests (traversal, limits, secret not in bundle)

### Phase 17: Final QA

- [ ] Clean-clone run via README
- [ ] Docs match reality, final summary
