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
