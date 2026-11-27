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

alert, alert-dialog, badge, button, card, chart, combobox, command, dialog, dropdown-menu, empty, field, input, input-group, item, kbd, label, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, slider, sonner, spinner, stat-card*, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

\* custom, see below.

`avatar` uses an inset hairline instead of the registry's border.

`InputGroupInput` also clears the inset ring that the restyled `Input` draws, so the group's own ring is the only one.

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

### Segmented (`components/ui/segmented.tsx`)

A pill of toggle buttons where one choice is pressed (heycamps `seg`), on Base UI `ToggleGroup` + `Toggle`. Use it for a short set of modes or a two-way decision; tabs stay `Tabs`.

- Parts: `Segmented` (the group; `value` / `defaultValue` / `onValueChange` are arrays like `ToggleGroup`, controlled or uncontrolled; give it an `aria-label`), `SegmentedItem` (`value`, a `<button>` with `aria-pressed`). For section tabs that are real URLs: `SegmentedNav` (a `<nav>`, give it an `aria-label`) and `SegmentedLink` (an `<a>`, `render` for a router link, `current` sets `aria-current="page"`). Same pill, no toggle semantics on links.
- Variants: `layout` = `inline` (hugs its items) | `fill` (full width, equal items).
- Clicking the pressed item reports `[]`. Ignore that in `onValueChange` when one choice must stay pressed, or use it to clear (the clip editor's Reject | Approve does).
- A11y: arrow keys move between items (roving focus), Space/Enter press.

```tsx
<Segmented
  aria-label="Mode"
  value={[mode]}
  onValueChange={([next]) => next && setMode(next)}
>
  <SegmentedItem value="split">Split</SegmentedItem>
  <SegmentedItem value="fill">Fill</SegmentedItem>
</Segmented>
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

### Sparkline (`components/ui/sparkline.tsx`)

SVG polyline scaled to its box. `values` are plotted evenly left to right against `max(1, ...values)` (so a curve above 1 still fits); `markers` are fractions 0–1 drawn as dashed vertical ticks. Renders `role="img"` with the required `label` as its name; fewer than two values draws no line. Colour follows `currentColor` (`text-primary` by default), height is `h-10` and overridable via `className`.

```tsx
<Sparkline values={[1, 0.8, 0.5]} markers={[0.4]} label="Retention" />
```

### Dropzone (`components/ui/dropzone.tsx`)

File drop target that also opens the native picker.

- Parts: `Dropzone` (root, `role="button"`), `DropzoneIcon`, `DropzoneTitle`, `DropzoneDescription` (wired to `aria-describedby`), `DropzoneTrigger` (a button that opens the picker). `useDropzone()` exposes `{ dragging, disabled, open }`.
- `clickable={false}` keeps drag and drop but drops the button role and click-to-open, so the zone can hold other controls (a link form, a `DropzoneTrigger`).
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

A lane of draggable blocks positioned by milliseconds, for editing time ranges (for example the clip timeline's tracks).

- Parts: `TimelineTrack` (`durationMs`; `lane` and `group` to let blocks move between tracks of the same group; a `role="group"`, so give it an `aria-label`), `TimelineBlock` (`startMs`, `endMs`, `variant` = `default` | `muted` | `tone` (tinted with `tone`, one of the crew colours) | `clip` (a 2 px white ring with grab handles, for a range over other content), `snapMs` (times a dragged or resized edge sticks to within 6 px; the block's own edges are ignored), `selected`, `resizable` (default true), `minMs` (default 100), `stepMs` (default 100), `onChange(startMs, endMs)`, `onCommit()`, `onLaneChange(lane, startMs, endMs)`, `onSelect`, `onDelete`). `useTimelineTrack()` exposes `{ durationMs, trackRef }`.
- Blocks are controlled only: the parent owns the ranges and applies `onChange`. Ranges are clamped to `[0, durationMs]` and kept at least `minMs` long. Same-lane overlap rules belong to the parent.
- Pointer: dragging the body moves, dragging either edge resizes (pointer capture, like `CropRegionEditor`). Pointer down also calls `onSelect`, and pointer up calls `onCommit`. With `onLaneChange`, dragging over another track of the same `group` previews the drop there (`data-dragging`) and dropping reports that track's `lane` and the time under the pointer.
- A11y: each block is a focusable `role="button"` with `aria-pressed` for selection, so give it an `aria-label` that contains its visible text. ←/→ move by `stepMs`, Shift+←/→ resize the end (each calls `onCommit`), Alt+↑/↓ move to the track above or below in the group, Enter/Space select, Delete/Backspace call `onDelete`.

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

- Parts: `CaptionPreview` (frame; a size container, so text scales with its width; put a background image or canvas inside), `CaptionPreviewText` (`pages`, `currentMs`, `captionStyle`, `baseline` 0–1 of the height). Pass `onBaselineChange` (and an `aria-label`) to make the caption a vertical slider: drag it, or use the arrow keys (Shift for 5%), Page Up/Down, Home/End. `minBaseline`/`maxBaseline` default to 0.1/0.95. A frame holding a movable caption should be `role="group"`, not `img`.
- Sizes are in 1080-wide output pixels and converted with `cqw`, so a 220 px preview matches the 1080 px render. `cssCaptionStyle()` from `features/captions/styles.ts` turns a caption preset into `captionStyle`.
- The highlight is a color change only (no motion). The text is real DOM text, so it's readable by screen readers.
- `CaptionPreviewOverlay` is the on-screen text (`text`, `position` `"top"` or `"center"`, `fontFamily`, `fontSize`, `color`, `outlineColor`), bold and balanced, 240 of 1920 units from the top (or centred) with 90-unit side margins, like the ASS `Title` style. Size it with `overlayFontSize()` from `features/captions/overlay.ts`.

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
- Several `CropRegion`s can share one editor. A region given its own `value` + `onValueChange` is controlled independently of the editor's value; with a `value` and no `onValueChange` it is read-only (no handles, no focus stop, keys and drags ignored), like a disabled region. `aspectRatio` (pixel width / height) locks corner drags and Alt+arrow resizes to that ratio, converted with the frame's pixel size at interaction time. `variant` = `default` | `ring` (2 px lav ring, square handles, the frame dimmed outside it) | `dashed` (1.5 px dashed white, handles on hover or focus) for a second region. Children render inside the region (a badge, say).
- A11y: the region is a focusable `role="group"` with `aria-roledescription="crop region"` and a description of its position ("Left 78%, top 77%, 20% wide, 20% tall"). Arrow keys move by 0.5% of the frame, Shift+arrow by 5%, Alt+arrow resizes from the bottom-right corner. Corner handles are pointer-only.

```tsx
<CropRegionEditor value={rect} onValueChange={setRect} className="aspect-video">
  <video src={src} className="size-full" />
  <CropRegion aria-label="Webcam region" variant="ring" />
</CropRegionEditor>
```

### Chart (`components/ui/chart.tsx`)

Added with `pnpm dlx shadcn@latest add chart` and left unedited (`base-nova`, Recharts 3.8.0). Use `ChartContainer` with a `ChartConfig` whose colours are `--chart-1…5` tokens, plus `ChartTooltip`/`ChartTooltipContent`. Every chart gets a visible text summary and a "Show as table" `<details>`; `ViewsChart` (`components/analytics/views-chart.tsx`) is the example.

## Analytics (`components/analytics/`)

App composites for `/analytics`; they read data shaped by `features/analytics/queries`. Charts use `Chart` (above), carry a text summary and offer their data as a table.

- `PeriodPicker`: 7, 28 or 90 days, kept in the `?period=` search param.
- `Overview`: stat tiles with the change against the previous period, `ViewsChart`, the top Shorts of the period, and the empty and syncing states.
- `ViewsChart`: views per day as stacked bars (Shorts and long-form); "Show as table" lists days.
- `ShortsPanel`: the Shorts table and growth chart together. Selecting a row highlights its line.
- `ShortsTable`: sortable Shorts with age, views, retention, same-age ratio and a "Posted outside Nimbus" badge for imports; Nimbus Shorts link to their clip.
- `GrowthChart`: cumulative views by day since upload. It draws the channel median and at most the 30 most recent Shorts as faint lines, plus the highlighted Short when it is older; the median uses every Short. "Show as table" has one row per Short with Day 1, 7, 14, 21 and 28 (29 day columns weren't readable).
- `ImportShorts`: the "Import past Shorts" button; polls while an import runs and shows the quota and error states.
- `Insights`, `SuggestionCard`, `Playbook`, `useInsightAction`: the Insights tab, moved from `/channels` unchanged in behaviour.

## App shell (`components/app-shell/`)

App composites, not primitives; they read app data and routes.

- `Logo` / `LogoMark`: lowercase wordmark and the dot-grid cloud (one amber dot).
- `AppSidebar`: 260 px column, a 68 px icon rail when collapsed (the `sidebar_state` cookie keeps it across reloads), stacked on top under 768 px with a menu button. New project (`N`), sections, the three most recent projects with a `SignalDot` and status line.
- `CommandPaletteProvider` / `SearchTrigger`: the ⌘K palette over recordings, clips and pages. It loads the index from `getSearchIndexAction` each time it opens. `SearchTrigger` is the Search row in the sidebar (an icon with a tooltip on the collapsed rail).
- `PageHeader` (`page-header.tsx`): the 60 px header every signed-in page starts with, the editor included ([UX patterns › Header](UX_PATTERNS.md#header)). Parts, in order: `PageHeaderBack` (`href`, `label`), `PageHeaderHeading` holding `PageHeaderContext` over a `PageHeaderTitleLine` with `PageHeaderTitle` (the page's `h1`) and `PageHeaderState`, then `PageHeaderTabs` (`tabs` of `{ href, label, count?, exact? }`, current from the path), `PageHeaderDivider` and `PageHeaderActions`. It sticks to the top on pages that scroll and wraps when it runs out of width.
- `Page`, `PageLede`: the 1240 px page column and an intro paragraph.
- `useHotkey(key, handler, { meta })`: single-key shortcuts that ignore fields and open dialogs; `meta` for ⌘/Ctrl chords. It skips events another handler already prevented.
- `AppSidebar` takes `shortcuts`, a page's own keys to list before the app's in the shortcuts dialog; the clip editor's layout passes `EDITOR_SHORTCUTS`.
- `WorkspaceButton`, `UsageCard`, `AccountMenu`, `ShortcutsDialog` (`sidebar-account.tsx`): the sidebar's workspace menu, render-minute `DotMeter`, and account menu (Account, Plan & usage, Settings `,`, Keyboard shortcuts `?`, Sign out).

`components/auth/` holds the sign-in screens: `AuthForm` (sign in and create account, social buttons only for configured providers), `AuthHeading` (the only gradient text), the two-step, forgot and reset forms, and the decorative `AuthGlimpse`. `components/settings/section.tsx` has `SettingsSection`, `SettingsSectionHeader` and `SettingRow`, the graphite cards and hairline rows the settings pages are built from; `SettingsNav` is the settings sub-nav.

Projects home: `ImportCard` (a `clickable={false}` `Dropzone` holding the link form, Browse files and the per-import language and highlights overrides), `NeedsYouBanner` and `ProjectGrid` (filter pills from `projectFilter`, sort menu, 16:9 tiles, refreshes every 3 s while something is processing). Overview: `ProjectOverview` (the next-step card and the vertical `PipelineStepper` with per-step details and times from `stepDetails`/`stepTimes`), `SourcePreview`, and `AudioOverview` as "Where the clips are".

Layout fields (`components/projects/layout-fields.tsx`, used by the clip editor's Layout tab and Settings › Layout): `LayoutModeOptions` (mode cards with a slot diagram, in Settings; the editor shows the same `LAYOUT_MODES` as a `Segmented`), `CamPositionField` ("Webcam goes": On top / At the bottom), `GameplayRegion` (the dashed gameplay box on the source) and `withLayoutMode`. `CaptionStyleFields` has preset cards that draw a sample in the preset's font and colours.

`ProjectHeader` (`components/projects/`) is the project's `PageHeader`: back to projects, the one-line meta as the context line, the name, a `SignalDot` and label from `projectSignal`, the Overview · Transcript · Clips tabs with the clip count, open source and the ⋯ menu (Project settings sheet, Delete).

## Marketing (`components/marketing/`)

Server Components, except `InView`, the page's only client JavaScript.

- `InView` (`in-view.tsx`): tells the stylesheet when its element is scrolled to (ADR-0086). No `data-view` until the script runs, `seen` when `amount` of it is visible (default: its top is 12% up the screen), and back to `pending`, animations rewound, whenever it is fully off screen, so everything plays again each time you come back to it. The two loops ask for `amount={0.4}`. Takes `render` like the `ui` components. All the motion is in `landing.module.css`: loops under a `pending` wrapper hold their first frame, direct children of a `.cascade` wrapper rise in turn, `.pop`, `.draw` and `.yes` are the editor blocks, chart lines and Approve pill.

- `Landing` (`landing.tsx`): the public page at the front door (ADR-0083): nav, hero, How it works, The editor, the promise with the spinning seal, What it learns, Pricing (limits from `PLANS`, prices per ADR-0085), Questions as native `<details>`, the closing call to action over the dotted horizon, footer. One `h1`; each chapter is a labelled `section`. The hero comes in on load and again when you return to it (`.entrance`); every later chapter starts with `Thread`, the amber playhead that runs down the gap as the chapter scrolls in, and reveals its parts through `InView`.
- `StreamToClips` (`stream-to-clips.tsx`, `landing.module.css`): the How it works picture (ADR-0085), a 12 s loop of a stream being read, nine moments marked and turned into clips, then decided on. One `role="img"` with a text alternative. The clips and the waveform are built from the `CLIPS` list, so moving a clip moves its mark, its line and its tile together; the keyframes are numbered per clip (`range0`…`tile8`).
- `HeroEdit` (`hero-edit.tsx`, `landing.module.css`): the 14 s loop of a clip being edited. One `role="img"` with a full text alternative; the six step names under it light up in turn. To retime it, change the percentages in the stylesheet's header comment and keyframes together.

## Modified generated files

- Heycamps restyle (ADR-0057): `button`, `badge`, `tabs`, `input`, `select`, `switch`, `dialog`, `alert-dialog`, `sheet`, `dropdown-menu`, `popover`, `tooltip`, `kbd` and `command` keep their structure and API but swap classes for the heycamps tokens (inset-ring hairlines instead of borders, `surface-menu` for floating surfaces, `focus-ring`). `Button`'s `default` variant is glass and the white pill is `variant="primary"`; `outline` and `secondary` are gone. `Select`'s `size="sm"` is the small glass pill used for inline overrides. `command` was added with `cmdk`; its install did not overwrite `dialog`.

- `components/ui/slider.tsx`: `Slider` forwards `getAriaValueText` to its thumbs, so a value can be read as "-16 dB".

- `components/ui/popover.tsx`: `PopoverContent` forwards `anchor` to the positioner, so a controlled popover can open next to an element that isn't its trigger (the clip timeline anchors it to the selected block, or to Add for the track picker).

- `components/ui/dropdown-menu.tsx`: `DropdownMenuContent` forwards `anchor` too, for a controlled menu without a trigger (the effect picker at a hovered spot on the timeline).

- `components/ui/combobox.tsx`: `ComboboxInput` names its dropdown and clear buttons "Show options" and "Clear selection"; the registry leaves them unnamed, which axe flags.

### ChannelIcon (`components/channels/channel-icon.tsx`)

A channel's brand logo (Phosphor, filled) on its brand colour: YouTube red, Twitch purple, TikTok black, the Instagram gradient. These are logos, not status, so they sit outside the crew-colour rule. Sizes `sm` and `default`; decorative, so the name goes in the surrounding text.

```tsx
<ChannelIcon provider="youtube" />
```

### EntityAvatar (`components/app-shell/entity-avatar.tsx`)

A person's photo (circle, violet initials fallback) or a workspace logo (`shape="square"`, lavender initials fallback), on the registry `Avatar`. Size and text size come from `className`.

```tsx
<EntityAvatar image={user.image} initials="GC" className="size-8 text-[13px]" />
```

### AvatarField (`components/settings/avatar-field.tsx`)

Upload, change or remove the profile photo (`target="user"`) or workspace logo (`target="workspace"`). The browser crops the image to a square and re-encodes it at 256 px before sending it, so uploads stay a few kilobytes.

### CaptionStylePreview (`components/projects/caption-style-preview.tsx`)

A 9:16 mock frame (webcam band over gameplay) with a sample caption page in the given resolved `CaptionStyle`, at the baseline the renderer would use. Used on the workspace Captions page.

### MusicUploadButton (`components/music/music-upload-button.tsx`)

Uploads one audio file straight to storage (`directUpload` in `components/uploads/direct-upload.ts`: start action, XHR PUT to the signed target, complete action) with progress in the label, then calls `onUploaded(track)` and refreshes the route. Rejects files over 50 MB before sending. Used in the workspace music library and the clip editor.

### MusicLibrary (`components/settings/music-library.tsx`)

The Settings › Music page: a `SettingsSection` with the `MusicUploadButton` in its header and the workspace's tracks as a registry `ItemGroup` list (each `Item` is a `role="listitem"`, since `ItemGroup` is a `role="list"`), or an `Empty` state. Each row renames on blur or Enter (read-only while the rename runs, focus kept), shows the duration and how many clips use the track, and deletes through an `AlertDialog`. A refused delete toasts the server's message naming the clips and leaves the row.

### Waveform (`components/ui/waveform.tsx`)

A mirrored area of 0–1 `values` drawn to fill its box (`preserveAspectRatio="none"`), each value times `gain` and capped at the box, with a sliver kept for silence. Colour comes from `currentColor`. Decorative (`aria-hidden`); the clip timeline puts it inside audio blocks with `gain` following the volume.

### Clip editor (`components/projects/clip-editor.tsx`)

The full-screen editor at `/projects/[id]/clips/[clipId]` (ADR-0074): a 60 px top bar, the stage, a 340 px inspector and the timeline dock, with no page scroll. The stage is as tall as its panes need (568 px at most) and the dock takes the rest, at least 296 px; dragging the dock's top edge ("Resize timeline", arrow keys too) sets its height until the page is left, and a double click hands it back. It owns the edit state and hands each part what it needs.

- `useClipEdit` (`use-clip-edit.ts`): the editable clip as one state with undo and redo. `patch(next, history)` records a step by default (changes within 500 ms merge into one, 100 steps kept); `"skip"` changes the present only (the server's stored effects after a save) and `"rebase"` applies to every step (the detected webcam), so neither can be undone into a stale state.
- `useClipHotkeys` (`use-clip-hotkeys.ts`): the editor's keys on `window`, off while typing or while a dialog, menu or listbox is open. A popover marked `data-hotkeys-through` (the timeline's inspector) lets them through. `EDITOR_SHORTCUTS` in `clip-shortcuts.ts` is the list the shortcuts dialog shows.
- `ClipTransport`, `ClipPlayback`, `useClipTransport` (`clip-transport.tsx`): time, back and forward 1 s, play, loop and mute over the shared `VideoPlayerProvider`; playback is held inside the clip and loops or stops at its end.
- `ClipExportMenu` (`clip-export-menu.tsx`): the render status dot and label, the white Render / Re-render button and its menu (last render, watch, download, the publication's state, publish, render quality opening the project settings sheet).
- `ClipInspector` with `DetailsPanel`, `CaptionsPanel`, `LayoutPanel` (`clip-inspector.tsx`): the three tabs. Captions holds what applies to every caption (style, on/off, timing, reset); single captions and effects are edited on the timeline (ADR-0075). Under 1180 px the editor puts the same inspector in a `Sheet`.
- `IconAction` (`icon-action.tsx`): an icon `Button` with a tooltip, named `label (shortcut)`.

### ClipTimeline (`components/projects/clip-timeline.tsx`)

The editor's timeline dock (ADR-0072, restyled in ADR-0074), fully controlled: trim, effects, caption state, texts, audio mix and the selection come in as props with a change callback each. The toolbar has Add (a text, a caption, music through a popover with the `TrackPicker` and upload, an effect or "Auto effects" / "Reset effects to auto", or a track of any type), split at the playhead (S), start and end at the playhead (I, O), delete (Delete) and the zoom (a slider from 5 to 320 px/s, plus Fit, which fills the width with the clip). The ruler (labels relative to the clip start), the amber playhead with its time and the zoom are shared by every track, and pressing an empty part of a track seeks there. Hovering an empty part of a text, captions or effects track shows a dashed one-second block where a press would put a new item: a text or a caption is added and its popover opens, an effect first asks which kind in a menu at that spot. The view opens with the clip's start at the left edge and has no scrollbar (ADR-0075): the wheel over the tracks zooms around the pointer (a sideways wheel or swipe pans), and a 44 px grip above the ruler (`role="scrollbar"`, "Timeline position") stays centred and pans the view by drag or arrow keys, on a 2 px line that widens as the zoom goes in; the 96 px track labels stay put. The view follows the playhead when it leaves the visible part. Tracks from top: texts, captions (the label hides or shows them), effects, the video (thumbnails drawn from the recording, the clip as a white-ringed range to drag or resize, committed on release, with 10 s of the recording on each side), the original audio (its loudness as a wave, mute in the label) and music once there is some. Blocks snap to the playhead, the clip's ends and each other's edges, and move between tracks of their type by drag or Alt+↑/↓. Selecting a block opens one popover from `timeline-inspector.tsx` (an effect's strength or intensity, caption text, text and position, music volume/in-point/fades/ducking, original volume and mute, clip start and end). The lane and split rules are pure, in `features/timeline/`.

A clip joined from parts (ADR-0081) shows one block per part on the video track, numbered, laid back to back on the clip's timeline. `S` with nothing or the video selected cuts the part under the playhead in two; a part's edges trim what it shows of the recording; Delete removes it. A selected part opens `PartInspector`: From and To as recording timecodes (`parseTimestamp`), Earlier and Later to reorder, "Add a part" and Delete. Add → "Part of the recording" appends 5 s after the last part. Thumbnails and the waveform follow the parts. `VideoPlayerProvider` takes the same `parts` and reports and seeks in timeline time, jumping to the next part's start 30 ms before a part ends.

### TrackPicker (`components/music/track-picker.tsx`)

A registry `Combobox` with "No music" as its placeholder and a clear button. Groups the library and the `trending` chart (read from a promise without suspending), filters ignoring case and accents, and offers "Search YouTube for …" (`searchMusicAction`) when the query is 2+ characters; results join as their own group. Values are a `TrackChoice`: none, a library track id, or a `YoutubeSound`.

### MusicPreview (`components/projects/music-preview.tsx`)

One hidden `<audio>` per music clip (`voices`), played through Web Audio in step with the `VideoPlayer` video from the clip's in-point while the playhead is inside it, at `musicGainAt()` of the render's `MusicPlan` (volume, fades, duck); the video goes through a gain at `sourceDb` (silent when `null`, for a muted original). Nothing is created until the video plays, and the video is routed only once the `AudioContext` runs, so it is never silenced by a suspended context. Without Web Audio it calls `onUnavailable` and leaves the video alone.
