# Testing

| Layer       | Tool                              | What                                                                                                                                                                                  | Where                                | Run                     |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------- |
| Unit        | Vitest (node)                     | Pure logic: state machine, ASS, line breaking, filtergraphs, aspect classification, snapping/overlap, heuristic scorer, progress parser, normalization, border heuristic, zod schemas | `**/*.test.ts` beside source         | `pnpm test:unit`        |
| Component   | Vitest (jsdom) + RTL + user-event | Custom components: variants, controlled/uncontrolled, keyboard, roles                                                                                                                 | `**/*.test.tsx`                      | `pnpm test:unit`        |
| Integration | Vitest (node, sequential)         | PGlite (in-process Postgres), real ffmpeg on generated fixtures, MSW for Anthropic. Repositories, migrations, queue, upload and media routes, pipeline steps, renders                 | `tests/integration/**/*.test.ts`     | `pnpm test:integration` |
| Contract    | Vitest                            | Every Transcriber / HighlightSelector / StorageAdapter passes one shared suite                                                                                                        | `tests/contracts/`                   | part of integration     |
| E2E         | Playwright (Chromium)             | Golden path and key flows                                                                                                                                                             | `tests/e2e/*.spec.ts`                | `pnpm test:e2e`         |
| A11y        | `@axe-core/playwright`            | No serious/critical violations on every screen                                                                                                                                        | in e2e                               |                         |
| Heavy       | Vitest, `@heavy` in the test name | Real whisper.cpp; skipped when binary/model missing                                                                                                                                   | `tests/heavy/`                       | `pnpm test:heavy`       |
| S3          | Vitest                            | `StorageAdapter` contract plus signed URLs on MinIO (`docker compose --profile s3 up -d`); skipped when it doesn't answer, `S3_TEST_LARGE=1` adds the 5 GB move                       | `tests/contracts/storage-s3.test.ts` | `pnpm test:s3`          |

`pnpm test` runs unit + integration. `pnpm test:coverage` runs both with v8 coverage and enforces thresholds.

## Fixtures

Fixtures are generated, never committed. `scripts/make-fixtures.ts` (`pnpm fixtures`) uses ffmpeg lavfi to produce, in `tests/fixtures/.generated/`:

- `gameplay-16x9.mp4`: 1920×1080, 20 s, `testsrc2` background, a 384×216 box with a 6 px static border in the bottom-right corner (simulated webcam), a sine tone with two programmed silent gaps (4–6 s and 12–13.5 s).
- `gameplay-21x9.mp4`: 2560×1080, same structure, webcam in the top-left.
- `not-a-video.mp4`: random bytes with an mp4 extension.
- `no-audio.mp4`: video only.
- `tone-880hz.m4a`: a 30 s 880 Hz sine (AAC, 48 kHz), the music track in render tests and the music e2e. It sits well apart from the gameplay fixtures' 440 Hz tone, so a band filter can tell the two apart.

Vitest's integration global setup and Playwright's global setup both call the generator, which skips files that already exist (keyed by a version string in the script). `tests/fixtures/transcript.json` (committed, hand-written) feeds the FakeTranscriber.

## Environment in tests

