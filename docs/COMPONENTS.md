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

alert, alert-dialog, badge, breadcrumb, button, card, dialog, dropdown-menu, empty, field, input, input-group, item, kbd, label, progress, scroll-area, select, separator, sheet, sidebar (+ `hooks/use-mobile.ts`), skeleton, slider, sonner, spinner, stat-card*, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

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

## Modified generated files

- `hooks/use-mobile.ts`: rewritten with `useSyncExternalStore`. The generated version set state inside an effect, which fails the React Compiler lint rule `react-hooks/set-state-in-effect`. Same API (`useIsMobile(): boolean`).
