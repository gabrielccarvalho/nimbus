# Full game effect

## Why

The clip effects have full cam (webcam fills the frame), zoom and shake. The user also wants the reverse of full cam: stretches where the webcam goes away and the gameplay fills the whole vertical frame.

## What

- A **Full game** effect. While it's active, the stacked layout is replaced by one gameplay region filling 1080×1920. That region is a 9:16 cover crop of the layout's `gameplayRect`, positioned by `gameplayFocusX`, so it's the same framing a no-cam-fill layout uses. Anything outside the slice is cropped. This look (option A) was the user's choice over a blurred-background version.
- It's modelled as a second target of the existing `focus` effect: `focus` gains `target: "cam" | "game"`, defaulting to `"cam"` so stored tracks keep working. Full cam and full game can never overlap, because same-kind events never overlap.
- Zoom still applies inside full game (it zooms the gameplay region, which is now the whole frame). Shake applies as everywhere else.
- Full game only takes effect on layouts with a webcam (cam-top, split-50). On no-cam layouts it's ignored like full cam without a webcam, and greyed out in the lane.
- Captions don't move.

## Where it shows up

- `frameAt` handles the new target. Preview and render get it from there, the same as every other effect.
- Render: the effects graph gets a full-game branch next to the full-cam one, overlaid in its ranges. Golden test, and an integration check that a frame inside a full-game range shows only gameplay content.
- Editor lane: a fourth row, "Full game", with its own colour token and an "Add at playhead" button (default 2000 ms). Blocks in the Full cam and Full game rows block each other when dragged or added, because they're one effect kind.
- Planner: unchanged. Full game is added by hand only, until it has been seen on a real stream.

## Approaches considered

- **Cover crop (picked):** big, punchy, matches no-cam-fill. Cuts off the sides.
- **Blurred background with the whole frame:** nothing is cut off, but the game ends up small. Rejected by the user.
- **A separate effect kind instead of a `focus` target:** the "no overlap with full cam" rule would need extra cross-kind code in normalisation, the planner and the lane. Rejected.

## Left to the builder

The colour token for the row, the exact copy, and where the branch sits in the graph code.
