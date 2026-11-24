# Editable Gameplay Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the gameplay box draggable and resizable (shape locked to its output slot) in the clip editor and the layout step.

**Architecture:** The box is stored in the existing `gameplayRect`. A slot-shaped rect passes through `coverCrop` unchanged, so the render and `frameAt` need no changes. `CropRegionEditor` gains multi-region and aspect-lock support.

**Tech Stack:** React 19, Base UI/shadcn style, Vitest/RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-gameplay-box-design.md`

## Global Constraints

- No DB schema change and no render-graph change. The existing render goldens are unchanged.
- Slot aspect (output w/h): cam-top `1080/1248`, split-50 `1080/960`, no-cam-fill `1080/1920`. no-cam-blur-fill has no box.
- On a user edit of the box: `gameplayRect` = the box (normalised 0–1), and `gameplayFocusX` = `0.5`.
- The initial box equals today's effective crop (`coverCrop(toPixels(gameplayRect), slotAspect, gameplayFocusX)`, normalised), so untouched layouts render identically.
- Mode switch: the box is refitted to the new slot aspect around its centre, clamped inside the frame, with the same area where it fits.
- The "Gameplay focus" slider is removed from the layout step.
- `features/*` stays pure and must not import `components/`. Follow the shadcn-first rule: update `docs/COMPONENTS.md` and the `/dev/components` example for the crop-region change.
- Keep comments to the bare minimum. Conventional Commits, no AI attribution trailers.
- Done means `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass.

## Review Focus

1. Untouched layouts (FULL_FRAME + any focusX) render byte-identically. → geometry test: `planLayout` with the box from `gameplayBox` written back gives the same crop (±2 px, even rounding).
2. With the aspect locked, resizing from any corner, and Alt+arrow, keeps the aspect and stays inside 0–1. → crop-region tests.
3. Two regions in one editor: dragging one never moves the other, and each has its own keyboard focus and label. → crop-region test.
4. Mode switch refit stays in the frame and keeps the aspect. → geometry test.
5. On a source whose real image is pillarboxed (black bars), the box can still go anywhere in the frame (no content detection). Known, out of scope.

---

### Task 1: Geometry helpers and multi-region crop editor

**Files:** `features/layout/geometry.ts` (+ tests in its existing test file), `components/ui/crop-region-editor.tsx` (+ its test), `docs/COMPONENTS.md`, the `/dev/components` example.

**Interfaces (produces):**

- `gameplaySlotAspect(mode: LayoutMode): number | null`: null for no-cam-blur-fill.
- `gameplayBox(layout: LayoutInput, width: number, height: number): Rect | null`: the effective gameplay crop, normalised.
- `fitRectToAspect(rect: Rect, aspect: number, width: number, height: number): Rect`: keeps the centre and the area, then clamps inside the frame (shrinking if needed). `aspect` is in pixels; `Rect` is normalised.
- `CropRegion` props: `value?: CropRect`, `onValueChange?: (rect) => void`, `aspectRatio?: number` (pixel w/h; converted with the frame's pixel size at drag time). Without `value`, it uses the editor context exactly as today.

- [ ] Tests first:
  - geometry: `gameplayBox` matches `planLayout`'s gameplay crop for cam-top/split-50/no-cam-fill, and is null for blur-fill; round-trip identity (box → `gameplayRect`, focusX 0.5 → same crop ±2 px); `fitRectToAspect` stays inside the frame and keeps the aspect.
  - crop region: aspect-locked corner resize keeps the ratio for all four corners; Alt+arrow keeps the ratio; a second controlled region moves independently of the first.
- [ ] Implement, then run focused tests → PASS. Commit `feat(ui): multi-region, aspect-locked crop regions`.

### Task 2: Editable gameplay box in both editors

**Files:** `components/projects/clip-editor.tsx`, `components/projects/layout-editor.tsx` (`GameplayWindow` becomes an editable region or is replaced; remove the slider), their tests, `tests/e2e/` (the clip editor spec and the layout spec if one covers the slider), `docs/BUSINESS_LOGIC.md` (layout section), `docs/DECISIONS.md` (short ADR), `docs/PROGRESS.md`.

Behaviour:

- A `CropRegion` labelled "Gameplay region" sits beside "Webcam region", with a dashed white style and no darkening shadow. Its value is `gameplayBox(layout)`, its aspect is `gameplaySlotAspect(layout.mode)`, and on change it sets `{ gameplayRect: rect, gameplayFocusX: 0.5 }`.
- The mode toggle refits via `fitRectToAspect(gameplayBox(old layout), newAspect)` when the new mode has a box.
- The clip editor saves it through the existing layout override.

- [ ] Tests first:
  - clip-editor: keyboard-moving the gameplay region changes the saved `layoutOverride.gameplayRect` and sets focusX 0.5.
  - layout-editor: there is no slider, and the region exists.
  - e2e: in the clip editor, drag the gameplay region, save, reload, and check the region's position persisted.
- [ ] Implement, then `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` → PASS. Commit `feat(layout): drag and resize the gameplay box`.
