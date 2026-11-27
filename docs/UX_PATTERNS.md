# UX patterns

The clip editor (`components/projects/clip-editor.tsx`, ADR-0074 to 0076) is the reference page. Every other page uses the same frame and the same small set of parts, so a person who learned one page knows the rest. [Design system](DESIGN_SYSTEM.md) says what things look like; this file says where they go and how they behave. The mock-ups for every page are on the "Nimbus pages redesign" canvas (ADR-0077).

When a page needs something this file doesn't cover, look at how the clip editor solved it first. If it didn't, choose, then add the pattern here in the same commit.

This file is about signed-in pages. The public landing page and the sign-in screens are marketing surfaces: they follow [Design system](DESIGN_SYSTEM.md) and ADR-0083, not the frame below.

## The frame

Every signed-in page is the same four regions. A page may leave out the inspector or the dock; it never adds a fifth region or moves one.

| Region    | Size                          | Holds                                                             |
| --------- | ----------------------------- | ----------------------------------------------------------------- |
| Header    | 60 px, hairline below         | Where you are, what state it is in, the page's one primary action |
| Stage     | Fills the rest                | The thing being worked on: a preview, a grid, a chart, a form     |
| Inspector | 340 px on the right, hairline | Details and settings of what is selected or shown on the stage    |
| Dock      | Bottom, `sheet` background    | Anything laid out along time                                      |

- Under 1180 px the inspector becomes a right-hand sheet opened from a header icon button, as in the editor. Under 760 px regions stack: header, stage, inspector, dock.
- Pages inside a project (overview, transcript, clips, editor) keep the sidebar as the person left it and use the full height with no page scroll; regions scroll on their own. Workspace pages (projects, analytics, channels, settings) scroll as a page.
- Regions are separated by hairlines (`shadow-[inset_…_var(--hair)]`), never by cards inside cards. A card is for a self-contained item in a list or grid, not for a section of a page.

## Header

Left to right, in this order:

1. **Back** (ghost icon button) when the page has a parent.
2. **Context line** (12 px, tertiary) over the **title** (16 px, 600). The context line says where this sits: `Project · Clip 3 of 9 · 12:41.2 → 13:09.8`. Numbers and timestamps in it are mono.
3. **State**, right after the title: save state (see Saving) or one status as dot plus text.
4. **Section tabs** as a `Segmented` pill when the page has siblings (Overview · Transcript · Clips; Overview · Shorts · Insights). Counts are mono 11 px inside the tab.
5. A hairline divider, then secondary actions (glass or ghost), then **the primary action**.

- No page title in the body. The header title is the `h1`.
- Build it from `PageHeader` and its parts (`components/app-shell/page-header.tsx`). It stays at the top while a page scrolls, so anything sticky below it starts 60 px lower.
- A top-level page has no back button; its context line names what the page belongs to (the workspace, the channel). Search is not in the header: it is the Search row in the sidebar and `⌘K`.
- A control that changes what the whole page shows (the analytics period) lives in the header, not in one tab's body, and must not look like the tabs: tabs are a `Segmented`, a filter is a glass button with a caret.

## Actions

- One white `variant="primary"` button per view. It is the next step of the pipeline for that page: Review clips, Render approved, Make a clip, Find patterns, Save. `pnpm check:guidelines` flags a second one in a route file.
- The primary action sits at the right end of the header, not in the body and not at the bottom of a form.
- A headline feature gets a labelled button. The `⋯` menu is for rare and destructive actions only, and a destructive action that matters (delete project) also gets its own ghost icon button.
- A count that the action applies to goes in its label: "Render 8 approved".
- Buttons are verbs. No "OK", no "Submit".

## Decisions

Approve and reject are the product's core gesture, so they look the same everywhere a person decides something (a clip, a suggestion):

