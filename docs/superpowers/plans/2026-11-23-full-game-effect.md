# Full Game Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Full game" effect. While it's active, the gameplay fills the vertical frame as a 9:16 cover crop and the webcam goes away. Users add it by hand in the editor lane.

**Architecture:** Full game is a second `target` of the existing `focus` effect, so the no-overlap rules already cover it. `frameAt` produces the full-game region, the ffmpeg effects graph gets a matching overlay branch, and the editor lane gets a fourth row.

**Tech Stack:** TypeScript strict, zod, React 19, Vitest/RTL, Playwright, ffmpeg 9 (sendcmd effects graph, ADR-0053).

**Spec:** `docs/superpowers/specs/2026-11-23-full-game-effect-design.md`

## Global Constraints

- `focus` gains `target: z.enum(["cam", "game"]).default("cam")`. Stored tracks without `target` parse as `"cam"`. No DB migration.
- Full game region: `coverCrop(toPixels(layout.gameplayRect, w, h), OUTPUT_WIDTH / OUTPUT_HEIGHT, layout.gameplayFocusX)` → dest `0,0,1080,1920`. This is the same framing as `planLayout`'s no-cam-fill.
- Full game applies only when `usesWebcam(layout.mode) && layout.webcamRect`. Otherwise `frameAt` ignores it and the lane greys it out, like full cam without a webcam.
- Zoom applies inside full game (to its single region). Zoom inside full cam stays a no-op. Shake applies everywhere. Captions are unaffected.
- The planner never creates `target: "game"`. Planner caps that count focus (the 40 % budget, the gap) count only events it creates. Existing planner behaviour is unchanged.
- With no full-game events, `frameAt` output and all existing render goldens are unchanged.
- Keep comments to the bare minimum and match the surrounding idiom. Conventional Commits, no AI attribution trailers.
- Done means `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass.

## Review Focus

1. A stored track from before this change, with `focus` and no `target`, renders exactly as before. → schema test (Task 1).
2. Full game on a no-cam layout, or after a layout override removes the webcam: ignored in the preview and the render. → `frameAt` test (Task 1).
3. A zoom inside full game zooms the full-frame gameplay, and the click-to-aim mapping (`zoomFocusAt`, `zoomRegion`) still lands on the clicked spot. → `frameAt`/`zoomFocusAt` tests (Task 1).
4. Dragging a Full game block into a Full cam block is blocked, because they're the same kind. → lane test (Task 2).
5. Planner-made tracks and the "Reset to auto" result never contain `target: "game"`. → planner test (Task 1).

---

### Task 1: Model, frame function and render

**Files:**

- Modify: `features/effects/schema.ts` (focus object), `features/effects/frame.ts` (focus handling, `zoomFocusAt`/`zoomRegion` when full game is on screen), `features/render/effects-graph.ts` (full-game slot/branch, enable expression), `features/effects/planner.ts` (constructs `target: "cam"` explicitly if it builds focus objects)
- Test: `features/effects/effects.test.ts`, `features/render/render.test.ts` (+ new golden `features/render/__golden__/effects-full-game.txt`), `tests/integration/render.test.ts`
- Docs: `docs/BUSINESS_LOGIC.md` effect table and rules; a one-line addendum to ADR-0054 in `docs/DECISIONS.md`

**Interfaces:**

- Produces: `Extract<Effect, { kind: "focus" }>["target"]` is `"cam" | "game"`. `frameAt` returns `{ regions: [ { crop: <game cover crop>, dest: {0,0,1080,1920} } ] }` during an active full game on a webcam layout, with zoom and shake applied to that one region.

- [ ] **Step 1: Write failing tests**
  - `effects.test.ts`:
    - `focus without target parses as cam`
    - `full game shows one full-frame gameplay region` (crop equals `coverCrop(toPixels(gameplayRect), 1080/1920, gameplayFocusX)`)
    - `full game is ignored without a webcam`
    - `zoom inside full game zooms that region`
    - `zoomFocusAt maps a click through full game on screen`
    - `planner never creates a full game event` (a reaction beat + scream still give `target: "cam"`)
  - `render.test.ts`:
    - `effectsGraph golden for full game with a zoom on cam-top`
    - existing goldens unchanged
  - `tests/integration/render.test.ts`:
    - `renders a full game range as gameplay only`: inside the range, the top band, where the webcam normally sits, shows gameplay colours. Use the per-column colour approach the focus test uses.
- [ ] **Step 2:** `pnpm vitest run features/effects features/render` → FAIL.
- [ ] **Step 3:** Implement the code. In `effects-graph.ts`, mirror how the full-cam slot is built and overlaid (`enable` from `activeEffect` ranges filtered by target). Keep one code path for both targets where it reads naturally.
- [ ] **Step 4:** `pnpm vitest run features/effects features/render && pnpm test:integration` → PASS.
- [ ] **Step 5: Commit** `feat(effects): full game focus in frames and renders`

---

### Task 2: Editor lane row, e2e and docs

**Files:**

- Modify: `components/projects/effects-lane.tsx` (fourth row "Full game"; add button; labels; overlap clamping across both focus rows), `components/projects/clip-effects.tsx` if row or button wiring lives there
- Test: `components/projects/effects-lane.test.tsx`, `tests/e2e/clips.spec.ts`
- Docs: `docs/PROGRESS.md` (Phase 26 item), `docs/PIPELINE.md` only if it lists the effect kinds

**Interfaces:**

- Consumes: `focus.target` from Task 1.

Behaviour:

- Rows in order: Full cam, Full game, Zoom, Shake. Full game blocks use a distinct design-token colour (no raw colours) and aria-labels like "Full game at 0:03.2".
- "Add at playhead" Full game creates `{ kind: "focus", target: "game" }` for 2000 ms in the free gap. The free gap is computed against all focus events, both targets. The button is disabled without a webcam, with the same tooltip as Full cam.
- Drag and resize clamp against the neighbouring focus events of either target.
- Full game blocks are muted with the "No webcam in this layout" tooltip when `!hasWebcam`.

- [ ] **Step 1: Write failing tests** in `effects-lane.test.tsx`:
  - `adds a full game at the playhead`
  - `full game can't be dragged into a full cam`
  - `full game add is disabled without a webcam`
  - `full game add is disabled when the playhead is inside a full cam`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Extend the e2e editor case: add a Full game, save, reload, and check the block is still there.
- [ ] **Step 4:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` → PASS.
- [ ] **Step 5: Commit** `feat(editor): full game row on the effects lane`
