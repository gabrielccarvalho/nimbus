# Components

## shadcn-first rule

Before building any UI element:

1. **Search.** `components/ui/` first, then the registry: `pnpm dlx shadcn@latest search @shadcn -q <term>`, `view`, and the official blocks (e.g. `sidebar-07`).
2. **Install** with `pnpm dlx shadcn@latest add <name>`. Don't hand-copy. Don't edit generated files unless needed; if you do, log the change under "Modified generated files" below.
3. **Otherwise build it shadcn-style**, in `components/ui/` (generic primitive) or `components/<domain>/` (app composite):
   - One file per component exporting composable parts (`Dropzone`, `DropzoneTrigger`, `DropzoneContent`…).
   - Mirror the existing files exactly: plain function components, `data-slot="<name>"` on every part, `cn()` from `@/lib/utils`, `className` merged last, `...props` spread onto the underlying element.
   - Variants with `cva` (`variant`, `size`, `defaultVariants`), exported as `<name>Variants`.
   - Interactive behavior on **Base UI** primitives (`@base-ui/react/*`), the library this preset uses. Polymorphism via Base UI's `render` prop (Base UI's equivalent of Radix `asChild`).
   - Tokens only. No hard-coded colors.
   - Stateful components support controlled and uncontrolled use: `value` / `defaultValue` / `onValueChange`.
   - Ship a test, an entry below, and an example on `/dev/components`.

## Installed shadcn components

Installed with `pnpm exec shadcn add` (style `base-nova`, Base UI). Generated files import `cn` from the `cn` package; custom primitives in `components/ui/` do the same so they read identically.

alert, alert-dialog, badge, breadcrumb, button, card, dialog, dropdown-menu, empty, field, input, input-group, item, kbd, label, progress, radio-group, scroll-area, select, separator, sheet, sidebar (+ `hooks/use-mobile.ts`), skeleton, slider, sonner, spinner, stat-card*, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

\* custom, see below.

The registry's `empty` component covers the planned EmptyState, so there is no custom EmptyState.

## Custom components

### StatCard (`components/ui/stat-card.tsx`)

Labeled metric tile, rendered as a `<dl>` group so label/value pairs are announced as term/definition.

- Parts: `StatCardGroup` (`dl` grid), `StatCard` (`div`, the wrapper HTML allows inside `dl`), `StatCardLabel` (`dt`, holds the text and an optional `StatCardIcon`), `StatCardIcon` (decorative, `aria-hidden`), `StatCardValue` (`dd`, heading font, tabular numbers), `StatCardDescription` (`dd`). `dt`/`dd` must be direct children of `StatCard` for valid `dl` structure.
- Variants: `variant` = `default` | `muted` | `ghost`; `size` = `default` | `sm`.

```tsx
<StatCardGroup>
  <StatCard size="sm">
    <StatCardLabel>
      <span className="truncate">Duration</span>
      <StatCardIcon>
        <ClockIcon />
      </StatCardIcon>
    </StatCardLabel>
    <StatCardValue>1:02:44</StatCardValue>
  </StatCard>
</StatCardGroup>
```

### Dropzone (`components/ui/dropzone.tsx`)

File drop target that also opens the native picker.

- Parts: `Dropzone` (root, `role="button"`), `DropzoneIcon`, `DropzoneTitle`, `DropzoneDescription` (wired to `aria-describedby`). `useDropzone()` exposes `{ dragging, disabled, open }`.
- Props: `accept` (mime, `type/*` or `.ext`), `maxSize`, `multiple`, `disabled`, `onFilesAccepted(files)`, `onFilesRejected([{ file, reason: "type" | "size" | "count" }])`, `inputProps`, `size` = `default` | `sm`.
- State: `data-dragging` on the root for styling. It holds no value state, so there's no controlled/uncontrolled API; the caller owns what happens to accepted files.
- A11y: focusable, Enter/Space open the picker, `aria-disabled` + `tabIndex=-1` when disabled, constraints read via the description.

### VideoPlayer (`components/ui/video-player.tsx`)

Composable `<video>` player with frame-accurate time for transcript and caption sync.

- Parts: `VideoPlayerProvider` (state only), `VideoPlayer` (focusable `role="group"` frame; creates its own provider when none is above it), `VideoPlayerVideo`, `VideoPlayerControls`, `VideoPlayerPlayButton`, `VideoPlayerSeekBar` (shadcn `Slider`, in seconds so `aria-valuetext` reads "12.4 sec"), `VideoPlayerTime`, `VideoPlayerMuteButton`. `useVideoPlayer()` exposes `{ currentMs, durationMs, paused, muted, play, pause, toggle, seek, setMuted }`.
- Props: `aspect` = `video` | `vertical` | `auto`, `muted` / `defaultMuted` / `onMutedChange` (controlled or uncontrolled), `onTimeUpdate(ms)`.
- State: playback time belongs to the media element, so it's read-only from outside: observe it with `onTimeUpdate` and drive it with `seek()`. While playing, time is sampled every animation frame (`timeupdate` alone fires only ~4×/s, too coarse for word highlighting).
- Keyboard (frame focused): Space/K play-pause, ←/→ ±1 s (Shift ±5 s), J/L ±5 s, M mute.
- Put the provider above the player when siblings need the same state, e.g. the transcript list:

