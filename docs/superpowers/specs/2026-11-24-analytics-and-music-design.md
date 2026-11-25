# Analytics tab and music for Shorts

The user asked for five things after Phases 30–32 shipped, then said "dive in" instead of answering questions, so every call below is ours and is marked as such where it isn't obvious.

1. Analytics for Shorts posted before Nimbus could publish.
2. Posting with music, and fully editing a Short before it goes out.
3. Judging how a Short did against how long it has been up.
4. Channel metrics.
5. A dedicated Analytics tab that groups all of it.

Two independent projects, built in order: **Phase 33 Analytics** (1, 3, 4, 5), then **Phase 34 Music and on-screen text** (2).

## Constraints (both phases)

- Hosted, multi-user, one Google Cloud project: the Data API quota (10,000 units/day) is shared by every workspace through the existing quota ledger. Everything new must be cheap in Data API units.
- Google facts (verified 2026-11-24 against developers.google.com, from page summaries, so wording is paraphrase):
  - `channels.list` and `playlistItems.list` cost 1 unit; `playlistItems.list` pages at up to 50. A channel's uploads playlist is `contentDetails.relatedPlaylists.uploads`.
  - `videos.list` costs 1 unit and takes a comma-separated `id` list (the 50-id cap is unverified; we send at most 50). Duration is `contentDetails.duration` (ISO 8601).
  - The Data API has no Shorts flag. The Analytics `creatorContentType` dimension (`SHORTS`, `VIDEO_ON_DEMAND`, `LIVE_STREAM`, `STORY`, `UNSPECIFIED`, data from 2019-01-01) is the only official split, and it is documented as a dimension, not a filter.
  - Analytics time-based reports: `dimensions=day` (optionally `,creatorContentType`), `filters=video==ID` allowed, metrics include `views`, `estimatedMinutesWatched`, `averageViewDuration`, `likes`, `comments`, `shares`, `subscribersGained`, `subscribersLost`. `video` is not a dimension of time-based reports, so a per-video daily curve is one request per video. Data lags 48–72 h. Analytics quota is separate from the Data API's (cost model unverified).
  - Developer Policies III.E.4: Analytics/Reporting data may be stored as long as needed, with authorization re-checked every 30 days. Other Authorized Data (e.g. `videos.list` statistics and snippets) must be refreshed or deleted within 30 calendar days. Deletion on user request within 7 days.
- Nothing publishes without an explicit click; nothing changes a prompt without approval (unchanged from Phases 30–32).

## Phase 33: Analytics

### Goals

- **Past Shorts.** "Import past Shorts" lists the connected channel's uploads and brings in every Short not already published through Nimbus, with the same numbers Nimbus clips get (views, likes, comments, average view duration and %, retention curve).
- **Growth since upload.** Every Short (Nimbus or imported) gets a daily curve from Analytics: views, watch minutes, likes, subscribers gained per day since it went up. Shorts are compared at the same age, not by raw totals.
- **Channel metrics.** Views, watch time, subscribers (gained, lost, net), likes, shares, comments and average view duration per day, split into Shorts and long-form.
- **Analytics page.** A new top-level "Analytics" section in the sidebar.

### Non-goals

- Revenue metrics, demographics, traffic sources, geography.
- Transcripts or source moments for imported Shorts: they were never in Nimbus, so retention can't be mapped back to what was said.
- Long-form videos in the Shorts table (they only count in the channel split).
- More than one channel per workspace.

### Design

**Imported Shorts are publications without a clip (our call).** `publications.clipId` becomes nullable and publications gain `origin: "nimbus" | "imported"` (default `"nimbus"`). An imported row has `status: "published"`, `videoId`, `url`, `publishedAt`, the YouTube title in `metadata.title`, a new nullable `durationMs`, no clip range. This reuses the whole Phase 31 stats pipeline (snapshots, sync job, relative performance, published table) instead of a second one. Every query that joins publications to clips must left-join or filter by origin; the per-clip dialog is untouched.

