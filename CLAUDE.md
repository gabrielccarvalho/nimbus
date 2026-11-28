@AGENTS.md

# Nimbus

Local-first web app: upload a long 16:9 / 21:9 recording (gameplay + webcam overlay) → transcribe → detect silences/loudness → pick highlight candidates → detect the webcam → render vertical 9:16 clips with word-by-word burned-in captions (plus an optional silence-trimmed horizontal edit) → human review and export. Nothing is auto-published.

## Start of every session

1. Read this file, then `docs/PROGRESS.md`.
2. Resume from the first unchecked (`[ ]`) or in-progress (`[~]`) item.
3. Before using any library API, check the installed version and its docs (Next.js docs ship in `node_modules/next/dist/docs/`).

## Autonomy rules

- Work phases in order. Don't stop to ask unless an action is destructive or irreversible. When unsure, choose the reasonable option and record an ADR in `docs/DECISIONS.md`.
- `docs/PROGRESS.md` is the single source of truth: `[x]` done, `[~]` in progress, blockers listed under "Blockers".
- A phase is done only when `pnpm check:guidelines`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (and from Phase 6, `pnpm test:e2e`) pass.
- One Conventional Commit per completed task group. Never force-push or rewrite history. No AI attribution trailers.
- Never commit secrets, `.env*` (except `.env.example`), `data/`, models or generated media.
- Missing system dependency → add a Blocker entry, implement against the adapter/fake, add a `pnpm run doctor` check, move on.

## Non-negotiables

The product rules that never bend. The full list, with where each is enforced, is [Business logic › Invariants](docs/BUSINESS_LOGIC.md#invariants).

- Nothing is rendered, published or added to the playbook without an explicit approval by a person. Only `approved` clips render; only `rendered` clips publish; an edited clip must render again first.
- Project status changes only through `assertTransition` in `features/pipeline/state-machine.ts`.
- Every read and write is scoped to the viewer's workspace (`assertProjectAccess`, `forProject`). A foreign id answers `NOT_FOUND`.
- The browser preview and the ffmpeg render come from the same pure functions. Don't style one without the other.
- A change to a rule in `docs/BUSINESS_LOGIC.md` changes the code, its test and the doc in one commit, with an ADR when it touches an invariant.

## Stack (verified versions in docs/PROGRESS.md → Recon)

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn `base-nova` style on **Base UI** (`@base-ui/react`, not Radix) · Phosphor icons · zod · Drizzle + Postgres (Docker; PGlite in tests) · Vitest/RTL/MSW · Playwright + axe · system ffmpeg/ffprobe · whisper.cpp CLI.

## shadcn-first rule (all UI)

1. Look in `components/ui/`, then the registry (`pnpm dlx shadcn@latest search|view|add`).
2. If it exists: `pnpm dlx shadcn@latest add <name>`. Don't hand-copy. Note any edit to generated files in `docs/COMPONENTS.md`.
3. If not: build it shadcn-style. One file, composable parts, `data-slot`, `cn()`, `cva` variants, `className` merge, `...props` spread, Base UI primitives for interactivity (`render` prop for polymorphism), design tokens only, controlled + uncontrolled support. Add a test, a `docs/COMPONENTS.md` entry and a `/dev/components` example.

## Page rule (all pages)

The clip editor is the reference page. Before adding or changing a page, read [UX patterns](docs/UX_PATTERNS.md) and end with its checklist.

- Frame: 60 px header · stage · 340 px inspector on the right · dock at the bottom for anything in time. No fifth region, no cards inside cards.
- Header order: back, context line over the title (`h1`), state, section tabs (`Segmented`), secondary actions, then the one white `variant="primary"` button.
- Decisions are the Reject | Approve `Segmented` with `A` / `X`. Status is always a `StatusPill`: text plus tone, with a matching filter.
- Save state sits next to the title. Every key is printed on its control as a `Kbd` and listed in the shortcuts dialog.
- If the editor already solved it, do it the same way. If nothing covers it, decide, then add the pattern to the doc in the same commit.

## Architecture rules

- `features/*` never imports from `app/` or `components/`.
- Anything touching DB, filesystem or secrets starts with `import "server-only"` (worker-only modules excepted; see ARCHITECTURE).
- Business logic (state machine, ASS, filtergraphs, scoring, line breaking) is pure and unit tested.
- Long work never runs in a request: requests enqueue jobs, the worker runs them.
- Text a person reads comes from a messages file, in en-US and pt-BR in the same commit ([Development guidelines › Translations](docs/DEVELOPMENT_GUIDELINES.md#translations)).

## Guideline check

`pnpm check:guidelines` (`scripts/guidelines.ts`) fails on: a feature importing UI, a DB or filesystem module without `server-only`, long work imported into a route or action, border utilities or raw hex colours outside `components/ui`, the gradient outside the sign-in headline, a second primary button in a route file, and a dead doc link here. It runs in pre-commit, in `pnpm test` and in CI.

Don't silence it. Fix the code, or add the path to that rule's `allow` map with the reason and record an ADR. A new rule that can be checked mechanically gets a check and a test case in `scripts/guidelines.test.ts`.

## Commands

| Command                                    | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `pnpm dev`                                 | Next + worker (concurrently)                      |
| `pnpm lint` / `pnpm typecheck`             | Quality gates                                     |
| `pnpm check:guidelines`                    | Architecture, design-system and page rules        |
| `pnpm test`                                | Unit + integration                                |
| `pnpm test:unit` / `pnpm test:integration` | Single layer                                      |
| `pnpm test:e2e`                            | Playwright (fake transcriber, heuristic selector) |
| `pnpm test:heavy`                          | Real Groq (skips without `GROQ_API_KEY`)          |
| `pnpm test:s3`                             | Storage contract on MinIO (skips if down)         |
| `pnpm test:coverage`                       | Coverage with thresholds                          |
| `pnpm run doctor`                          | System dependency check                           |
| `pnpm db:generate` / `pnpm db:migrate`     | Drizzle migrations                                |
| `pnpm storage:push`                        | Copy `DATA_DIR` media into the S3 bucket          |
| `pnpm fixtures`                            | Generate test videos                              |

## Docs

- [Progress](docs/PROGRESS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Business logic](docs/BUSINESS_LOGIC.md)
- [Pipeline](docs/PIPELINE.md)
- [Development guidelines](docs/DEVELOPMENT_GUIDELINES.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [UX patterns](docs/UX_PATTERNS.md)
- [Components](docs/COMPONENTS.md)
- [Testing](docs/TESTING.md)
- [Deploying](docs/DEPLOY.md)
- [Decisions (ADRs)](docs/DECISIONS.md)
