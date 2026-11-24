# Editable gameplay box

## Why

In the clip editor, the camera box can be dragged and resized, but the dashed gameplay box is display-only. In the layout step, the only control is the "Gameplay focus" slider, which moves it sideways. The user wants to control the gameplay box the same way as the camera box, on the clip edit screen in particular.

## What

- The dashed gameplay box becomes an editable region on the source video, in the clip editor (writes the clip's layout override) and the layout step (writes the project layout). It can be dragged, resized from its corners and moved with the keyboard, the same as the camera box. The vertical preview updates live.
- **The box's shape is locked to the slot it fills** (1080×1248 in cam-top, 1080×960 in 50/50, 1080×1920 in no-cam-fill), so what's inside the box is exactly what's on screen. Resizing keeps that shape, and the box can't leave the frame.
- It's stored in the existing `gameplayRect`. A rect whose shape matches the slot passes through `coverCrop` unchanged, so there's no schema or render change. When the user edits the box, `gameplayFocusX` resets to 0.5, so Full game shows the centre of the box.
- Switching layout mode refits the box to the new slot shape around its centre, staying inside the frame.
- There's no box in no-cam-blur-fill, which shows the whole frame.
- The "Gameplay focus" slider is removed from the layout step, because the box replaces it.
- Existing layouts look the same: the box starts at today's effective crop, `coverCrop(gameplayRect, slot, gameplayFocusX)`.

## How

- `components/ui/crop-region-editor.tsx` supports more than one region: `CropRegion` takes an optional controlled `value`/`onValueChange` (falling back to the editor's value) and an optional `aspectRatio` (output pixels w/h) that locks resizing, including Alt+arrow. A region can drop the darkening shadow (via className), so two regions don't stack overlays.
- Pure geometry helpers in `features/layout/geometry.ts`:
  - the effective gameplay box as a normalised rect
  - the slot aspect for a layout
  - fitting a rect to an aspect around its centre inside the frame

## Approaches considered

- **Shape-locked box stored in `gameplayRect` (picked):** what you see is what you get, with no schema or render change.
- **Free-shape box:** the render would cover-crop it, so parts the user framed would silently disappear. Rejected.
- **New fields (offset and zoom):** they duplicate `gameplayRect`. Rejected.