```tsx
<VideoPlayerProvider>
  <VideoPlayer aria-label="Source video">
    <VideoPlayerVideo src={src} />
    <VideoPlayerControls>
      <VideoPlayerPlayButton />
      <VideoPlayerSeekBar />
      <VideoPlayerTime />
      <VideoPlayerMuteButton />
    </VideoPlayerControls>
  </VideoPlayer>
  <TranscriptPanel />
</VideoPlayerProvider>
```

### Timeline (`components/ui/timeline.tsx`)

Horizontal time strip for a whole recording: loudness, silences, clip ranges and a playhead.

- Parts: `Timeline` (root), `TimelineLoudness` (SVG area from normalized 0–1 values), `TimelineRange` (`variant` = `silence` | `clip` | `selected`, positioned by `startMs`/`endMs`), `TimelinePlayhead`. `useTimeline()` exposes `{ durationMs, value, toPercent }`.
- Props: `durationMs`, `value` / `defaultValue` / `onValueChange` (ms, controlled or uncontrolled), `step` (default 1000 ms), `readOnly`.
- A11y: interactive timelines are a `role="slider"` with `aria-valuetext` like "0:08 of 1:00". ←/→/↑/↓ move by `step` (Shift ×10), PageUp/PageDown ×10, Home/End jump to the ends. Pointer down/drag seeks. `readOnly` renders `role="img"`, so give it an `aria-label` that states what it shows.
- Pair it with `VideoPlayerProvider` to sync with playback: `value={currentMs} onValueChange={seek}`.

```tsx
<Timeline
  aria-label="Timeline"
  durationMs={durationMs}
  value={currentMs}
  onValueChange={seek}
>
  <TimelineLoudness values={loudness} />
  <TimelineRange variant="silence" startMs={4000} endMs={6000} />
  <TimelinePlayhead />
</Timeline>
```

### CaptionPreview (`components/ui/caption-preview.tsx`)

A 9:16 frame that shows the caption page at a given time, styled like the burned-in ASS output.

- Parts: `CaptionPreview` (frame; a size container, so text scales with its width; put a background image or canvas inside), `CaptionPreviewText` (`pages`, `currentMs`, `captionStyle`, `baseline` 0–1 of the height).
- Sizes are in 1080-wide output pixels and converted with `cqw`, so a 220 px preview matches the 1080 px render. `cssCaptionStyle()` from `features/captions/styles.ts` turns a caption preset into `captionStyle`.
- The highlight is a color change only (no motion). The text is real DOM text, so it's readable by screen readers.

```tsx
<CaptionPreview className="w-56">
  <CaptionPreviewText
    pages={pages}
    currentMs={currentMs}
    captionStyle={cssCaptionStyle(style)}
    baseline={0.72}
  />
</CaptionPreview>
```

### CropRegionEditor (`components/ui/crop-region-editor.tsx`)

A movable, resizable rectangle over an image or video, in normalized 0–1 frame coordinates. Used to mark the webcam.

- Parts: `CropRegionEditor` (root/frame; put the media inside it), `CropRegion` (the rectangle with corner handles). `useCropRegionEditor()` exposes `{ value, commit, disabled }`. `moveRect`/`resizeRect` are the pure clamping helpers.
- Props: `value` / `defaultValue` / `onValueChange` (`{ x, y, w, h }`, controlled or uncontrolled), `disabled`. Minimum size is 5% of the frame and the rect never leaves it.
- A11y: the region is a focusable `role="group"` with `aria-roledescription="crop region"` and a description of its position ("Left 78%, top 77%, 20% wide, 20% tall"). Arrow keys move by 0.5% of the frame, Shift+arrow by 5%, Alt+arrow resizes from the bottom-right corner. Corner handles are pointer-only.

```tsx
<CropRegionEditor value={rect} onValueChange={setRect} className="aspect-video">
  <video src={src} className="size-full" />
  <CropRegion aria-label="Webcam region" />
</CropRegionEditor>
```

## Modified generated files

- `hooks/use-mobile.ts`: rewritten with `useSyncExternalStore`. The generated version set state inside an effect, which fails the React Compiler lint rule `react-hooks/set-state-in-effect`. Same API (`useIsMobile(): boolean`).