**What counts as a Short (our call).** Duration ≤ 180 s, from `contentDetails.duration`. If an Analytics call grouped by `creatorContentType` with `filters=video==…` works (try it in the HTTP client; the docs don't say), use `SHORTS` instead and keep duration as the fallback. Record which one ran in the ADR.

**Import (`sync_uploads` job, payload `{ channelId }`).** `channels.list` → uploads playlist → page `playlistItems.list` (50 per page) → `videos.list` in batches of 50 for duration and snippet. Upsert by `(channelId, videoId)`; skip ids that already belong to a Nimbus publication. Book every Data API call in the ledger; if the ledger is spent, stop and resume at the next quota reset like `sync_stats` does. Triggered by the "Import past Shorts" button, and once a day by the worker timer to pick up new uploads. Only one per channel at a time. Each new import queues its first stats sync.

**Daily curve (`publication_daily`).** `(publicationId, day)` primary key with `views`, `estimatedMinutesWatched`, `likes`, `subscribersGained`. Filled by the existing `sync_stats` job: one extra Analytics call per sync, `dimensions=day`, `filters=video==ID`, from the publish date (or the last stored day minus 3, to catch late data) to today. This is Analytics data, so it can be kept.

**Refresh cadence.** Nimbus Shorts keep days 1, 2, 7, 28. After 28 days, and for every imported Short, a sync is due every 28 days (keeps `videos.list` data inside the 30-day rule). The scheduler and the deferral rules are unchanged.

**Same-age comparison (replaces the bucket rule).** `relativePerformance` compares a Short's cumulative views at age N days (N = its current age capped at 28) with the channel median of other Shorts' cumulative views at the same age, from `publication_daily`. Shorts younger than 2 days or with fewer than 3 peers at that age show no ratio. This also fixes the parked Phase 31 minor where a late refresh landed in the 28-day bucket.

**Channel metrics (`channel_daily`).** `(channelId, day, contentType)` primary key, `contentType` = `shorts` | `long` | `other`, with the metrics above. Filled by a `sync_channel` job: one Analytics call, `ids=channel==MINE&dimensions=day,creatorContentType`, last 90 days on first run, then from the last stored day minus 3. Runs daily from the worker timer and when the Analytics page is opened with data older than 24 h. If `creatorContentType` is rejected, store everything as `other` and hide the split.

**Analytics page (`/analytics`).** Sidebar gets "Analytics" between Projects and Channels. Three tabs:

- **Overview:** period picker (7 / 28 / 90 days, default 28); KPI tiles for views, watch hours, net subscribers, average view duration, likes, each with the change against the previous period; a daily views chart with Shorts and long-form stacked; "Top Shorts this period" (5, by views gained in the period, from `publication_daily`). A "Data through <date>" line explains the 2–3 day lag.
- **Shorts:** the Phase 31 published table moves here and gains imported rows (marked "Posted outside Nimbus"), columns for age, views at day 1, 7 and 28 (blank until reached), and the same-age ratio. Above it, "Growth since upload": cumulative views (y) vs days since upload (x, 0–28), a faint line per Short, the channel median in bold, and the row you hover or focus highlighted. "Import past Shorts" lives here, with progress while the job runs.
- **Insights:** the Phase 32 Insights tab moves here unchanged.
- `/channels` keeps the connection card only; its old tabs redirect to the Analytics tabs.

**Insights with imported Shorts.** They count towards the 8-clip minimum and go in the prompt with title, duration, stats and retention, marked "posted outside Nimbus, no transcript". Rules still can't cite moments for them.

**Charts.** Use the shadcn `chart` component (Recharts) from the registry, per the shadcn-first rule. Accessible: each chart has a text summary and the data is also in the table.

**Errors and edge cases.** Channel needs reconnecting → page shows existing data with the reconnect banner, no syncs queued. Deleted or private video → `removed`, kept out of tables. A channel with zero Shorts → empty states that say what to do. Analytics returns no rows for a day → missing days count as 0 views.

**Testing.** Pure functions (Short detection, same-age comparison, period deltas, cumulative curves) unit tested. Repositories and jobs in PGlite integration tests with the fake YouTube client extended for uploads, daily rows and channel rows. One e2e: seed a channel, import past Shorts from the fake, see them in the Shorts tab and the Overview tiles, axe clean.

## Phase 34: Music and on-screen text

### Goals

- **Music.** Upload your own tracks to a workspace music library and put one under a clip: pick where in the track it starts, its volume, fades, and automatic lowering while someone talks. The game/voice audio gets its own volume.
- **On-screen text.** Burn the clip's hook (or any text) into the video as a title, for the first few seconds or the whole clip.
- **Preview before posting.** The editor plays the music with the clip as it will sound, and the existing rule holds: an edited clip must be rendered again before it can be published.

The rest of "fully edit everything" already exists (trim, layout, caption text and style, effects, title, publish metadata), so it isn't rebuilt.

### Non-goals

- A built-in or third-party music catalogue, or YouTube's Shorts sounds (there is no API to attach one).
- Content ID checks. The upload dialog warns that music you don't own can get the Short claimed or muted.
- Cuts inside a clip, several music tracks per clip, beat matching.

### Design

**Music library (our call).** `music_tracks` per workspace: title (from the file name, editable), stored file, `durationMs` from ffprobe, created by. Upload mp3, m4a/aac, wav, ogg or flac up to 50 MB through the existing upload path; ffprobe rejects files without an audio stream. Delete is blocked while a clip uses the track (say which).

**Per-clip audio (`clips.audioMix` jsonb, null = today's behaviour).** `{ trackId: string | null, trackStartMs, musicDb (-30…0, default -16), sourceDb (-30…+6, default 0), duck: boolean (default true), fadeInMs (default 0), fadeOutMs (default 1500) }`. If the clip outlasts the remaining track, the music ends early with its fade; no looping.

**Ducking from the transcript (our call).** A pure function turns the clip's transcript words into speech intervals (gaps under 400 ms merged) and a music volume envelope: −10 dB under speech, 200 ms ramps. Using words instead of a sidechain keeps loud game audio from pumping the music.

**Render.** The filtergraph adds the track as an input seeked to `trackStartMs`, trims it to the clip length, applies volume, the duck envelope and fades, and mixes it with the source audio at `sourceDb` without amix normalisation. Golden tests for the audio graph. Changing `audioMix` or the overlay marks the render stale like other edits do.

**On-screen text (`clips.textOverlay` jsonb, null = none).** `{ text (≤ 80 chars, defaults to the hook), position: "top" | "center", untilMs: number | null (null = whole clip, default 3000) }`. Rendered as an extra ASS event with its own style (bold, larger than captions, safe-area aware), reusing the captions pipeline.

**Editor.** A fourth inspector tab, "Audio & text": track picker with upload, start-in-track scrubber over the track's waveform, sliders for music and original volume, duck and fade controls, and the text overlay fields. Preview plays the track through Web Audio in sync with the video, applying volume, fades and the duck envelope; the overlay is drawn on the vertical preview.

**Publish dialog.** When a clip has music, show the Content ID warning under the privacy setting.

**Testing.** Envelope, speech intervals and the audio filtergraph unit tested (golden). Library upload/delete and the audio mix save in integration tests. The heavy render test mixes a fixture tone track. One e2e: upload a track, put it under a clip, add the hook overlay, render, and see the clip become publishable.

## Rollout

Phase 33 then Phase 34, each on its own branch, merged to master when its review is clean. `pnpm db:migrate` after each. ADR-0067 (Analytics) and ADR-0068 (Music and on-screen text) record the calls above and anything the build settles.

## Left to the builder

Exact component split, table names beyond those given, chart colours (design tokens only), how the import progress is shown, and the job stall timeouts.
