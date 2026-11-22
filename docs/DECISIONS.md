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
Decision: whisper.cpp CLI with full JSON output for word timestamps. Consequences: model path and binary come from env; `pnpm doctor` checks them.

## ADR-0014: Three highlight selectors
Decision: Anthropic (structured tool output, model from `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`), Manual (copy prompt, paste JSON) and Heuristic (no LLM). Shared post-processing enforces the hard rules for all three. Consequences: works offline; LLM output can never bypass the rules.

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
