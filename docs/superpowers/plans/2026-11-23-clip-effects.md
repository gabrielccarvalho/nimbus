# Clip Effects and Clips Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clips get an automatically placed, editable effect track (full cam, zoom, shake) that renders identically in ffmpeg and the browser preview, and the clips page becomes a grid of vertical clips that play on their own.

**Architecture:** Effects are stored per clip as timed events in absolute source ms. A pure `frameAt()` turns layout + events + time into source crops and output rects. The canvas preview calls it every animation frame, and the render samples it once per output frame into an ffmpeg command file, so the two can't drift. A pure planner places events from stored audio signals, transcript words, and "beats" that Claude's visual review now returns.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, zod, Drizzle/Postgres (PGlite in tests), Vitest/RTL, Playwright, system ffmpeg 9, Base UI/shadcn `base-nova`.

**Spec:** `docs/superpowers/specs/2026-11-23-clip-effects-design.md`

## Global Constraints

- Effect times are absolute source milliseconds. Persisted events always lie within `[clip.startMs, clip.endMs]`.
- `effects = null` means the clip renders and previews exactly as before this change. The golden graph for a clip without effects must not change.
- Effect kinds in v1: `focus` (webcam fills 9:16), `zoom` (`scale` 1.1–2.0, default 1.4, `focus {x,y}` 0–1 of the gameplay region, default centre, ease 150 ms in/out), `shake` (`intensity` `light | strong`, typical 300–800 ms). There is no "full game" focus.
- `focus` is ignored by `frameAt` (and greyed out in the editor) when the layout has no webcam. Such events are kept, not deleted.
- Same-kind events never overlap. A `zoom` inside a `focus` range has no effect, and the planner never creates one. A `shake` can overlap anything.
- Planner caps: ≤ 1 `focus`/`zoom` start per 3000 ms; `focus` total ≤ 40 % of the clip; ≤ 4 shakes; nothing starts in the first 500 ms unless a beat lands there. Beats snap to the strongest loudness or speech-rate peak within ±2500 ms.
- Captions stay where they are. They're burned on top of the final frame, unaffected by zoom/shake/focus.
- Architecture rules: `features/*` never imports `app/` or `components/`. DB/filesystem modules start with `import "server-only"`. The planner, `frameAt` and graph builders are pure and unit tested. Rendering stays in the worker.
- shadcn-first for UI. New generic UI parts are shadcn-style (`data-slot`, `cn()`, `cva`, `...props`, Base UI primitives), with a test, a `docs/COMPONENTS.md` entry and a `/dev/components` example.
- Keep comments to the bare minimum. New code matches the surrounding files' idiom.
- Commits: Conventional Commits, no AI attribution trailers. Never commit `data/`, media or `.env*`.
- Done means `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass.

## Review Focus

1. **Trimming past effects.** If you trim a clip so an edited zoom now straddles the new start, it's clipped to the range; one fully outside is dropped. → `normalizeEffects` tests (Task 1) and `saveClipEdit` integration test (Task 6).
2. **Clips with no webcam / layout override that removes it.** Focus events stay stored but render as the stacked/no-cam layout, in both preview and render. → `frameAt` test (Task 2) and the render integration test (Task 5).
3. **Old clips (`effects = null`) and clips from the heuristic selector (no beats).** They render byte-for-byte the same graph as today, and the planner gives audio-only effects. → golden test (Task 5) and planner test (Task 3).
4. **Very short clips (3 s minimum) and loud-from-start clips.** The planner must respect caps and the 500 ms lead-in without producing zero-length or overlapping events. → planner tests (Task 3).
5. **Stale render after an edit.** The grid must not play an MP4 that no longer matches the clip. Only `status === "rendered"` counts as current. → clips grid component test (Task 10).

---

## File structure

| File                                                                                 | Responsibility                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `features/effects/schema.ts` (new)                                                   | zod schemas/types: `Effect`, `ClipEffects`, `Beat`; `normalizeEffects()`                |
| `features/effects/frame.ts` (new)                                                    | `frameAt()` pure frame function                                                         |
| `features/effects/planner.ts` (new)                                                  | `planEffects()` pure auto placement + constants                                         |
| `features/effects/service.ts` (new, server-only)                                     | `autoEffectsFor(db, projectId, clips)`: loads signals/words/layout and runs the planner |
| `features/effects/effects.test.ts` (new)                                             | unit tests for schema, frame, planner                                                   |
| `features/render/effects-graph.ts` (new)                                             | `effectsGraph()` + `effectCommands()` (ffmpeg graph and per-frame command file)         |
| `lib/db/schema.ts`, `lib/db/migrations/0008_clip_effects.sql`                        | `clips.effects`, `clips.beats` columns                                                  |
| `features/clips/schema.ts`, `features/clips/service.ts`, `features/clips/actions.ts` | edit schema + save with effects, reset-to-auto action                                   |
| `features/highlights/{types,review,postprocess}.ts`                                  | beats on candidates                                                                     |
| `features/pipeline/steps/select.ts`, `render-clip.ts`                                | persist beats + auto tracks; render with effects                                        |
| `features/projects/{schema,rerun,settings-service}.ts`                               | `autoEffects` setting + re-run                                                          |
| `components/ui/timeline-track.tsx` (new)                                             | generic draggable/resizable blocks on a `Timeline`                                      |
| `components/projects/clip-preview.tsx` (new)                                         | shared vertical preview: canvas via `frameAt` + caption overlay                         |
| `components/projects/effects-lane.tsx` (new)                                         | effect blocks, popover, add buttons                                                     |
| `components/projects/clips-grid.tsx` (new), `clip-player-dialog.tsx` (new)           | replace `clips-review.tsx` list/player                                                  |

---

### Task 1: Effect schema, normalisation, DB columns, setting

**Files:**

- Create: `features/effects/schema.ts`, `features/effects/effects.test.ts`, `lib/db/migrations/0008_clip_effects.sql` (via `pnpm db:generate`)
- Modify: `lib/db/schema.ts` (clips table ~L151), `features/clips/schema.ts` (`clipEditSchema`), `features/projects/schema.ts` (`projectSettingsSchema`, `defaultProjectSettings`), `features/settings/schema.ts` (global defaults that mirror project settings, e.g. `niche` at L28/L47)

**Interfaces:**

- Produces:

  ```ts
  export const effectSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("focus"), startMs: int, endMs: int }),
    z.object({
      kind: z.literal("zoom"),
      startMs,
      endMs,
      scale: z.number().min(1.1).max(2).default(1.4),
      focus: z.object({ x: unit, y: unit }).default({ x: 0.5, y: 0.5 }),
    }),
    z.object({
      kind: z.literal("shake"),
      startMs,
      endMs,
      intensity: z.enum(["light", "strong"]).default("light"),
    }),
  ]) // refine endMs > startMs
  export type Effect = z.infer<typeof effectSchema>
  export const clipEffectsSchema = z.object({
    events: z.array(effectSchema).max(60),
    edited: z.boolean(),
  })
  export type ClipEffects = z.infer<typeof clipEffectsSchema>
  export const beatSchema = z.object({
    ms: int,
    kind: z.enum(["reaction", "weird"]),
    x: unit.optional(),
    y: unit.optional(),
  })
  export type Beat = z.infer<typeof beatSchema>
  export function normalizeEffects(
    events: readonly Effect[],
    range: TimeRange
  ): Effect[]
  ```
  - `clips.effects: jsonb<ClipEffects> | null`, `clips.beats: jsonb<Beat[]> | null` (Drizzle `$type`)
  - `clipEditSchema` gains `effects: clipEffectsSchema.nullable().default(null)`
  - `ProjectSettings.autoEffects: boolean`, default `true`

- [ ] **Step 1: Write failing tests** in `features/effects/effects.test.ts` (`describe("normalizeEffects")`):
  - `clips events to the range`: zoom 900–2000 with range 1000–5000 → 1000–2000; shake 6000–6500 → dropped.
  - `drops events shorter than 100 ms after clipping`.
  - `resolves same-kind overlap by keeping the earlier event and trimming the later one`: zoom 1000–3000 + zoom 2500–4000 → second becomes 3000–4000; if that leaves < 100 ms it's dropped.
  - `keeps shakes overlapping focus/zoom`.
  - `sorts by startMs`.
  - `effectSchema rejects endMs <= startMs and scale 2.5`.
- [ ] **Step 2:** `pnpm vitest run features/effects` → FAIL (module missing).
- [ ] **Step 3:** Implement `features/effects/schema.ts`. Add the columns to `lib/db/schema.ts`, run `pnpm db:generate` (rename to `0008_clip_effects.sql` if drizzle picks another name, matching the existing naming), and add `autoEffects` to the project and global settings schemas/defaults.
- [ ] **Step 4:** `pnpm vitest run features/effects && pnpm typecheck` → PASS. Fix any fixtures/factories that build full `ProjectSettings` objects (grep `defaultProjectSettings` usages in tests).
- [ ] **Step 5:** `pnpm db:migrate` locally (Postgres on 5442), then `pnpm test` → PASS.
- [ ] **Step 6: Commit** `feat(effects): clip effect schema, columns and autoEffects setting`

---

### Task 2: `frameAt`, the shared frame function

**Files:**

- Create: `features/effects/frame.ts`
- Test: `features/effects/effects.test.ts` (`describe("frameAt")`)

**Interfaces:**

- Consumes: `planLayout`, `LayoutPlan`, `OUTPUT_WIDTH/HEIGHT`, `coverCrop`, `toPixels` from `features/layout/geometry.ts`; `LayoutInput`, `usesWebcam` from `features/layout/schema.ts`; `Effect`.
- Produces:
  ```ts
  export type FloatRect = { x: number; y: number; w: number; h: number }
  export type FrameRegion = { crop: FloatRect; dest: FloatRect; blur?: true }
  export type Frame = { regions: FrameRegion[] }
  export function frameAt(
    layout: LayoutInput,
    source: { width: number; height: number },
    events: readonly Effect[],
    tMs: number
  ): Frame
  export const ZOOM_EASE_MS = 150
  export const SHAKE_SCALE = 1.06
  ```
  - `crop` is in source pixels (floats), and `dest` is in 1080×1920 output pixels.
  - Region order: stacked layouts top-then-bottom as in `planLayout`, `no-cam-blur-fill` background (`blur: true`) then foreground, `no-cam-fill` one region.

Behaviour that tests pin:

- No active events → regions equal the `planLayout` crops/dests exactly (integer values). This is the "no change" guarantee.
- Active `focus` + webcam layout → a single region: `coverCrop(webcamRect px, 9/16)` → dest `0,0,1080,1920`. Without a webcam, `focus` is ignored.
- Active `zoom` → the gameplay region's crop shrinks by `scale` around `focus` (in the gameplay crop's coordinates), clamped inside the original crop. Scale ramps linearly from 1 over the first `ZOOM_EASE_MS`, holds, and ramps back over the last `ZOOM_EASE_MS`. In `no-cam-blur-fill` the zoom applies to the foreground region's source (the full frame), and in `no-cam-fill` to its only region. A zoom during `focus` does nothing.
- Active `shake` → every region's crop is scaled by `SHAKE_SCALE` (on top of any zoom) and offset by a deterministic decaying jitter: `amp(t) = A * (1 - p)` with `p` = progress 0..1, `A` = 3 % (light) / 6 % (strong) of crop size, direction from `sin`/`cos` of `t` at ~25 Hz with different phases for x and y. Clamp inside the region's pre-shake crop. Must be a pure function of `tMs` (no randomness) so preview and render agree.

- [ ] **Step 1: Write failing tests:** `no events reproduces planLayout`, `focus switches to a full-frame webcam region`, `focus is ignored without a webcam`, `zoom midpoint crops to 1/scale around the focus point`, `zoom eases over 150 ms` (at +75 ms the scale is ~1.2 for a 1.4 zoom), `zoom clamps near frame edges` (focus {x:1,y:1} stays inside), `zoom inside focus has no effect`, `shake stays inside the original crop and is deterministic` (same t → same frame; amplitude at 90 % progress < at 10 %).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `frameAt` in `features/effects/frame.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(effects): frameAt shared frame function`

---

### Task 3: Automatic placement planner

**Files:**

- Create: `features/effects/planner.ts`
- Test: `features/effects/effects.test.ts` (`describe("planEffects")`)

**Interfaces:**

- Consumes: `SignalsData` (`features/analysis/schema.ts`; `loudness` is per-`loudnessIntervalMs` LUFS, floor `LOUDNESS_FLOOR_LUFS`), `Word` (`features/transcription/schema.ts`), `Beat`, `Effect`, `normalizeEffects`.
- Produces:
  ```ts
  export type PlanInput = {
    startMs: number
    endMs: number
    hasWebcam: boolean
    signals: SignalsData
    words: readonly Word[]
    beats: readonly Beat[]
  }
  export function planEffects(input: PlanInput): Effect[]
  export const PLANNER = {
    screamAboveMedianLu: 8,
    strongAboveMedianLu: 14,
    screamFloorLufs: -18,
    jumpAfterQuietLu: 10,
    quietMs: 1500,
    focusLeadMs: 300,
    focusTailMs: 1500,
    zoomMs: 1500,
    shakeMs: 500,
    minGapMs: 3000,
    maxFocusShare: 0.4,
    maxShakes: 4,
    leadInMs: 500,
    beatSnapMs: 2500,
  } as const
  ```

Rules, in priority order:

1. Snap each beat to the highest-loudness window within ±`beatSnapMs`. Ties or flat audio → the speech-density window with the highest rate. Neither available → keep `ms`.
2. `reaction` beat → `focus` (if `hasWebcam`) from `snapped - focusLeadMs` to `snapped + focusTailMs`.
3. `weird` beat → `zoom` `zoomMs` long centred on the snapped time, with `focus` from the beat's `x,y`, converted from full-frame to gameplay-region coordinates by the caller (`service.ts` does the conversion; the planner takes already-converted `x,y`).
4. Screams: loudness windows ≥ clip median + `screamAboveMedianLu` and ≥ `screamFloorLufs` (merge adjacent windows into one peak) → `shake` `shakeMs` (strong if ≥ median + `strongAboveMedianLu`), plus `focus` as in rule 2 if `hasWebcam` and no focus already covers it.
5. Only when there are no beats: a window ≥ `jumpAfterQuietLu` above the mean of the preceding `quietMs` → `zoom` on the centre.
6. Apply the caps from Global Constraints, keeping higher-priority events, then `normalizeEffects`.

- [ ] **Step 1: Write failing tests** with synthetic signals (helper `signalsWith(peaks: {ms, lufs}[], base=-30)` at 250 ms intervals):
  - `scream gives a strong shake and a focus with a webcam`
  - `scream gives only a shake without a webcam`
  - `reaction beat snaps to the nearby loudness peak` (beat 10 000, peak 11 500 → focus 11 200–13 000)
  - `weird beat becomes a zoom at its focus point`
  - `loudness jump after quiet gives a centred zoom only when there are no beats`
  - `respects caps` (10 screams in a 30 s clip → ≤ 4 shakes, focus ≤ 40 %, starts ≥ 3 s apart)
  - `leaves the first 500 ms alone unless a beat is there`
  - `3 s clip that is loud throughout yields valid, non-overlapping events`
  - `flat audio and no beats yields no events`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `planEffects` with the `PLANNER` constants.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(effects): automatic effect placement`

