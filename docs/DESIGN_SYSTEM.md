# Design system

Built on the shadcn preset (`base-nova`) with a custom palette in `app/globals.css` (ADR-0049). The direction is an edit bay at night: deep indigo ink surfaces, and a highlighter yellow that marks what Nimbus found (clip ranges, the spoken word, primary actions). Yellow is never decoration and never text on a light background. Don't invent tokens. If a new token is genuinely needed, add it to `globals.css` for both `:root` and `.dark`, map it in `@theme inline`, and document it here.

## Color roles

All colors are OKLCH CSS variables. Use them through Tailwind utilities (`bg-primary`, `text-muted-foreground`, `border-border`…), never raw values.

| Token                                | Role                                                                                           | Light                                                                                                                               | Dark                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `background` / `foreground`          | Page surface and body text                                                                     | white / indigo ink `oklch(0.2 0.03 285)`                                                                                            | deep indigo `oklch(0.17 0.025 285)` / lilac white |
| `card` / `card-foreground`           | Raised surfaces (project rows, clip cards)                                                     | white                                                                                                                               | indigo `0.215`                                    |
| `popover` / `popover-foreground`     | Menus, popovers, tooltips                                                                      | white                                                                                                                               | `0.205` gray                                      |
| `primary` / `primary-foreground`     | Highlighter yellow with ink text. Primary actions, current-word caption highlight, clip ranges | `oklch(0.87 0.17 90)`                                                                                                               | same                                              |
| `secondary` / `secondary-foreground` | Low-emphasis buttons, chips                                                                    | light lilac gray                                                                                                                    | indigo `0.27`                                     |
| `muted` / `muted-foreground`         | Subtle backgrounds, secondary text, timestamps                                                 |                                                                                                                                     |                                                   |
| `accent` / `accent-foreground`       | Hover/selected rows in lists and menus                                                         |                                                                                                                                     |                                                   |
| `destructive`                        | Delete, reject, failed status                                                                  | red-700 (`oklch(0.505 0.213 27.518)`, darker than the shadcn default so `text-destructive` on a `destructive/10` tint passes 4.5:1) | lighter red                                       |
| `border`, `input`, `ring`            | Dividers, field borders, focus rings                                                           |                                                                                                                                     | translucent white in dark                         |
| `chart-1…5`                          | Yellow-to-amber ramp. Replay heatmap band, score bars                                          |                                                                                                                                     |                                                   |
| `sidebar-*`                          | Sidebar surface and its primary/accent                                                         |                                                                                                                                     |                                                   |

`primary-foreground` is the indigo ink, not white. For yellow-ish text that must stay readable on light surfaces (timeline clip labels), use `highlight-ink`: a darker amber in light mode, the highlighter yellow in dark mode. The timeline loudness wave is `foreground/25` so yellow stays reserved for clips.

### Status color mapping

Status is always text + color, never color alone.

| Status                                                                  | Badge variant                |
| ----------------------------------------------------------------------- | ---------------------------- |
| queued, candidate, uploaded                                             | `outline`                    |
| running states (probing, transcribing, analyzing, selecting, rendering) | `secondary` + spinner icon   |
| approved, rendered, done, succeeded                                     | `default` (primary)          |
| rejected, cancelled                                                     | `outline` + muted text       |
| failed                                                                  | `destructive`                |
| awaiting_layout, ready_for_review                                       | `secondary` + attention icon |

## Radius

`--radius: 0.5rem` (8 px). Scale derived in `@theme inline`: `rounded-sm` ~5 px, `rounded-md` ~6 px, `rounded-lg` 8 px, `rounded-xl` ~11 px, `rounded-2xl` ~14 px. Cards use `rounded-xl`, controls `rounded-lg` (the button default), small chips `rounded-md`.

## Typography

| Variable         | Font                            | Use                                                                                                       |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--font-sans`    | Archivo (variable, `wdth` axis) | Body and UI (`font-sans`, default on `html`)                                                              |
| `--font-heading` | Archivo at `font-stretch: 72%`  | Page titles, card titles, stat values (`font-heading`). Condensed and heavy, like a broadcast lower-third |
| `--font-mono`    | Geist Mono                      | Timestamps, durations, file sizes, code (`font-mono tabular-nums`)                                        |

Caption fonts (Oxanium, Nunito Sans, Pricedown) are not UI fonts: the caption preview loads them from `/api/fonts/[font]` via `@font-face` in `globals.css`.

Scale (Tailwind defaults): top-level page title `text-4xl sm:text-5xl font-heading font-extrabold`, project title `text-2xl font-heading font-semibold`, section title `text-lg font-heading font-medium`, card title `text-base font-medium`, body `text-sm`, meta `text-xs text-muted-foreground`. The preset's controls are compact (`h-8` buttons, `text-sm`), so keep body text at `text-sm` to match.

## Spacing and layout

Tailwind's 4 px scale. Page padding `p-4 md:p-6`, stacks `gap-4`/`gap-6`, card padding comes from the Card component. Grids: projects `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4`. Use `gap-*` over margins. Use `min-w-0` on flex children that contain truncated text.

## Dark mode

`next-themes` with the `class` strategy (`.dark` on `html`), default `system`. Press `d` to toggle (from `components/theme-provider.tsx`), plus a toggle button in the header. Every token has a dark value, so components need no `dark:` overrides beyond what the preset already ships.

## Motion

`tw-animate-css` provides `animate-in`/`fade-in`/`zoom-in` and friends, used by overlays. Rules:

- Durations 150–200 ms for UI feedback. No decorative looping animation except spinners and progress.
- Wrap anything non-essential in `motion-safe:`. Spinners use `motion-safe:animate-spin`; under reduced motion they stay static and the text label carries the meaning.
- The caption preview's word highlight is a color change, not motion.

## Iconography

Phosphor (`@phosphor-icons/react`), the preset's `iconLibrary`. Import from `@phosphor-icons/react/dist/ssr` in Server Components, `@phosphor-icons/react` in client ones. Default size comes from the parent component (`[&_svg:not([class*='size-'])]:size-4` in buttons). Use `weight="bold"` sparingly for emphasis. Decorative icons get `aria-hidden`. Icon-only buttons need an `aria-label`.

## Captions and ASS colors

Caption styles take colors from the tokens. `features/captions/styles.ts` stores the OKLCH values copied from `globals.css` (primary, foreground, background) and converts them to ASS `&HAABBGGRR` at build time. That's the one place token values are duplicated, because ffmpeg can't read CSS. A unit test asserts they match `globals.css`.

## Do / don't

- Do compose shadcn parts (`Card`, `CardHeader`…) rather than restyling divs.
- Do use `cn()` to merge classes and accept `className` on every component.
- Don't use hex, `rgb()` or arbitrary color values (`bg-[#…]`).
- Don't override component internals with `!important` or deep selectors.
- Don't add new fonts or shadows outside the preset.
