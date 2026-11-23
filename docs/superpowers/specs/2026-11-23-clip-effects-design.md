# Clip effects and a clips grid

## Why

Rendered clips use one fixed layout for their whole length: webcam stacked over gameplay (or gameplay only), then captions. Shorts that perform are edited around the moment. The frame goes full-screen on the streamer's face when the face is the reaction, punches in on the game when something weird happens, and shakes when the streamer screams. The goal is clips that hold attention the same way, placed automatically and fixable by hand.

The clips page has the same problem: it shows the whole source video, and "Preview" seeks into it. The user wants to see and play each clip as the short it will become, without opening the editor.

## Goals

- Each clip has an **effect track**: timed events that change what's on screen. The pipeline places them automatically. The editor shows them on a lane and lets the user move, resize, delete and add them.
- One pure function decides what's on screen at any time. The ffmpeg render and the browser preview both use it, so the preview matches the export.
- The clips page becomes a grid of 9:16 tiles. Clicking a tile plays only that clip, with the effects, and the approve/reject/edit/download actions sit next to it.

## Non-goals (for now)

- Transitions between clips, sound effects, emoji/stickers, speed ramps, freeze frames, colour grading, text pop-ups other than captions.
- Local face/emotion detection models. Expressive-face moments come from Claude's frame review and from audio.
- Changing how highlights are chosen.

## Anti-goals

- **Effect spam.** A clip that zooms or shakes every second is worse than a plain one. Auto placement is sparse by default.
- **A preview that lies.** If the preview and the render disagree, the editor is useless.
- **Slower renders.** A clip with effects shouldn't render meaningfully slower. Use at most a small constant factor over today's graph.

## Approaches considered

- **A. Shared frame function (picked).** Every effect is expressed as a change in the crop/layout over time. A pure `frameAt(t)` turns the track into regions and crops. ffmpeg follows the same keyframes, and the canvas preview draws `frameAt` live. You get instant feedback while editing. The cost is a more involved filtergraph and a canvas preview that runs every frame.
- **B. Worker renders all previews.** Single implementation, but every edit waits for a low-res render, and unrendered clips can't play in the grid.
- **C. Browser composition engine** (Remotion-style) for both preview and export. Most flexible, but it throws away the ffmpeg render, the ASS captions and the golden tests.

The user picked A, with effects placed automatically and then editable.

## Effects (v1)

All effect times are **absolute source milliseconds**, the same as `clip.startMs/endMs`. That way trimming a clip keeps the effects where they are in the recording. Events that end up outside the clip are dropped on save, and events that cross a boundary are clipped to it.

| Kind    | What it does                                                                                                           | Fields                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `focus` | For its range, replaces the stacked layout with the webcam filling 9:16                                                | `startMs`, `endMs`                                                                                                 |
| `zoom`  | Punches in on the gameplay region (or on the full frame in no-cam layouts): eases in ~150 ms, holds, eases out ~150 ms | `startMs`, `endMs`, `scale` (1.1–2.0, default 1.4), `focus: {x, y}` in 0–1 of the gameplay region (default centre) |
| `shake` | Decaying jitter of the whole output frame                                                                              | `startMs`, `endMs` (typ. 300–800 ms), `intensity: "light" \| "strong"`                                             |

Rules:

- `focus` is only offered when the layout has a webcam. If a clip's layout later loses its webcam, `focus` events are kept but `frameAt` ignores them and the editor shows them greyed out. Switching the webcam back on restores them.
- My call: there's no "full game" focus in v1. In a stacked layout a 9:16 cover crop keeps only about a third of a 16:9 game's width, and a zoom on the gameplay region already covers "something weird happens". It can be added later as a blur-fill variant.
- Events of the same kind don't overlap. A `zoom` inside a `focus: cam` range has no effect, and the planner doesn't create one. A `shake` can sit on top of anything.
- Captions stay where they are. They're burned on top of the final frame and don't shake or zoom.

Stored on the clip as a new nullable jsonb column `effects`: `{ events: Effect[], edited: boolean }`, validated by a zod schema in `features/clips/schema.ts` (or a new `features/effects/` module, the builder decides). `null` means effects were never generated, and the clip renders exactly as today. `edited: true` means the user changed the track.

## Automatic placement

There's a pure planner, `planEffects(input) → Effect[]`, unit tested, with these inputs:

- the clip range and layout (whether a webcam exists)
- signals already stored by analysis: `loudness` (250 ms windows), `speechDensity`, `cuts`, silences
- transcript words in range (for laughter, exclamations and repeated words; reuse the existing signal helpers in `features/highlights/` where possible)
- **beats** from Claude's review, when available (below)

Starting rules (constants, tunable):

- **Scream/shout:** a loudness peak well above the clip's own median (and above an absolute floor) → a `shake` (strong if extreme) at the peak. With a webcam, it also gets a `focus: cam` from ~0.3 s before the peak to ~1.5 s after.
- **Reaction beat** from Claude → `focus: cam` around it.
- **Weird/payoff beat** from Claude → `zoom` at that time, using Claude's focus point.
- **Heuristic fallback without beats:** a sudden loudness jump after a quiet stretch → `zoom` on the gameplay centre for ~1.5 s.
- **Density caps:** at most one `focus`/`zoom` event starting per ~3 s, `focus: cam` covers at most ~40 % of the clip, and no more than ~4 shakes per clip. The first ~0.5 s is left alone unless a beat lands there.