- Integration tests get a fresh temp `DATA_DIR` per test and share one migrated PGlite database per test file, truncated before each test (`tests/utils/test-env.ts`). No Docker needed.
- `tests/integration/job-queue-postgres.test.ts` races four connections for 120 jobs against the compose Postgres in a scratch database; it skips when Postgres isn't reachable (`TEST_DATABASE_URL` overrides the default `localhost:5442`).
- Playwright recreates a `nimbus_e2e` database on the compose server once per run (`tests/e2e/reset-db.ts`), so e2e needs `docker compose up -d db`.
- `server-only` is aliased to an empty module in Vitest.
- MSW intercepts `https://api.anthropic.com/*`. Unhandled requests fail the test (`onUnhandledFrame: "error"`). Tests never hit the real API.
- The e2e worker runs with `NODE_ENV=production`, so it reads `.env.local` (with `ANTHROPIC_API_KEY` forced empty). The golden path renders with captions, so `FFMPEG_PATH` there must point at an ffmpeg with libass; `pnpm run doctor` says whether it does.
- E2E also sets `YOUTUBE_CLIENT=fake` (`features/publishing/youtube-fake.ts`): uploads never leave the machine and return `fake-1`, `fake-2`, … as video ids. `YOUTUBE_FAKE_FAIL_ONCE=1` makes the first upload fail. Its stats are fixed: 1,234 views, 56 likes, 7 comments, 11.5 s average view, 64.2 % watched and a 100-point retention curve. `tests/e2e/utils/youtube.ts` seeds a connected channel and a Google `account` row with an unexpired token, so the job never refreshes one. `seedInsightSuggestion()` adds one pending selection suggestion for that channel, and `removeYouTubeChannel` deletes the channel's suggestions, playbook rules and `sync_uploads`/`sync_channel`/`sync_stats_batch` jobs.
- The fake's uploads table (`FAKE_PAST_UPLOADS`) holds five past uploads: Past short one, two and three (45, 30 and 58 s, 40, 20 and 5 days old, `SHORTS`) and two long ones (Past video four, 150 s, and Past long video, 600 s, `VIDEO_ON_DEMAND`); Nimbus uploads are listed first. Daily views per Short are a fixed formula of the last digit of the video id, ending two days before the requested end date, and channel rows are 400 views a day, so 28 days read 11,200. Its top videos rank by that last digit too (`views = digit × 10 × days`), so Past short three leads the imported Shorts. `analytics.spec.ts` imports the three Shorts, checks the overview and the `/channels?tab=insights` redirect.
- `tests/integration/music-race-postgres.test.ts` runs on the Docker Postgres too (skipped when it isn't reachable): a save that waits on a running track delete finds the track gone, and a delete that waits on a running save sees the clip using it.
- `tests/integration/import-race-postgres.test.ts` runs on the Docker Postgres (skipped when it isn't reachable): a publish that waits on a running import's channel lock removes the row that import added.
- E2E runs with `TRANSCRIBER=fake`, `HIGHLIGHT_SELECTOR=heuristic`, `DATA_DIR=<temp>`, `E2E=1`. The web server command runs `pnpm run setup:vision` first, so webcam detection runs the real border heuristic and MediaPipe in Chromium (the layout spec fails if MediaPipe logs a load warning).
- Integration tests load `.env.test.local` / `.env.test` (never `.env.local`, ADR-0033). Put machine-specific binaries there, e.g. `FFMPEG_PATH` pointing at an ffmpeg with libass.
- Render tests that need caption burn-in (`it.runIf(hasLibass)` in `tests/integration/render.test.ts`) skip when the configured ffmpeg lacks libass.
- The real-ffmpeg music checks live in `tests/integration/render.test.ts` ("render_clip with music and on-screen text"), so `pnpm test` runs them; `pnpm test:heavy` only covers whisper.cpp. `bandLevelDb(file, hz, fromS, durationS)` band-passes the render around one frequency and reads `volumedetect`'s mean level, which proves the 880 Hz track is mixed in, ducked under speech at clip time (the clip is moved 3 s later into the recording, so ducking in source time would land in the wrong place) and gone after the track runs out, while the 440 Hz source keeps playing.
- The music preview tests (`components/projects/music-preview.test.tsx`) stub `window.AudioContext` with a fake that records gain values and starts `suspended`, so they cover routing only once the context runs. Nothing plays real audio, and e2e Chromium plays no sound either.
- `tests/e2e/music.spec.ts` uploads the tone in Settings › Music, puts it under a clip with the hook as on-screen text, checks that a used track can't be deleted, renders, and runs axe on the publish dialog showing the Content ID warning.

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