---

### Task 4: Beats from the visual review, auto tracks at selection

**Files:**

- Modify: `features/highlights/types.ts` (`rawCandidateSchema` gets `beats: z.array(beatSchema).optional()`), `features/highlights/review.ts` (`REVIEW_SYSTEM_PROMPT`, `applyReviews`), `features/highlights/postprocess.ts` (carry and re-clip `beats` when a candidate's range moves), `features/pipeline/steps/select.ts` (~L121–135)
- Create: `features/effects/service.ts`
- Test: `features/highlights/review.test.ts`, `features/highlights/postprocess.test.ts`, `tests/integration/select-step.test.ts`

**Interfaces:**

- Consumes: `planEffects`, `Beat`, `ClipEffects`; `layoutRepository`, analysis signals repository (`features/analysis/repository.ts`), `transcriptRepository` + `speakerTranscriptWords`.
- Produces:

  ```ts
  // features/effects/service.ts
  import "server-only"
  export async function autoEffectsFor(
    db: Db,
    projectId: string,
    clips: readonly Pick<
      Clip,
      "id" | "startMs" | "endMs" | "beats" | "layoutOverride"
    >[]
  ): Promise<Map<string, ClipEffects>>
  ```

  This loads signals, words and the project layout once. Each clip uses its override, and `hasWebcam = usesWebcam(mode) && webcamRect`. It converts beat `x,y` from full frame to gameplay-region coordinates (clamped 0–1) and returns `{ events: planEffects(...), edited: false }`.

- [ ] **Step 1: Write failing tests:**
  - `review.test.ts`: `applyReviews keeps beats inside the reviewed range and drops the rest`. Also `reviewResponseSchema accepts candidates without beats`.
  - `postprocess.test.ts`: `beats survive postprocessing and are dropped when the range no longer contains them`.
  - `select-step.test.ts`: `stores beats and an auto effect track when autoEffects is on`, and `leaves effects null when autoEffects is off`. Use the existing fake selector/reviewer setup in that file; give the fake reviewer one `reaction` beat.
- [ ] **Step 2:** Run `pnpm vitest run features/highlights tests/integration/select-step.test.ts` → FAIL.
- [ ] **Step 3:** Implement the code:
  - Add to `REVIEW_SYSTEM_PROMPT`, as a new paragraph before "Return every candidate…": `- beats: up to 4 moments, each { ms, kind }. "reaction" where the streamer's face in the webcam visibly reacts (shock, laughter, screaming); "weird" where something strange or impactful happens in the game, with x and y (0–1 of the full frame) for where on screen. Use frame times.`
  - In `select.ts`, persist `beats`. Then, when `settings.autoEffects`, call `autoEffectsFor` on the inserted clips and update each clip's `effects`. Keep it in the same step, after the insert and before `completeStep`.
- [ ] **Step 4:** Run → PASS. Then `pnpm test`.
- [ ] **Step 5: Commit** `feat(highlights): review marks reaction beats and selection places effects`

---

### Task 5: Render effects in ffmpeg

**Files:**

- Create: `features/render/effects-graph.ts`
- Modify: `features/pipeline/steps/render-clip.ts` (graph construction ~L104–112, cleanup in `finally`), `features/render/filtergraph.ts` only if a shared helper must be exported
- Test: `features/render/render.test.ts` (+ new golden in `features/render/__golden__`), `tests/integration/render.test.ts`
- Docs: ADR in `docs/DECISIONS.md` for the mechanism chosen in Step 1

**Interfaces:**

- Consumes: `frameAt`, `Frame`, `verticalGraph`, `seekFor`, `Subtitles`, `outputFps`.
- Produces:

  ```ts
  export function effectCommands(args: {
    layout: LayoutInput
    source: { width: number; height: number }
    events: readonly Effect[]
    startMs: number
    endMs: number
    fps: number
  }): string
  export function effectsGraph(args: {
    layout: LayoutInput
    source: { width: number; height: number }
    events: readonly Effect[]
    startMs: number
    endMs: number
    fps: number
    commandsFile: string
    subtitles?: Subtitles
  }): string
  ```

  `render-clip.ts` uses `verticalGraph` when `clip.effects` is null or has no events, and `effectsGraph` otherwise.

- [ ] **Step 1: Spike (throwaway, in the scratchpad).** Using `FFMPEG_PATH` and `pnpm fixtures` output, render 5 s of a fixture with a zoom 1→1.4→1 and a shake, using per-output-frame values sampled from `frameAt`. Try in order:
  - **(a)** `sendcmd` driving `crop` `w/h/x/y` on an input upscaled ×2 (`scale=iw*2:ih*2:flags=bicubic`), followed by a fixed `scale` to the region's output size.
  - **(b)** `zoompan` with `d=1` and per-frame `z/x/y` expressions built as piecewise `if(between(on,...))` chains.

  For focus, use the stacked graph plus a full-frame cam branch `overlay`'d with `enable='between(t,a,b)'`. Pick the option that is smooth to the eye (no 1-px stepping on the slow ease), whose sampled frames match `frameAt` within 2 px, and whose render time is ≤ 1.5× the plain graph on a 30 s clip. Record the choice, timings and the reason in a new ADR. Delete the spike.

- [ ] **Step 2: Write failing tests:**
  - `render.test.ts`: `effectsGraph golden for zoom+shake+focus on cam-top` (new golden file). `clip without effects uses the unchanged verticalGraph golden` (existing golden must still pass untouched). `effectCommands emits one entry per output frame where values change and none when idle`.
  - `tests/integration/render.test.ts`: `renders a focus range as webcam content`. Render a fixture clip with a `focus` event and extract a frame inside the range (`ffmpeg -ss … -frames:v 1`). Assert the mean colour of the middle band matches the fixture's webcam patch, the same way the existing caption-band test samples pixels. A second assertion: a frame outside the range still shows the stacked layout. A third: the same clip with a no-cam `layoutOverride` renders the no-cam layout inside the focus range (Review Focus 2).
- [ ] **Step 3:** Run `pnpm vitest run features/render` → FAIL.
- [ ] **Step 4:** Implement `effects-graph.ts` with the mechanism from Step 1. Write the commands file with the other work files (`workKey("cmds.txt")`) in `render-clip.ts`, and remove it in `finally`.
- [ ] **Step 5:** Run `pnpm vitest run features/render && pnpm test:integration` → PASS.
- [ ] **Step 6: Commit** `feat(render): burn clip effects into vertical renders`

---

### Task 6: Saving effects, reset to auto, setting re-run

**Files:**

- Modify: `features/clips/service.ts` (`saveClipEdit` ~L95–120), `features/clips/actions.ts`, `features/projects/rerun.ts` (`AFFECTS.render` gets `"autoEffects"`), `features/projects/settings-service.ts` (render branch ~L37–60)
- Test: `tests/integration/clip-editing.test.ts`, `tests/integration/project-settings.test.ts`, `features/projects/rerun.test.ts`

**Interfaces:**

- Consumes: `normalizeEffects`, `autoEffectsFor`, `clipEditSchema.effects`.
- Produces:
  ```ts
  export async function resetClipEffectsAction(
    projectId: string,
    clipId: string
  ): Promise<Result<ClipEffects>>
  ```
  This action is in `features/clips/actions.ts` and follows the existing action pattern.

Save rules:

- Incoming `effects` with `edited: true` → `normalizeEffects` to the new range, then store.
- Incoming `effects` with `edited: false` (or `null` with autoEffects on) and a range that changed → replan with `autoEffectsFor`.
- `null` stays `null` when autoEffects is off.
- A rendered clip still moves to `approved` (existing behaviour).

On the settings re-run when `autoEffects` changes:

- On → generate a track for every clip whose effects aren't `edited`.
- Off → set those to `null`.
- Then re-render the `rendered` clips as the render re-run does today. `rerunStepFor` must offer "render" even with zero rendered clips when `autoEffects` changed. In that case it updates tracks without enqueuing renders.

- [ ] **Step 1: Write failing tests:**
  - `clip-editing.test.ts`: `edited effects are clipped to a new trim`, `trimming an auto track replans it`, `resetClipEffects replans from stored beats and clears edited`, `saving effects moves a rendered clip back to approved`.
  - `rerun.test.ts`: `autoEffects change asks for the render step`.
  - `project-settings.test.ts`: `turning autoEffects off clears only unedited tracks`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(clips): save, reset and re-run clip effects`

---

### Task 7: Shared clip preview driven by `frameAt`

**Files:**

- Modify: `components/projects/vertical-preview.tsx` (`drawPreview` → draws `frameAt` regions; `VerticalPreviewCanvas` gets `effects?: readonly Effect[]`)
- Create: `components/projects/clip-preview.tsx` (move `ClipPreview` out of `clip-editor.tsx` ~L146–181 and add an `effects` prop)
- Modify: `components/projects/clip-editor.tsx` (import the moved component)
- Test: `components/projects/clip-preview.test.tsx`

**Interfaces:**

- Consumes: `frameAt`, `Frame`.
- Produces: `export function ClipPreview(props: { layout: LayoutInput; effects?: readonly Effect[]; pages: CaptionPage[]; startMs: number; captionStyle: CaptionStyle; captionsEnabled: boolean; className?: string })`

`drawPreview` draws each region with `drawImage(video, crop…, dest * canvasScale)`. Blur regions use the existing `blur(6px) brightness(0.85)` filter. The canvas redraws on `currentMs` changes, which the player already updates on `requestAnimationFrame`.

- [ ] **Step 1: Write failing test** `clip-preview.test.tsx`: mock `HTMLCanvasElement.getContext` and record `drawImage` calls. `draws one full-canvas webcam region while a focus event is active`, and `draws the stacked layout outside it`. Drive `currentMs` through the existing `VideoPlayerProvider` test utilities, as in `components/ui/video-player.test.tsx`.
- [ ] **Step 2:** Run `pnpm test:unit` → FAIL.
- [ ] **Step 3:** Implement and move the component. The editor still renders identically when there are no effects.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(preview): vertical preview follows clip effects`

---

### Task 8: `TimelineTrack`, generic draggable blocks

**Files:**

- Create: `components/ui/timeline-track.tsx`, `components/ui/timeline-track.test.tsx`
- Modify: `app/dev/components/…` (add an example next to the Timeline one), `docs/COMPONENTS.md`

**Interfaces:**

- Produces (shadcn-style, composable):
  ```tsx
  <TimelineTrack durationMs aria-label className>             // data-slot="timeline-track", positions children by ms
    <TimelineBlock startMs endMs onChange={(start, end) => void} minMs={100} stepMs={100}
                   selected onSelect variant="default|muted" resizable aria-label>{children}</TimelineBlock>
  </TimelineTrack>
  ```
- Dragging the body moves the block. Dragging either edge resizes it when `resizable`. With keyboard focus, ←/→ moves by `stepMs`, Shift+←/→ resizes the end, and Delete/Backspace calls `onDelete` if given. The block is clamped to `[0, durationMs]` and keeps ≥ `minMs`. Use pointer capture, the same approach as `components/ui/crop-region-editor.tsx`. It's controlled only, since its parent owns the events.

- [ ] **Step 1: Write failing tests:** `renders blocks at their ms positions`, `dragging moves and reports new range` (fireEvent pointer events with a mocked track `getBoundingClientRect`), `edge drag resizes and respects minMs`, `arrow keys move by stepMs`, `Delete calls onDelete`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Add the dev example and the COMPONENTS.md entry.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(ui): timeline track with draggable blocks`

---

### Task 9: Effects lane in the clip editor

**Files:**

- Create: `components/projects/effects-lane.tsx`, `components/projects/effects-lane.test.tsx`
- Modify: `components/projects/clip-editor.tsx` (state `effects`, lane below `TrimTimeline` ~L367, include `effects` in `updateClipAction` payload ~L298, "Reset to auto" button calling `resetClipEffectsAction`, zoom focus point set by clicking the preview), `features/projects/queries.ts` (clip editor data includes `effects`)

**Interfaces:**

- Consumes: `TimelineTrack`/`TimelineBlock`, `ClipPreview`, `Effect`, `ClipEffects`, `resetClipEffectsAction`.
- Produces: `export function EffectsLane(props: { startMs: number; endMs: number; events: Effect[]; hasWebcam: boolean; currentMs: number; onChange(events: Effect[]): void })`

Behaviour:

- There are three rows, Full cam / Zoom / Shake, so overlapping kinds stay visible. The block colours use design tokens (`chart-*` or `primary`/`accent`; no raw colours).
- `focus` blocks are `variant="muted"` with a tooltip "No webcam in this layout" when `!hasWebcam`.
- Selecting a block opens a Popover (shadcn `popover`; add it with `pnpm dlx shadcn@latest add popover` if it's missing). It holds scale (Slider 1.1–2.0) for zoom, a light/strong ToggleGroup for shake, and Delete.
- "Add at playhead" buttons create Full cam 2000 ms, Zoom 1500 ms (scale 1.4, centre) or Shake 500 ms (light) at `currentMs`, normalised. Full cam is disabled without a webcam.
- Any lane change sets `edited: true` in the editor state. When a zoom is selected, clicking the preview sets its `focus` from the click position in gameplay-region coordinates.
- If the clip's `effects` is null, the lane shows an empty state with "Add effects automatically" (calls `resetClipEffectsAction`).

- [ ] **Step 1: Write failing tests** (`effects-lane.test.tsx`): `adds a zoom at the playhead`, `deleting a block removes the event`, `full cam add is disabled without a webcam`, `changing shake intensity updates the event`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the lane and wire it into the editor.
- [ ] **Step 4:** Run `pnpm test:unit && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(editor): edit clip effects on a lane`

---

### Task 10: Clips grid and clip player

**Files:**

- Create: `components/projects/clips-grid.tsx`, `components/projects/clip-player-dialog.tsx`, `components/projects/clips-grid.test.tsx`
- Modify: `components/projects/clips-review.tsx` (keep `ExportPanel`, the rejected toggle and "Find more highlights"; replace the source player + `ClipCard` list with a compact source `Timeline` strip (no player) and `ClipsGrid`), `features/projects/queries.ts` (`getProjectClips` adds `layout` (project layout), per-clip `effects`, and per-clip caption `pages` and resolved `captionStyle`, computed with the same helpers `render-clip.ts` uses), `app/(app)/projects/[id]/clips/page.tsx` (pass the new props)

**Interfaces:**

- Consumes: `ClipPreview`, `setClipStatusAction`, existing `renders` map, proxy `src`.
- Produces:
  ```tsx
  export function ClipsGrid(props: {
    projectId: string
    src: string
    clips: Clip[]
    renders: Record<string, RenderLinks>
    layout: LayoutInput
    captions: Record<string, { pages: CaptionPage[] }>
    captionStyle: CaptionStyle
    captionsEnabled: boolean
  })
  export function ClipPlayerDialog(props: {
    open: boolean
    onOpenChange(open: boolean): void
    clips: Clip[]
    index: number
    onIndexChange(i: number): void /* + same data props as ClipsGrid */
  })
  ```

Behaviour:

- The grid is `<ol aria-label="Clips">` with 2 columns by default, `sm:3`, `lg:4`, `xl:5`. Each tile is an `aspect-[9/16]` button with:
  - a poster: `<video preload="metadata" src={render?.url ?? \`${src}#t=${start}\`}>`, the same pattern as `step-detail.tsx` L253
  - the title, status badge, duration and score
- On desktop hover, a rendered tile (`status === "rendered"` and `render` exists) plays its MP4 muted from 0, one at a time. Unrendered tiles stay on the poster.
- Click opens `ClipPlayerDialog` (shadcn `dialog`, already in `components/ui`). Inside it:
  - A current render plays in `VideoPlayer` with sound and loops.
  - Otherwise a `VideoPlayerProvider` with the proxy `src`, the existing `ClipLoop` behaviour (extract it from `clip-editor.tsx` to `clip-preview.tsx` and export it) and `ClipPreview` with effects and captions.
  - Approve / Reject (with the existing Undo toast logic, moved out of `ClipCard` into a small shared `useClipStatus(projectId, clip)` hook in `clips-grid.tsx`), Edit link, and Download when rendered.
  - Previous/Next buttons and ←/→ keys move through the visible clips.
- Clicking a range on the source strip opens that clip's dialog.

- [ ] **Step 1: Write failing tests** (`clips-grid.test.tsx`):
  - `renders a tile per visible clip`
  - `clicking a tile opens the player for that clip`
  - `arrow keys move to the next clip`
  - `an approved clip with an old render plays the live preview, not the MP4` (Review Focus 5)
  - `reject shows an undo toast`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement and remove the dead `ClipCard`/source-player code from `clips-review.tsx`.
- [ ] **Step 4:** Run `pnpm test:unit && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5: Commit** `feat(clips): clips grid with a per-clip player`

---

### Task 11: End-to-end tests and docs

**Files:**

- Modify: `tests/e2e/clips.spec.ts` (replace the "Preview" + source-timeline assertions with grid → dialog → Approve), add an editor case: open Edit, "Add at playhead" Zoom, save, reload, and the zoom block is still on the lane; keep `expectNoSeriousA11yViolations` on the clips page and with the dialog open
- Modify: `docs/PIPELINE.md` (select step places effects; render step burns them), `docs/BUSINESS_LOGIC.md` (effect rules, planner caps, beat snapping), `docs/PROGRESS.md` (new "Phase 26: Clip effects and clips grid" with `[x]` items, plus `[ ] Check auto effects on a real GTA stream and tune PLANNER constants`), `docs/DECISIONS.md` (ADR-0053 "Clip effects share one frame function"; the Task 5 ffmpeg ADR is ADR-0054, or merge them)

- [ ] **Step 1:** Update the e2e specs and run `pnpm test:e2e` → PASS (fix failures in the owning task's code).
- [ ] **Step 2:** Write the docs.
- [ ] **Step 3:** Run the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` → all PASS.
- [ ] **Step 4: Commit** `docs: clip effects and clips grid`
- [ ] **Step 5:** Check it by hand. With `pnpm dev`, open a real project's clips page and confirm that:
  - the tiles play
  - the dialog loops one clip
  - the editor lane edits show in the preview
  - a rendered clip shows the same effects as its preview

  Report the result honestly in PROGRESS.md.
