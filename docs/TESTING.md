# Testing

| Layer       | Tool                              | What                                                                                                                                                                                  | Where                            | Run                     |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------- |
| Unit        | Vitest (node)                     | Pure logic: state machine, ASS, line breaking, filtergraphs, aspect classification, snapping/overlap, heuristic scorer, progress parser, normalization, border heuristic, zod schemas | `**/*.test.ts` beside source     | `pnpm test:unit`        |
| Component   | Vitest (jsdom) + RTL + user-event | Custom components: variants, controlled/uncontrolled, keyboard, roles                                                                                                                 | `**/*.test.tsx`                  | `pnpm test:unit`        |
| Integration | Vitest (node, sequential)         | Real SQLite in a temp file, real ffmpeg on generated fixtures, MSW for Anthropic. Repositories, migrations, queue, upload and media routes, pipeline steps, renders                   | `tests/integration/**/*.test.ts` | `pnpm test:integration` |
| Contract    | Vitest                            | Every Transcriber / HighlightSelector / StorageAdapter passes one shared suite                                                                                                        | `tests/contracts/`               | part of integration     |
| E2E         | Playwright (Chromium)             | Golden path and key flows                                                                                                                                                             | `tests/e2e/*.spec.ts`            | `pnpm test:e2e`         |
| A11y        | `@axe-core/playwright`            | No serious/critical violations on every screen                                                                                                                                        | in e2e                           |                         |
| Heavy       | Vitest, `@heavy` in the test name | Real whisper.cpp; skipped when binary/model missing                                                                                                                                   | `tests/heavy/`                   | `pnpm test:heavy`       |

`pnpm test` runs unit + integration. `pnpm test:coverage` runs both with v8 coverage and enforces thresholds.

## Fixtures

Fixtures are generated, never committed. `scripts/make-fixtures.ts` (`pnpm fixtures`) uses ffmpeg lavfi to produce, in `tests/fixtures/.generated/`:

- `gameplay-16x9.mp4`: 1920×1080, 20 s, `testsrc2` background, a 384×216 box with a 6 px static border in the bottom-right corner (simulated webcam), a sine tone with two programmed silent gaps (4–6 s and 12–13.5 s).
- `gameplay-21x9.mp4`: 2560×1080, same structure, webcam in the top-left.
- `not-a-video.mp4`: random bytes with an mp4 extension.
- `no-audio.mp4`: video only.

Vitest's integration global setup and Playwright's global setup both call the generator, which skips files that already exist (keyed by a version string in the script). `tests/fixtures/transcript.json` (committed, hand-written) feeds the FakeTranscriber.

## Environment in tests

- Integration tests get a fresh temp `DATA_DIR` and SQLite file per file (`tests/utils/test-env.ts`).
- `server-only` is aliased to an empty module in Vitest.
- MSW intercepts `https://api.anthropic.com/*`. Unhandled requests fail the test (`onUnhandledFrame: "error"`). Tests never hit the real API.
- The e2e worker runs with `NODE_ENV=production`, so it reads `.env.local` (with `ANTHROPIC_API_KEY` forced empty). The golden path renders with captions, so `FFMPEG_PATH` there must point at an ffmpeg with libass; `pnpm run doctor` says whether it does.
- E2E runs with `TRANSCRIBER=fake`, `HIGHLIGHT_SELECTOR=heuristic`, `DATA_DIR=<temp>`, `E2E=1`. The web server command runs `pnpm run setup:vision` first, so webcam detection runs the real border heuristic and MediaPipe in Chromium (the layout spec fails if MediaPipe logs a load warning).
- Integration tests load `.env.test.local` / `.env.test` (never `.env.local`, ADR-0033). Put machine-specific binaries there, e.g. `FFMPEG_PATH` pointing at an ffmpeg with libass.
- Render tests that need caption burn-in (`it.runIf(hasLibass)` in `tests/integration/render.test.ts`) skip when the configured ffmpeg lacks libass.

## Coverage

v8 provider. Thresholds: 90% lines/functions/branches for the pure modules in `features/**` (listed in `vitest.config.ts` → `coverage.thresholds["features/**/…"]`), 70% overall. CI fails below them.

## Writing tests

- Pure logic: table-driven `it.each`. For rules with invariants (line breaking, overlap removal) add property-style tests that generate many random inputs from a seeded PRNG (`tests/utils/prng.ts`) and assert the invariant.
- Golden files: `expect(output).toMatchFileSnapshot("__golden__/name.ass")`. Update deliberately with `pnpm vitest -u` and review the diff.
- Components: query by role and name (`getByRole("button", { name: /approve/i })`), drive with `userEvent`, test keyboard paths explicitly.
- Integration: build state with repositories, not raw SQL. Clean up via the temp dir.

## Debugging

- `pnpm test:watch` for the unit project. `pnpm vitest --project integration -t "name"` to focus.
- `LOG_LEVEL=debug pnpm test:integration` to see worker logs.
- Playwright: `pnpm test:e2e:ui`; traces are recorded on first retry and open with `pnpm exec playwright show-trace`.

## Manual keyboard walkthrough

Filled in during Phase 16.