Claude review change: `reviewResponseSchema` gets an optional `beats: [{ ms, kind: "reaction" | "weird", x?, y? }]` per candidate. The prompt asks the model to mark where the streamer's face visibly reacts (the webcam is visible in the frames it already gets) and where something weird or impactful happens on screen. If possible, it also gives where on screen as 0–1 coordinates of the full frame, which the planner converts to the gameplay region. No extra frames or API calls. Review frames are seconds apart, so beats are hints, not timestamps. The planner snaps each beat to the strongest loudness or speech-rate peak within ±2.5 s, and uses the beat time as-is only when there's no peak (my call). Beats are stored with the clip (inside `effects` or a sibling column, the builder decides) so "Reset to auto" can rerun the planner without calling Claude again. Clips from the heuristic selector or with no review get audio-only placement.

When it runs:

- At the end of the select step, for every new candidate, behind a project setting `autoEffects` (default on). Changing it offers the usual "re-run what it affects". That only touches tracks whose `edited` is false: turning it on generates them, and turning it off sets them to `null`. As with caption-setting re-runs today, rendered clips whose track changed are re-rendered.
- Saving a trim on a clip whose track isn't `edited` re-runs the planner over the new range, and the track stays auto. Only changes to the events themselves set `edited: true`. On an edited track, a trim just drops or clips out-of-range events.
- Existing clips (`effects = null`): the editor shows "Add effects automatically". The planner is pure and cheap, so the server action computes it on demand.

## The shared frame function

There's a pure `frameAt(plan, events, tMs) → Frame`. `plan` comes from `planLayout`, and `Frame` lists the output regions, each with a source crop (float `PixelRect`) and a destination rect in the 1080×1920 output, plus a whole-frame shake offset. It lives next to `features/layout/geometry.ts` and is unit tested at boundaries, easing midpoints and overlaps.

- **Browser:** `VerticalPreviewCanvas` draws `frameAt(currentMs)`. The video player already updates `currentMs` on `requestAnimationFrame`, so it's smooth during playback.
- **ffmpeg:** the clip's filtergraph is generated from the same keyframes. Layout changes split the clip into segments (one per `focus` state) that are concatenated. Zoom and shake become per-frame crop position/size changes. **Which ffmpeg mechanism gives smooth, exact per-frame crops is left to the builder:** `crop` only re-evaluates x/y per frame, so the options are `zoompan` on an upscaled input, `sendcmd`/`crop` commands, or `scale`+`crop` tricks. Spike this first on the installed ffmpeg. The contract is a sampled frame from the render that matches `frameAt` within a couple of pixels, checked by an integration test (like the existing caption-band test): during a `focus: cam` range, the output is mostly webcam content.
- Golden tests in `features/render/__golden__` cover a graph with each effect kind.

## Clips page

The source player and the clip-card list are replaced by:

- **Grid** of 9:16 tiles (2 columns on phones, up to 5 on wide screens). Each tile shows a poster frame of the clip's first frame (reuse the proxy poster endpoint from Phase 24), the title, status badge, duration and score. Rejected clips stay hidden behind the existing "Show rejected" toggle. "Find more highlights", "Approve all" and the Export panel stay above the grid.
- **Hover (desktop)** plays a rendered tile's MP4 muted, one tile at a time. Unrendered tiles show only the poster on hover. The live preview (proxy video + canvas) runs only in the clip player, so the grid never holds more than one proxy decoder (my call).
- **Click** opens the clip player: a large 9:16 player in a dialog/sheet that loops only `[startMs, endMs]` with sound. Next/previous moves between clips (arrow keys too), and Approve / Reject (with the existing undo toast) / Edit / Download sit beside it.
- **What plays:** if the clip has a render that's current, the MP4. Otherwise the live preview: a hidden proxy `<video>` constrained to the clip range, drawn through `frameAt` on a canvas, with captions drawn as an approximate overlay. The ASS burn-in remains the source of truth, and the preview doesn't need to match the font rendering pixel for pixel. A render counts as current when the clip's status is `rendered`. The editor already moves an edited clip back to `approved`.
- My call: the source-wide timeline with the waveform is kept as a compact strip above the grid, with no player. Clicking a clip's range on it opens that clip. It's the only place the user sees where clips sit in the recording.

## Editor

- The preview canvas uses `frameAt`, so effects show while scrubbing and playing.
- An **effects lane** below the trim timeline, inside the clip range:
  - Each event is a coloured block by kind; shake is a narrow block.
  - Blocks can be dragged and their edges resized. Selecting one opens a small popover (scale / intensity, delete). The Delete key removes the selected event.
  - "Add at playhead" buttons for Full cam, Zoom and Shake.
  - For a selected zoom, clicking the preview sets its focus point.
- **Reset to auto** reruns the planner (with stored beats) and sets `edited: false`.
- Saving goes through the existing `clipEditSchema`/`saveClipEdit` path, extended with `effects`. Any change sets `edited: true`, drops out-of-range events, and moves a rendered clip back to `approved` (existing behaviour).
- New UI parts follow the shadcn-first rule. The lane is a custom shadcn-style component built on the existing `components/ui/timeline`, with a test, a `docs/COMPONENTS.md` entry and a `/dev/components` example.

## Constraints

- Architecture rules hold: the planner, `frameAt` and graph builders are pure and live in `features/*`. Rendering stays in the worker.
- A Drizzle migration adds the column(s). Nothing changes for clips with `effects = null`.
- New ADR in `docs/DECISIONS.md`, a PIPELINE.md/BUSINESS_LOGIC.md update, and a new phase in `docs/PROGRESS.md`.
- Gates: `pnpm lint`, `typecheck`, `test`, `test:e2e` (e2e covers grid → clip player → approve, and editor: add zoom, save, see it on the lane).

## Left to the builder

- The ffmpeg mechanism for per-frame zoom/shake (spike first; see above).
- The exact planner thresholds and easing curves, tuned on a real stream.
- Module placement (`features/effects/` vs inside `clips`/`layout`) and where beats are stored.
- Dialog vs sheet for the clip player, tile hover details and the lane's visual styling within the design system.
