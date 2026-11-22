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

- **B1, libass missing from ffmpeg.** The Homebrew ffmpeg 9.0.1 build has no `ass`/`subtitles` filter, so captions can't be burned in on this machine. ASS generation and filtergraph building are still fully implemented and golden-tested. Render integration tests that need burn-in skip when `pnpm run doctor` reports no libass. Fix: install an ffmpeg with libass (e.g. `brew tap homebrew-ffmpeg/ffmpeg && brew install homebrew-ffmpeg/ffmpeg/ffmpeg`, which enables libass by default, or a static build) and point `FFMPEG_PATH` at it.
- **B2, whisper.cpp missing.** No binary or model. The app runs with `TRANSCRIBER=fake`; the `@heavy` test skips. Fix: `brew install whisper-cpp` and download a model (see README), then set `WHISPER_BIN` and `WHISPER_MODEL`.

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

- [ ] Transcriber interface, WhisperCpp, Fake
- [ ] Audio extraction
- [ ] VideoPlayer
- [ ] Transcript page
- [ ] Tests (contract, normalize, heavy, e2e)

### Phase 9: Audio analysis

- [ ] silencedetect + ebur128 parsers, speech density
- [ ] Signals stored, Timeline loudness strip
- [ ] Tests

### Phase 10: Highlight selection

- [ ] Post-processing (snap, bounds, overlap, sort)
- [ ] Anthropic, Manual and Heuristic selectors
- [ ] Clips page
- [ ] Tests (MSW, heuristic, e2e)

### Phase 11: Webcam detection and layout editor

- [ ] border-heuristic (pure) + detect-webcam (client)
- [ ] CropRegionEditor
- [ ] Layout editor page + presets
- [ ] Tests

### Phase 12: Captions

- [ ] line-breaking + ASS generation + style presets
- [ ] CaptionPreview
- [ ] Tests (golden, property-style)

### Phase 13: Render engine

- [ ] filtergraph builders + golden tests
- [ ] ffmpeg runner (progress, timeout, cancel)
- [ ] Render jobs + assets
- [ ] Hardware encoder detection
- [ ] Integration tests

### Phase 14: Review, clip editor, export

- [ ] Clip editor (trim, captions, style, re-render)
- [ ] Download + zip
- [ ] Golden-path e2e

### Phase 15: Settings

- [ ] Settings persisted + page
- [ ] e2e

### Phase 16: Hardening

- [ ] Error/empty states, boundaries, toasts
- [ ] Disk check, temp cleanup, orphan sweeper
- [ ] Performance + bundle check
- [ ] A11y pass + manual keyboard walkthrough
- [ ] Security tests (traversal, limits, secret not in bundle)

### Phase 17: Final QA

- [ ] Clean-clone run via README
- [ ] Docs match reality, final summary
