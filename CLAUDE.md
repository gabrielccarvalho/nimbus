@AGENTS.md

# Auto-Clipper (repo: nimbus)

Local-first web app: upload a long 16:9 / 21:9 recording (gameplay + webcam overlay) → transcribe → detect silences/loudness → pick highlight candidates → detect the webcam → render vertical 9:16 clips with word-by-word burned-in captions (plus an optional silence-trimmed horizontal edit) → human review and export. Nothing is auto-published.

## Start of every session

1. Read this file, then `docs/PROGRESS.md`.
2. Resume from the first unchecked (`[ ]`) or in-progress (`[~]`) item.
3. Before using any library API, check the installed version and its docs (Next.js docs ship in `node_modules/next/dist/docs/`).

## Autonomy rules

- Work phases in order. Don't stop to ask unless an action is destructive or irreversible. When unsure, choose the reasonable option and record an ADR in `docs/DECISIONS.md`.
- `docs/PROGRESS.md` is the single source of truth: `[x]` done, `[~]` in progress, blockers listed under "Blockers".
- A phase is done only when `pnpm lint`, `pnpm typecheck`, `pnpm test` (and from Phase 6, `pnpm test:e2e`) pass.
- One Conventional Commit per completed task group. Never force-push or rewrite history. No AI attribution trailers.
- Never commit secrets, `.env*` (except `.env.example`), `data/`, models or generated media.
- Missing system dependency → add a Blocker entry, implement against the adapter/fake, add a `pnpm run doctor` check, move on.

## Stack (verified versions in docs/PROGRESS.md → Recon)

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn `base-nova` style on **Base UI** (`@base-ui/react`, not Radix) · Phosphor icons · zod · Drizzle + better-sqlite3 · Vitest/RTL/MSW · Playwright + axe · system ffmpeg/ffprobe · whisper.cpp CLI.

## shadcn-first rule (all UI)

1. Look in `components/ui/`, then the registry (`pnpm dlx shadcn@latest search|view|add`).
2. If it exists: `pnpm dlx shadcn@latest add <name>`. Don't hand-copy. Note any edit to generated files in `docs/COMPONENTS.md`.
3. If not: build it shadcn-style. One file, composable parts, `data-slot`, `cn()`, `cva` variants, `className` merge, `...props` spread, Base UI primitives for interactivity (`render` prop for polymorphism), design tokens only, controlled + uncontrolled support. Add a test, a `docs/COMPONENTS.md` entry and a `/dev/components` example.

## Architecture rules

- `features/*` never imports from `app/` or `components/`.
- Anything touching DB, filesystem or secrets starts with `import "server-only"` (worker-only modules excepted; see ARCHITECTURE).
- Business logic (state machine, ASS, filtergraphs, scoring, line breaking) is pure and unit tested.
- Long work never runs in a request: requests enqueue jobs, the worker runs them.

## Commands

| Command                                    | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `pnpm dev`                                 | Next + worker (concurrently)                      |
| `pnpm lint` / `pnpm typecheck`             | Quality gates                                     |
| `pnpm test`                                | Unit + integration                                |
| `pnpm test:unit` / `pnpm test:integration` | Single layer                                      |
| `pnpm test:e2e`                            | Playwright (fake transcriber, heuristic selector) |
| `pnpm test:heavy`                          | Real whisper.cpp (skips if missing)               |
| `pnpm test:coverage`                       | Coverage with thresholds                          |
| `pnpm run doctor`                          | System dependency check                           |
| `pnpm db:generate` / `pnpm db:migrate`     | Drizzle migrations                                |
| `pnpm fixtures`                            | Generate test videos                              |

## Docs

- [Progress](docs/PROGRESS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Business logic](docs/BUSINESS_LOGIC.md)
- [Pipeline](docs/PIPELINE.md)
- [Development guidelines](docs/DEVELOPMENT_GUIDELINES.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Components](docs/COMPONENTS.md)
- [Testing](docs/TESTING.md)
- [Decisions (ADRs)](docs/DECISIONS.md)
