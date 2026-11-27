# Handoff: one page frame (Phase 41, ADR-0077)

Written 2026-11-27 for the next Claude Code session. Delete this file when the work below is finished.

## The task

Implement the "Nimbus pages redesign" canvas (https://claude.ai/artifact/G45Xb2bhrGxM6BEV5bQ7Bk) in the app: every signed-in page takes the clip editor's frame. The rules are in `docs/UX_PATTERNS.md`; the checklist of pages is Phase 41 in `docs/PROGRESS.md`.

## State

Branch `claude/practical-hypatia-352045`, pushed. `master` only has the docs and guideline-check commit (`18a228a`). Do not push to `master` unless asked.

Passing: `pnpm check:guidelines`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (95 files).

Not passing or not verified:

- `pnpm test:e2e`: 8 failures out of the first 39 tests of 49 when this was written; the run had not finished. Details below.
- Nobody has looked at the rebuilt pages in a browser. Expect layout bugs.
- `pnpm test:integration`: 14 failures in `render.test.ts`, `clip-editing.test.ts` and `publish-step.test.ts`. They fail the same way on `ea9e886`, before any of this work: ffmpeg in the cloud container cannot open its inputs. Check them on a machine with a working ffmpeg before blaming this branch.

## What was built

- `components/app-shell/app-header.tsx`: `AppHeader` and parts (back, context, title as `h1`, state, tabs, actions).
- `components/app-shell/header-slot.tsx`: `AppHeaderSlot` and `HeaderSlot`. Client components portal their primary action into the header, or their state beside the title with `target={HEADER_STATE_SLOT_ID}`. With no header in the document the children render in place, which is what unit tests see.
- `components/projects/timeline-dock.tsx`: `TimelineDock` and `DockLegend`.
- `app/(app)/layout.tsx`: the breadcrumb bar is gone (`breadcrumbs.tsx` deleted). Each page renders its own header.
- `app/(app)/projects/[id]/layout.tsx`: full-height frame from `lg`. `ProjectHeader` is an `AppHeader` with icon buttons for the source video, Project settings (still a sheet) and Delete.
- Overview (`project-overview.tsx`, `projects/[id]/page.tsx`): next step and live step detail on the stage, pipeline in a 340 px inspector, `AudioOverview` as the dock, top picks show video frames.
- Clips (`clips-review.tsx`, `clips-grid.tsx`): a click or focus selects a tile, double-click or Enter opens the editor; the inspector has the Reject | Approve `Segmented`; every tile has a `StatusPill`; Render approved, Render horizontal edit and the downloads are in the header.
- Transcript (`transcript-view.tsx`): selection state lifted to `TranscriptView`; Make a clip and Clear in the header; the transcript is the right panel; the seekable timeline is the dock.
- Home (`(home)/page.tsx`, `import-card.tsx`, `project-grid.tsx`, `status-badge.tsx`): `compact` import row once projects exist, New project in the header, a Failed filter, "Done" instead of "Exported", `projectNextStep` on tiles.
- Analytics (`analytics-header.tsx`, `period-picker.tsx`, `overview.tsx`, `insights.tsx`, `suggestion-card.tsx`): header tabs, the period as a menu, top Shorts and the playbook as side panels.
- Channels: `/channels` renders `ChannelList`; `/settings/channels` redirects there; the OAuth `callbackURL` is `/channels`.
- Settings (`settings-header.tsx`, `settings-form.tsx`): section name as the header title; Save and Discard in the header, disabled until the form is dirty; "Unsaved changes" beside the title.
- `components/ui/timeline.tsx`: the `clip` range is `lav`, `selected` is a `foreground` ring.

## E2E failures seen, and what to check

Run with a Postgres on `localhost:5442` (user and password `nimbus`). In the cloud container Playwright's pinned browser is missing: use a local config that sets `launchOptions.executablePath` to `/opt/pw-browsers/chromium` and `video: "off"`.

1. `clips.spec.ts:112` "filters, rejects and approves from the keyboard": after rejecting from the inspector, the "Rejected 1" filter never appears. Find out whether the inspector's Reject fires `setClipStatusAction` (the `Segmented` item's accessible name, a disabled state, or the selection jumping to another clip because a rejected clip re-sorts). Probably a real bug in `ClipInspector` or the spec's locator.
2. `layout.spec.ts:6` and `:57`: "Webcam found" never shows. These specs open the editor with a tile click under a variable name the bulk rename missed. Change the tile `click()` to `dblclick()`, then re-check.
3. `music.spec.ts:13`: the editor's Title field never shows. Same cause as 2, most likely.
4. `settings.spec.ts:62` "workspace caption defaults": timed out. Save is now in the header and disabled until something changes; read the spec against `settings-form.tsx`.
5. `golden-path.spec.ts:6`, `publish.spec.ts:31` and `:78`: the tile reads "Render failed". Rendering fails in this container before this branch too (see the integration note). Re-run on a machine where ffmpeg works before changing anything.
6. Tests 40 to 49 had not run. Run the whole suite.

## Still to do

1. Finish and fix e2e (above).
2. Look at every page at 1440 × 900 and at phone width. Things most likely to be off: the project frame's height and scrolling under `lg`, the video sizing on the transcript stage, the header wrapping when the slot holds four buttons (clips), the compact import row, the settings nav column.
3. Add `/dev/components` examples for `AppHeader` and `TimelineDock` (the shadcn-first rule in `CLAUDE.md` asks for one; there is none yet).
4. The clip editor still has its own header markup. Moving it onto `AppHeader` is optional; its tests depend on roles, not classes.
5. Open items already in `docs/PROGRESS.md` Phase 41: sparklines on stat cards, project settings as an inspector tab, a period on the Shorts and Insights tabs, the `track-picker` border exception.

## Decisions the user has not confirmed

- A single click on a clip tile now selects instead of opening the editor. The canvas shows this, but it reverses ADR-0074's "tiles open the editor directly". Ask before building further on it.
- Project settings stayed a sheet; `docs/UX_PATTERNS.md` was changed to say so.

## Local leftovers in the cloud container

`e2e.local.config.ts` and `tests/e2e/zz-screens.spec.ts` are untracked and listed in `.git/info/exclude`. They are not on the remote. Recreate them only if you need them.