- A two-item `Segmented`: Reject on the left (pink when pressed), Approve on the right (mint when pressed). The pressed label changes tense: "Approved", "Rejected". Pressing the pressed item again clears the decision.
- `A` approves and `X` rejects wherever a single item is focused or selected.
- Nothing is rendered, published or added to the playbook without this control or an equally explicit one. See [Business logic › Invariants](BUSINESS_LOGIC.md#invariants).

## Selection and the inspector

- A grid or list that has more to say about an item than fits on its tile selects on click and shows the rest in the inspector. Opening the full editor is a second, explicit step (`Enter`, or the "Open in the editor" button).
- Selected is a 2 px `foreground` inset ring. Approved is a 2 px mint ring. Never both on one element: selection wins and the status moves to the pill.
- The inspector starts with a mono label naming what it shows ("Selected · #3"), then the title, then the decision control, then details.
- More than one group of settings in an inspector: `Tabs` at its top, as the editor's Details · Captions · Layout. Project settings are an inspector tab, not a separate sheet.
- A one-line note that explains the consequence of what is on screen goes in the inspector's footer, above a hairline ("Only approved clips render. About 6 render minutes.").

## Status

- Status is always text plus colour, on the thing it describes. A ring, an opacity or a button label alone is not a status. Every clip tile, project tile and channel row carries a `StatusPill`.
- One vocabulary. The label a filter uses is the label the pill uses ("Done", not "Exported" in one place and "Done" in another). Every status has a filter; nothing is reachable only under "All".
- Tones are the ones in [Design system](DESIGN_SYSTEM.md): amber needs you, lav processing or selected, mint ready or on, sky done, pink failed or destructive. Errors are pink everywhere; amber is never an error.
- A lit `SignalDot` marks the one thing on the page that waits for the person. At most one per view.
- Say a thing once. A step row that shows "Transcribing · 42%" does not sit above a progress bar with the same label and number.

## Saving

- Edits autosave where they can, and the header says so next to the title: "Saving…", "Saved", or the error in pink with the reason in `title`.
- A form that can't autosave (settings) shows "Unsaved changes" with an amber dot in the same place, and its Save is the header's primary button with Discard beside it. One save per page; no per-field Save buttons.
- `⌘Z` and `⇧⌘Z` work wherever edits autosave.

## Time

- Anything placed in time is drawn on a timeline in the dock, with the same anatomy as the editor: a mono label on the left, a legend on the right, mono axis labels below, an amber playhead.
- Every colour or texture on a timeline has a legend entry next to it. Copy that names a colour ("lavender ranges are clips") must match the pixels.
- Timestamps, durations, counts and scores are `font-mono tabular-nums`.

## Preview

- Anything that changes how a clip looks is edited next to the 9:16 output preview with safe zones, the same component the editor uses, in the inspector or beside the form. A setting whose effect can't be seen until render is a bug in the page.
- Panes are named with a mono label: "Source · 16:9", "Output · 9:16".

## Keyboard

- Every primary action and every decision has a key, and the key is printed on or beside the control as a `Kbd`, not only in the shortcuts dialog.
- The shortcuts dialog (`?`) lists the keys of the page you are on. A page passes its list to the shell the way the editor passes `EDITOR_SHORTCUTS`.
- Single keys never fire inside a text field.

## Lists, empty states and feedback

- Filters are a row of pills with mono counts, above the list, on the left; sort is a ghost button with a caret on the right.
- An empty state has an icon, a title and one sentence that says what will appear here and what to do. Never text alone, and it never hides the page's tabs.
- A next step is stated on the item itself ("Next: paste highlights"), not only in a banner.
- Numbers that are compared say against what: "+18% vs previous 28 days". A trend gets a `Sparkline`.
- Charts follow the app palette (`--chart-1` lav, `--chart-2` mint), always have a legend when there are two series, and always have a "Show as table" view.

## Copy

- Plain, short, second person, present tense. Say what it does, how long it takes, what it costs.
- No exclamation marks, no emoji, no hype.
- The product is "nimbus" in the wordmark and "Nimbus" in sentences.
- Don't send people to logs or settings without saying where: "Settings › Connected channels".

## Checklist for a new or changed page

- [ ] Header in the order above, title is the `h1`, one primary button, nothing else white.
- [ ] Details in a 340 px inspector, time in a dock, no cards nested in cards.
- [ ] Every status is text plus tone, with a matching filter.
- [ ] Decisions use the Reject | Approve `Segmented` and the `A` / `X` keys.
- [ ] Save state is next to the title.
- [ ] Every key is printed on its control and listed in the shortcuts dialog.
- [ ] Legends match what is drawn; numbers are mono.
- [ ] Empty, loading and failed states exist and follow this file.
- [ ] `pnpm check:guidelines`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass.
