# Design system

Derived from the installed shadcn preset (`base-nova`, base color `neutral`) and `app/globals.css`. Don't invent tokens. If a new token is genuinely needed, add it to `globals.css` for both `:root` and `.dark`, map it in `@theme inline`, and document it here.

## Color roles

All colors are OKLCH CSS variables. Use them through Tailwind utilities (`bg-primary`, `text-muted-foreground`, `border-border`…), never raw values.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `background` / `foreground` | Page surface and body text | white / near-black | near-black / near-white |
| `card` / `card-foreground` | Raised surfaces (project cards, clip cards) | white | `0.205` gray |
| `popover` / `popover-foreground` | Menus, popovers, tooltips | white | `0.205` gray |
| `primary` / `primary-foreground` | Brand lime-green. Primary actions, current-word caption highlight, active timeline ranges | `oklch(0.841 0.238 128.85)` | `oklch(0.768 0.233 130.85)` |
| `secondary` / `secondary-foreground` | Low-emphasis buttons, chips | cool light gray | cool dark gray |
| `muted` / `muted-foreground` | Subtle backgrounds, secondary text, timestamps | | |
| `accent` / `accent-foreground` | Hover/selected rows in lists and menus | | |
| `destructive` | Delete, reject, failed status | red | lighter red |
| `border`, `input`, `ring` | Dividers, field borders, focus rings | | translucent white in dark |
| `chart-1…5` | Lime ramp from light to dark. Loudness strip, score bars | | |
| `sidebar-*` | Sidebar surface and its primary/accent | | |

Note that `primary-foreground` is a dark green on a light lime background, not white. Keep that pairing.

### Status color mapping

Status is always text + color, never color alone.

| Status | Badge variant |
| --- | --- |
| queued, candidate, uploaded | `outline` |
| running states (probing, transcribing, analyzing, selecting, rendering) | `secondary` + spinner icon |
| approved, rendered, done, succeeded | `default` (primary) |
| rejected, cancelled | `outline` + muted text |
| failed | `destructive` |
| awaiting_layout, ready_for_review | `secondary` + attention icon |

## Radius

`--radius: 0.625rem` (10 px). Scale derived in `@theme inline`: `rounded-sm` 6 px, `rounded-md` 8 px, `rounded-lg` 10 px, `rounded-xl` 14 px, `rounded-2xl` 18 px. Cards use `rounded-xl`, controls `rounded-lg` (the button default), small chips `rounded-md`.

## Typography

| Variable | Font | Use |
| --- | --- | --- |
| `--font-sans` | Nunito Sans | Body and UI (`font-sans`, default on `html`) |
| `--font-heading` | Oxanium | Page titles, card titles, stat values (`font-heading`) |
| `--font-mono` | Geist Mono | Timestamps, durations, file sizes, code (`font-mono tabular-nums`) |

Scale (Tailwind defaults): page title `text-2xl font-heading font-semibold`, section title `text-lg font-heading font-medium`, card title `text-base font-medium`, body `text-sm`, meta `text-xs text-muted-foreground`. The preset's controls are compact (`h-8` buttons, `text-sm`), so keep body text at `text-sm` to match.

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
