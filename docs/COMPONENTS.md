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

alert, alert-dialog, badge, breadcrumb, button, card, command, dialog, dropdown-menu, empty, field, input, input-group, item, kbd, label, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, slider, sonner, spinner, stat-card*, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

\* custom, see below.

The registry's `empty` component covers the planned EmptyState, so there is no custom EmptyState.

## Custom components

### Tone (`components/ui/tone.ts`)

`toneVariants({ tone })` sets `--tone` to a crew colour as an rgb triple, so a component can use it at any alpha (`bg-[rgb(var(--tone))]`, `shadow-[0_0_10px_rgb(var(--tone)/0.7)]`). Tones mark status only: `amber` needs you, `lav` processing/selection/focus, `mint` ready/approved/on, `sky` exported, `pink` failed/destructive, `neutral` inactive.

### StatusPill (`components/ui/status-pill.tsx`)

Glass pill with a round tone dot and a short label (heycamps `ScorePill`). Polymorphic through `render`; `data-tone` reflects the tone. `ProjectStatusBadge` and `ClipStatusBadge` in `components/projects/status-badge.tsx` map statuses to tones.

```tsx
<StatusPill tone="amber">Needs you</StatusPill>
```

### SignalDot (`components/ui/signal-dot.tsx`)

Square 8px status dot (`size="sm"` is 6px). `lit` adds the glow and is reserved for the one thing that needs attention on a screen. Decorative (`aria-hidden`) unless `label` is set, which makes it `role="img"`.

### DotMeter (`components/ui/dot-meter.tsx`)

Ten round dots lit in proportion to `value / max` (`max` defaults to 10), clamped. Renders `role="meter"` with `aria-valuenow`/`aria-valuemax`; pass an `aria-label`.

```tsx
<DotMeter value={142} max={300} aria-label="Render minutes" />
```

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

- Parts: `Timeline` (root), `TimelineLoudness` (SVG area from normalized 0–1 values), `TimelineRange` (`variant` = `silence` | `clip` | `selected` | `audience` (a thin band along the top; set its `opacity` from the value), positioned by `startMs`/`endMs`), `TimelinePlayhead`. `useTimeline()` exposes `{ durationMs, value, toPercent }`.
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

### TimelineTrack (`components/ui/timeline-track.tsx`)

A lane of draggable blocks positioned by milliseconds, for editing time ranges (for example clip effects under a `Timeline`).

- Parts: `TimelineTrack` (`durationMs`; a `role="group"`, so give it an `aria-label`), `TimelineBlock` (`startMs`, `endMs`, `variant` = `default` | `muted`, `selected`, `resizable` (default true), `minMs` (default 100), `stepMs` (default 100), `onChange(startMs, endMs)`, `onSelect`, `onDelete`). `useTimelineTrack()` exposes `{ durationMs, trackRef }`.
- Blocks are controlled only: the parent owns the ranges and applies `onChange`. Ranges are clamped to `[0, durationMs]` and kept at least `minMs` long. Same-lane overlap rules belong to the parent.
- Pointer: dragging the body moves, dragging either edge resizes (pointer capture, like `CropRegionEditor`). Pointer down also calls `onSelect`.
- A11y: each block is a focusable `role="button"` with `aria-pressed` for selection, so give it an `aria-label`. ←/→ move by `stepMs`, Shift+←/→ resize the end, Enter/Space select, Delete/Backspace call `onDelete`.

```tsx
<TimelineTrack aria-label="Zoom" durationMs={durationMs}>
  <TimelineBlock
    aria-label="Zoom 1"
    startMs={block.startMs}
    endMs={block.endMs}
    selected={selectedId === block.id}
    onSelect={() => setSelectedId(block.id)}
    onChange={(startMs, endMs) => update(block.id, { startMs, endMs })}
    onDelete={() => remove(block.id)}
  >
    Zoom
  </TimelineBlock>
</TimelineTrack>
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

A movable, resizable rectangle over an image or video, in normalized 0–1 frame coordinates. Used to mark the webcam and the gameplay box.

- Parts: `CropRegionEditor` (root/frame; put the media inside it), `CropRegion` (the rectangle with corner handles). `useCropRegionEditor()` exposes `{ value, commit, disabled }`. `moveRect`/`resizeRect`/`resizeRectLocked` are the pure clamping helpers.
- Props: `value` / `defaultValue` / `onValueChange` (`{ x, y, w, h }`, controlled or uncontrolled), `disabled`. Minimum size is 5% of the frame and the rect never leaves it.
- Several `CropRegion`s can share one editor. A region given its own `value` + `onValueChange` is controlled independently of the editor's value; with a `value` and no `onValueChange` it is read-only (no handles, no focus stop, keys and drags ignored), like a disabled region. `aspectRatio` (pixel width / height) locks corner drags and Alt+arrow resizes to that ratio, converted with the frame's pixel size at interaction time. Style secondary regions with `className` (e.g. dashed border, no shadow).
- A11y: the region is a focusable `role="group"` with `aria-roledescription="crop region"` and a description of its position ("Left 78%, top 77%, 20% wide, 20% tall"). Arrow keys move by 0.5% of the frame, Shift+arrow by 5%, Alt+arrow resizes from the bottom-right corner. Corner handles are pointer-only.

```tsx
<CropRegionEditor value={rect} onValueChange={setRect} className="aspect-video">
  <video src={src} className="size-full" />
  <CropRegion aria-label="Webcam region" />
</CropRegionEditor>
```

## App shell (`components/app-shell/`)

App composites, not primitives; they read app data and routes.

- `Logo` / `LogoMark`: lowercase wordmark and the dot-grid cloud (one amber dot).
- `AppSidebar`: 260 px column, a 68 px icon rail when collapsed (the `sidebar_state` cookie keeps it across reloads), stacked on top under 768 px with a menu button. New project (`N`), sections, the three most recent projects with a `SignalDot` and status line.
- `CommandPaletteProvider` / `SearchTrigger`: the ⌘K palette over recordings, clips and pages. It loads the index from `getSearchIndexAction` each time it opens. `SearchTrigger` is the search field in the top bar.
- `AppBreadcrumbs` / `BreadcrumbLabel`: crumbs from the path; project tabs are not crumbs, a clip is. Pages register dynamic labels with `BreadcrumbLabel`.
- `Page`, `PageHeader`, `PageTitle`, `PageLede`: the 1240 px page column and its heading.
- `useHotkey(key, handler, { meta })`: single-key shortcuts that ignore fields and open dialogs; `meta` for ⌘/Ctrl chords.

`ProjectHeader` (`components/projects/`) is the project title, `StatusPill` from `projectSignal`, one-line meta, open source, the ⋯ menu (Project settings sheet, Delete) and the tabs: an amber dot on Layout while the layout waits, the clip count on Clips.

## Modified generated files

- Heycamps restyle (ADR-0057): `button`, `badge`, `tabs`, `input`, `select`, `switch`, `dialog`, `alert-dialog`, `sheet`, `dropdown-menu`, `popover`, `tooltip`, `kbd` and `command` keep their structure and API but swap classes for the heycamps tokens (inset-ring hairlines instead of borders, `surface-menu` for floating surfaces, `focus-ring`). `Button`'s `default` variant is glass and the white pill is `variant="primary"`; `outline` and `secondary` are gone. `Select`'s `size="sm"` is the small glass pill used for inline overrides. `command` was added with `cmdk`; its install did not overwrite `dialog`.

- `components/ui/popover.tsx`: `PopoverContent` forwards `anchor` to the positioner, so a controlled popover can open next to an element that isn't its trigger (the clip editor's effects lane anchors it to the selected block).
