# Design system

Where things go and how pages behave is in [UX patterns](UX_PATTERNS.md); this file is what they look like.

Heycamps on top of the shadcn preset (`base-nova`), ADR-0057. One dark theme: the page is always `night`, surfaces step up through `graphite`, `graphite-2` and `graphite-3`, and colour is reserved for status. The reference is the Claude Design handoff (`nimbus-redesign-handoff/design/`: `heycamps/tokens.json`, `heycamps/bundle.css`, `nimbus.css`, one `.dc.html` per screen). Don't invent tokens. If one is genuinely needed, add it to `:root` in `globals.css`, map it in `@theme inline` and document it here.

## Colour

Raw tokens live in `:root`; the shadcn variables point at them, so `bg-card`, `text-muted-foreground` and friends keep working.

The link preview image (`components/marketing/social-image.tsx`) is the one place that copies these values as hex, because Satori can't read CSS variables. Change it with the tokens (ADR-0091).

| Token                      | Value                      | Role                                           |
| -------------------------- | -------------------------- | ---------------------------------------------- |
| `night` (`background`)     | `#06070b`                  | Page background, always                        |
| `graphite` (`card`)        | `#101218`                  | Cards, dialogs, sheets                         |
| `graphite-2` (`muted`)     | `#15171d`                  | Insets, fields, option cards                   |
| `graphite-3`               | `#1d2027`                  | Hovered or selected option cards, tooltips     |
| `sheet`                    | `#090a0f`                  | Docked panels: the clip editor's timeline      |
| `foreground`               | `#f5f5f7`                  | Primary text                                   |
| `muted-foreground`         | `#a1a1a6`                  | Secondary text                                 |
| `tertiary`                 | `#86868b`                  | Tertiary text, placeholders, mono labels       |
| `glass` / `glass-2` / `-3` | white at 6 / 7 / 12 %      | Glass buttons, segmented controls, hover fills |
| `hair` (`border`, `input`) | white at 8 %               | Hairlines, drawn as inset rings                |
| `primary`                  | `#f5f5f7` on `#0b0c10` ink | The one white primary button per view          |

### Crew colours mark status, and only status

| Tone    | Hex       | Means                                 |
| ------- | --------- | ------------------------------------- |
| `amber` | `#ffb36b` | Needs you                             |
| `lav`   | `#b3bcff` | Processing, selection, focus (`ring`) |
| `mint`  | `#86e3bb` | Ready, approved, on                   |
| `sky`   | `#8cbeff` | Exported                              |
| `pink`  | `#ff8fc0` | Failed, destructive (`destructive`)   |

Use them through `StatusPill`, `SignalDot`, `DotMeter` and `toneVariants` (see COMPONENTS). Status is always text plus colour. A lit `SignalDot` marks the one thing that needs attention, so keep it rare. The brand gradient (`text-gradient`) goes on a few words of the login headline and nowhere else; never on a button.

`projectSignal` (and `ProjectStatusBadge`) maps running steps to `lav`, `awaiting_layout` and a paused manual selection to `amber` ("Needs you", lit dot), `ready_for_review` to `mint` ("9 to review"), `done` to `sky`, `failed` to `pink` and `cancelled` to `neutral`. `ClipStatusBadge` maps `candidate` ("To review") to `amber`, `approved`/`rendered` to `mint`, `rendering` to `lav`, `failed` to `pink`, `rejected` to `neutral`.

## No borders

Rings and hairlines are inset shadows: `inset-ring-1 inset-ring-hair` (or `inset-ring-white/10` on glass), `shadow-[inset_0_1px_0_var(--hair)]` for a top rule. Floating surfaces (menus, selects, popovers, command) use `surface-menu`: translucent graphite, blur and the menu shadow.

## Buttons

Pills. `variant="primary"` is the white button, one per view. The default variant is glass, so anything that isn't the primary is glass without asking. `ghost` for toolbar actions, `destructive` for pink actions. Hover lifts 1 px, press scales to .97 with the snappy spring (`ease-snappy`). Never put a gradient on a button.

## Typography

Geist and Geist Mono from the `geist` package (`--font-geist-sans`, `--font-geist-mono`). Body is 15 px with `-0.011em` tracking. Headlines are 600 weight at `-0.04em` (`font-heading`): page title 32 px (26 px under 760 px wide), section 19 px, card title 15 px. Mono is only for small uppercase labels (`mono-label`: 11 px, 600, `.12em`, tertiary), timestamps and numbers (`font-mono tabular-nums`).

Caption fonts (Oxanium, Nunito Sans, Pricedown) are not UI fonts: the caption preview loads them from `/api/fonts/[font]` via `@font-face` in `globals.css`.

## Radius

`--radius` is 12 px: fields and option cards `rounded-xl`, insets 14 px, cards 18 px, dialogs 22 px, menu items 10 px, signal dots 2 px, buttons and pills `rounded-full`.

## Focus and motion

Focus is a 2 px `lav` outline at a 3 px offset (`focus-ring`, also the base `:focus-visible` style). Colour changes take 200 ms; transforms use `ease-snappy` at 250 ms; menus open in 350 ms. `prefers-reduced-motion` collapses every animation and transition (base layer in `globals.css`); spinners still read through their text.

## Iconography

Phosphor (`@phosphor-icons/react`). Import from `@phosphor-icons/react/ssr` in Server Components. Default size comes from the parent component. Decorative icons get `aria-hidden`; icon-only buttons need an `aria-label`.

## Captions and ASS colours

Burned-in caption colours are their own palette, not UI tokens (ADR-0057). `features/captions/styles.ts` keeps them as OKLCH (`background`, `foreground`, `primary`) and converts them to ASS `&HAABBGGRR`; the caption preview uses the same values through `cssColor`, so the preview always matches the render.

## Do / don't

- Do compose shadcn parts rather than restyling divs, and accept `className` on every component.
- Do use tokens through Tailwind utilities. Arbitrary colours only through `rgb(var(--tone))`.
- Don't add borders; use inset rings.
- Don't use crew colours for decoration.
