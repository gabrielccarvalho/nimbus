# Pipeline

Every step runs in the worker as a job. Each handler reads inputs from the DB and storage, writes outputs, transitions the project and enqueues the next job in one transaction. Commands below are what `features/render/*` and the step handlers actually build. Paths are absolute paths resolved by the StorageAdapter.

All ffmpeg invocations use `-hide_banner -nostdin -y`. Long-running ones add `-progress pipe:1 -nostats` so the runner can parse progress (see "Progress").

## 0. download (`downloading → uploaded`, link imports only)

`importFromUrl` validates the link (http/https, public host, no fragment), creates the project in `downloading` with `sourceUrl` and enqueues `download`. The step (`features/pipeline/steps/download.ts`) asks the Downloader (`features/downloads`) for the video's details (title, language, thumbnail and YouTube's 100-point replay heatmap, stored on `projects.audience_heatmap`; `[]` when the video has none), then downloads into `tmp/downloads/<projectId>/`, moves the file to the project's source key, creates the source asset and continues to `probe`. The download dir is removed whatever happens; the sweep clears anything older than 24 h.

```
yt-dlp --no-playlist --no-warnings --ignore-config [--ffmpeg-location FFMPEG_PATH] \
  --flat-playlist --dump-single-json --skip-download URL
yt-dlp --no-playlist --no-warnings --ignore-config [--ffmpeg-location FFMPEG_PATH] \
  --format "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=1080]+ba/b[height<=1080]/b" \
  --merge-output-format mp4/mkv --max-filesize MAX_UPLOAD_BYTES \
  --newline --progress-template "download:progress %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s" \
  --paths <download dir> --output "source.%(ext)s" URL
```

- At most 1080p: vertical output is 1080 wide, so anything larger only costs download time. H.264/AAC is preferred so the MP4 merge is a remux.
- Live, upcoming and still-processing streams, playlists and channel pages are rejected before downloading. The project takes the video's title.
- The site's thumbnail (yt-dlp's `thumbnail` field, https and public hosts only) is saved with `ffmpeg -i <url> -frames:v 1 -vf scale=640:-2` before the download starts. Failing to fetch it only logs a warning. Probe doesn't replace an existing thumbnail.
- Progress: the first stream (video) maps to 0–90%, the second (audio) to 90–100%, switching on yt-dlp's `[download] Destination:` lines.
- yt-dlp errors are mapped to readable reasons (`describeYtDlpError`): private, members-only, age-restricted and removed videos fail without retrying; rate limits and network errors retry with backoff.
- Retrying a failed download re-runs the step; a project that already has its source skips straight to probe.

## 1. probe (`uploaded → probing → transcribing`)

Input: source asset. Output: asset metadata, `thumbnail` and `proxy` assets, layout row with `sourceAspect`.

```sh
ffprobe -v error -print_format json -show_format -show_streams <source>
```

Parsed with zod (`features/pipeline/steps/probe-parse.ts`). Width/height are swapped when the video stream has a ±90° rotation (side data `rotation` or `tags.rotate`). Display aspect = `w·SAR / h`.

```sh
# thumbnail at 10%
ffmpeg -ss <0.1·duration> -i <source> -frames:v 1 -vf scale=640:-2 -q:v 4 <thumb.jpg>

# proxy for previews and client-side webcam detection
ffmpeg -i <source> -vf scale=640:-2 -c:v libx264 -preset veryfast -crf 30 \
  -c:a aac -b:a 96k -movflags +faststart <proxy.mp4>
```

Failure modes: not a media file, no video or no audio stream, zero duration, ffprobe missing (job fails non-retryably with `DEPENDENCY_MISSING`).

## 2. transcribe (`transcribing → analyzing`)

```sh
ffmpeg -i <source> [-map 0:a:<voice track>] -vn -ac 1 -ar 16000 -c:a pcm_s16le <audio.wav>
```

The voice track comes from project settings (`audioTrack`, null for the default). Analysis keeps using the full mix when a voice track is chosen.

Spoken language, first match wins (`features/transcription/language.ts`):

1. the project's `language` setting when it isn't `auto`;
2. the language the video's page reports (yt-dlp `language`, stored as `projects.source_language`);
3. detection: 7 windows of 30 s spread across the recording, each cut with `ffmpeg -ss <t> -t 30 -c copy` and run through `whisper-cli -l auto -dl` (which ignores `-ot`, hence the cut), then the probability-weighted majority. Recordings under a minute use one window at the start. English-only models skip detection.

The transcript stores the language and how it was chosen (`language_source`: setting, source, detected, whisper).

Then the configured Transcriber:

- **whisper.cpp** (`features/transcription/whisper-cpp.ts`):
  ```sh
  whisper-cli -m <model> -f <audio.wav> -l <lang|auto> -ojf -of <out-prefix> -ml 1 -sow -pp
  ```
  `-ojf` writes full JSON with per-token timestamps (`offsets.from/to` in ms) and probabilities (`p`). `-ml 1 -sow` gives roughly one word per segment. Progress is parsed from `-pp` stderr lines (`progress = NN%`). Output is normalized (see BUSINESS_LOGIC → Transcription).
- **fake** (`features/transcription/fake.ts`): deterministic sentences from `features/transcription/fake-transcript.json` (timed to the 20 s fixture), repeated every 20 s for longer media and cut at the media duration. Words are spread evenly across each sentence.

Failure modes: binary or model missing (`DEPENDENCY_MISSING`, non-retryable; the model path is checked before spawning), whisper crash (retryable), empty transcript (succeeds with zero words; selection falls back to loudness only).

## 3. analyze (`analyzing → selecting`)

```sh
ffmpeg -i <audio.wav> -af silencedetect=noise=-35dB:d=0.5,ebur128=metadata=0 -f null -
```

Both filters log to stderr. Pure parsers (`features/analysis/silence.ts`, `loudness.ts`) read:

- `silence_start: 12.345` / `silence_end: 14.5 | silence_duration: 2.155`. An unmatched trailing `silence_start` closes at media duration.
- ebur128 lines `t: 1.2  TARGET:-23 LUFS  M: -18.4 S: -20.1 ...`. Momentary loudness (`M`) is bucketed to 250 ms (max within bucket). `-inf`, `nan` and anything below −70 (ffmpeg reports about −120 for digital silence) clamp to −70. The UI and scoring use `normalizeLoudness`: audible buckets scaled 0–1 between the quietest and loudest audible values, floor → 0.

Speech density is computed from transcript words (words per second, 10 s window, 5 s step).

A second pass finds hard camera cuts on the proxy (the source when there is no proxy):

```sh
ffmpeg -i <proxy.mp4> -an -vf "fps=10,scale=160:90,select='gt(scene,0.25)',metadata=print" -f null -
```

`features/analysis/cuts.ts` reads the `pts_time` of each selected frame into `signals.cuts` (ms). It takes about 10 s per hour of proxy. Progress is 0–80% for the audio pass and 80–95% for this one.

## 4. select (`selecting → awaiting_layout | ready_for_review`)

The configured HighlightSelector returns raw candidates. Shared post-processing (`features/highlights/postprocess.ts`) snaps, bounds, de-overlaps and sorts them (rules in BUSINESS_LOGIC). Clips are inserted with status `candidate`.

- **anthropic** (`features/highlights/anthropic.ts`): Messages API with structured outputs (`output_config.format` from the zod schema), `effort: "high"`, server-side refusal fallbacks (`fallbacks: "default"`). `stop_reason` is checked before parsing. An unparseable or truncated reply gets one repair turn; a refusal, API error or second bad reply falls back to HeuristicSelector, and each clip's reason starts with "Claude unavailable (…)" so the editor can see it.
- **visual review** (anthropic only, when the project has a proxy; `features/highlights/review.ts`): the first pass asks for 3× the clip count (at most 40). After post-processing, each candidate gets 12 frames from the proxy, from 3 s before its start to its end (`features/highlights/frames.ts`, one ffmpeg call per candidate with an input seek per frame, ~300 tokens per 640 px frame). Batches of 6 candidates go to `ANTHROPIC_REVIEW_MODEL` (default `ANTHROPIC_MODEL`) at `effort: "medium"`, in parallel. Claude re-scores each clip from what's on screen and moves its start to the payoff; post-processing runs again with `payoffStarts`. If the review fails, the top first-pass candidates are kept and each reason starts with "Not checked against the video (…)". Progress: first pass 10–60%, review 60–90%.
- The prompt (`features/highlights/prompt.ts`) contains the timestamped transcript (lines in another language marked `(game)`), the 15 loudest 250 ms buckets, silences, game dialogue stretches, runs of camera cuts, the niche's "look for" list and the length/count limits. Manual mode shows the same prompt plus a JSON reply format.
- **manual**: the step finishes with zero candidates and sets `awaitingManualSelection`; the Clips page shows the prompt and accepts pasted JSON (prose around the JSON is ignored), which goes through the same post-processing.
- **heuristic** (`features/highlights/heuristic.ts`): windows anchored at every sentence start and every 5 s, at the minimum length and at the midpoint of min/max. Loudness is the 90th percentile of normalized loudness in the window; density is words per second; keywords count hype phrases; question/answer is 1 when a question is followed by a non-question.
- **effects** (`features/effects/planner.ts`, pure): with the project's `autoEffects` on (default), every new clip gets a track planned from loudness, speech rate and the review's beats (`clips.beats`, kept so a reset never calls Claude again), using the layout stored at probe time. Without a preset that's a webcam-less placeholder, so confirming the layout re-plans the un-edited tracks. Rules in BUSINESS_LOGIC. Heuristic and manual clips get audio-only placement.

## 5. layout (`awaiting_layout → ready_for_review`)

Client-side (`features/layout/detect-webcam.ts`). An off-screen `<video>` seeks to 8 evenly spaced frames of the proxy.

- **Border heuristic** (`border-heuristic.ts`, pure): frames are scaled to 320 px wide and grayscaled. For each pixel the second-smallest vertical/horizontal gradient across frames is kept (one frame may disagree, e.g. a scene cut), so only static edges survive. Rows and columns are ranked by their longest run of strong edge pixels; every pair of top rows × pair of top columns that forms a plausible overlay (2–35% of the frame, aspect 0.75–2.4) is scored by how much of its perimeter is edge. Among boxes within 0.12 of the best score that contain the best box, the largest wins, so an outer frame beats an inner detail but an unrelated static outline elsewhere (a HUD panel) can't.
- **Face detection**: MediaPipe Tasks Vision `blaze_face_short_range` (CPU, WASM served from `public/vendor/mediapipe`, installed by `pnpm run setup:vision`). It runs on the border box crop first (webcam faces are tiny in the full frame), then on the whole frame. If the assets are missing it is skipped and the border result stands.
- **Combining** (`detection.ts`, pure): border score ≥ 0.6 with a face inside → `cam-top` at ≥ 0.9 confidence; border alone → 0.8 × score; no border but a steady small face in ≥ half the frames → a 16:9 box around the face; otherwise `no-cam-blur-fill`.

The user adjusts the box in the layout editor, with a live 9:16 canvas preview drawn from the same `planLayout()` used by the renderer, and confirms (Server Action `confirmLayoutAction` → `awaiting_layout → ready_for_review`), re-planning un-edited effect tracks when `autoEffects` is on. "Use for every W×H recording" saves a LayoutPreset. Skipped automatically for square or portrait sources or when a preset matches the resolution. The layout can be edited again later without changing the status.

## 6. render_clip (`ready_for_review → rendering → done`)

Inputs: clip range, layout, caption pages → ASS file. Output: `render` asset.

Crop values are computed in TypeScript as even integers from normalized rects and the source size, so the filtergraph is a plain golden-testable string. Every graph ends with `fps=<fps>,format=yuv420p` and, when captions are enabled, `ass=<subs.ass>`.

### cam-top (and split-50 with 960/960)

```
[0:v]trim=start=2.000:end=31.500,setpts=PTS-STARTPTS,split=2[top_src][bottom_src];
[top_src]crop=346:216:1520:832,scale=1080:672,setsar=1[top];
[bottom_src]crop=934:1080:492:0,scale=1080:1248,setsar=1[bottom];
[top][bottom]vstack=inputs=2,fps=30,format=yuv420p,ass=filename=…c1.ass:fontsdir=…/assets/fonts[v];
[0:a]atrim=start=2.000:end=31.500,asetpts=PTS-STARTPTS[a]
```

"Cover" is done in TypeScript: `planLayout()` → `coverCrop()` shrinks each region to the output aspect (even integers) before scaling, so the graph never needs `force_original_aspect_ratio`. For the gameplay region the leftover width is distributed by `gameplayFocusX` (0 = left edge, 1 = right edge), which matters for 21:9. The same `planLayout()` drives the layout editor's canvas preview.

### no-cam-blur-fill

```
[0:v]trim=…,setpts=PTS-STARTPTS,split=2[bgsrc][fg];
[bgsrc]crop=606:1080:656:0,scale=1080:1920,boxblur=20:2,eq=brightness=-0.15,setsar=1[bg];
[fg]scale=1080:606,setsar=1[fgs];
[bg][fgs]overlay=(W-w)/2:(H-h)/2,fps=29.97,format=yuv420p,ass=…[v];
[0:a]atrim=…,asetpts=PTS-STARTPTS[a]
```

Golden copies of all three graphs and the edit graph live in `features/render/__golden__`.

### Effects

A clip with effect events renders through `effectsGraph` (`features/render/effects-graph.ts`) instead of `verticalGraph` (ADR-0053). `effectCommands` samples `frameAt` (`features/effects/frame.ts`, the same function the canvas preview draws) once per output frame and writes a `sendcmd` file: each region crops its layout rect, `scale@eN` resizes it so the zoomed or shaken crop lands at the destination size, and a fixed `crop@eN` picks the offset. Focus overlays a full-frame branch per target in use (the webcam, or the gameplay cover crop for full game) with `enable='between(t,…)'`. Captions are burned on top of the final frame, so effects never move them. Clips with no effects (`effects` null or empty) keep the plain graph and its goldens.

### Music and on-screen text

A clip with `audioMix.trackId` gets the track as a second input, input-seeked to `trackStartMs` (`-ss … -i <track>` after the source). `planAudio()` (`features/music/envelope.ts`) turns the mix, the track's duration, the clip length and the clip's transcript words (made clip-relative with `wordsInRange`) into a plan, and `audioGraph()` writes it (golden `features/render/__golden__/audio-*.txt`, `cam-top-music.txt`, `effects-music.txt`):

```
[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS,volume=-3dB,aformat=sample_rates=48000:channel_layouts=stereo[src];
[1:a]atrim=end=15.000,asetpts=PTS-STARTPTS,aformat=…,volume=-16dB,
  volume='pow(10,-0.5*(clip((t-0.800)/0.200,0,1)*clip((2.700-t)/0.200,0,1)+…))':eval=frame,
  afade=t=in:st=0:d=0.500,afade=t=out:st=13.500:d=1.500[music];
[src][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1[a]
```

The music `atrim` ends at the shorter of the clip and what's left of the track, so a short track stops early with its fade-out fitted inside it, and `duration=first` keeps the output at the clip length. The `volume` expression is the duck envelope (−10 dB under each merged speech interval, 200 ms ramps; omitted when ducking is off or nobody speaks). `normalize=0` keeps both levels as set, and the limiter only stops clipping. A null `audioMix`, or one without a track, keeps the plain `[0:a]atrim` chain, with `volume=` when `sourceDb` isn't 0 and the limiter when it's above 0. `render_edit` never gets music.

A `textOverlay` adds one `Dialogue` on layer 1 in the `Title` style of the clip's ASS file, from 0 to `untilMs` (or the clip end), wrapped by libass (`\q0`) inside 90 px side margins, 240 px from the top or centred (`\an5`). It's burned with the captions, or alone when captions are off (golden `features/captions/__golden__/overlay.ass`).

### Output encoding

```sh
ffmpeg -ss <S−2s> -i <source> -/filter_complex <graph.txt> -map [v] -map [a] \
  -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -movflags +faststart \
  -progress pipe:1 -nostats <out.mp4>
```

Input seeking (`-ss` before `-i`) jumps to the nearest keyframe 2 s before the clip, and `trim` inside the graph cuts accurately relative to that point (the builder subtracts the pre-roll from `S`/`E`). The graph is written to a file and passed with `-/filter_complex` (ffmpeg ≥ 7 syntax; `-filter_complex_script` is deprecated) so long graphs never hit argv limits. Paths inside the graph (`ass=filename=…:fontsdir=…`) go through `escapeFilterPath()`, which escapes for both the filter-option and the graph level.

- Encoder: `VIDEO_ENCODER` (default `libx264 -preset veryfast -crf 20`). `auto` picks the first hardware H.264 encoder ffmpeg reports (`h264_videotoolbox -q:v 65`, `h264_nvenc -cq 23`, `h264_qsv -global_quality 23`) and falls back to libx264. `pnpm run doctor` shows which one will be used.
- ffmpeg writes into `projects/<id>/work/` and the file is moved into `renders/` only after a clean exit, so a crash or cancel never leaves a half-written render. The work ASS and graph files are always removed.
- Before starting, the step checks free space on `DATA_DIR` (`statfs`): it needs 2 × the estimate (8 Mb/s video + 160 kb/s audio at 1080×1920, scaled by pixel count) + 500 MB.
- A missing source file fails fast with `NOT_FOUND` (not retried).
- A clip whose music track was deleted, or belongs to another workspace, fails with `CONFLICT` ("This clip's music track was deleted. Pick another track or remove the music."). `CONFLICT` is retried with backoff before the clip turns `failed`.
- An on-screen text needs libass even with captions off. Without it the render fails with `DEPENDENCY_MISSING` ("This ffmpeg can't burn in on-screen text (no libass). Install one with libass or remove the text.").
- When a `render_clip` job ends (success, final failure or cancel), `settleRendering()` checks for other queued/running render jobs; when none are left the project moves `rendering → done` if any clip is rendered, otherwise back to `ready_for_review`. The worker's `onSucceeded` hook runs it after the job row is marked complete, so the job being settled isn't counted as active.
- Re-rendering a clip replaces its render asset and deletes the old file.

## 7. render_edit (horizontal silence-cut edit)

Started on demand (`startEditRender`), independent of the project status machine; one at a time per project. Output is an `edit` asset at the source resolution. Captions use the project's caption style scaled to the source height (font × height/1920 × 1.3) with the baseline at 90%.

Keep ranges = complement of silences longer than 1000 ms, each cut shrunk by 150 ms padding on both sides, adjacent ranges merged. Built as trim/atrim + concat:

```
[0:v]trim=start=A0:end=B0,setpts=PTS-STARTPTS[v0];[0:a]atrim=start=A0:end=B0,asetpts=PTS-STARTPTS[a0];
[0:v]trim=start=A1:end=B1,setpts=PTS-STARTPTS[v1];[0:a]atrim=start=A1:end=B1,asetpts=PTS-STARTPTS[a1];
...
[v0][a0][v1][a1]...concat=n=K:v=1:a=1[vc][ac];
[vc]format=yuv420p,ass='edit.ass'[v]
```

Why concat instead of `select`/`aselect`: `aselect` works on whole audio frames (~21–23 ms), so error accumulates across hundreds of cuts and drifts A/V sync. `atrim` is sample-accurate. Subtitle timings are remapped onto the cut timeline before generating the ASS file (ADR-0019).

## 8. sweep (maintenance, no project)

The worker enqueues one `sweep` on start and every 6 h (never two at once). It deletes partial uploads older than 24 h, files of projects that no longer exist, `work/` leftovers older than 7 h and render files no asset points to. Projects with queued or running jobs are skipped. The rules are the pure `planSweep` in `features/pipeline/sweep-plan.ts`.

## 9. sync_stats (no project)

Enqueued by the worker every 30 min for Nimbus publications whose age has passed 1, 2, 7 or 28 days since `publishedAt` without a snapshot for that age (`statsSyncDue`), and by "Refresh stats" in the clip dialog. It runs with `projectId: null` and never twice at once for one publication, counting batches too. The step calls `videos.list` (booked as quota kind `stats`) and then the per-publication sync shared with `sync_stats_batch` (`syncPublication`): the YouTube Analytics API for totals and the retention curve (not booked), the Short's daily views into `publication_daily` (from the publish day, or the last stored day minus 3) stamping `dailySyncedAt`, and a `publication_stats` snapshot. A failing Analytics read doesn't fail the sync; a failing daily read is retried at most once a day. Imported Shorts get the same reads, and also take their title and privacy from `videos.list`; a private or deleted imported Short becomes `removed`. A deleted video (empty `items` or a 404) marks the publication `removed`. An empty retention curve is stored as empty. When the daily quota is spent the job re-enqueues itself for after the reset. Access tokens are refreshed per call (`withGoogleToken`).

The same 30-minute timer runs `sweepStaleYouTubeData` at most once a day (tracked in memory): it deletes `publication_stats` snapshots fetched more than 30 days ago, a Short's latest included, so its numbers read "—" until the next refresh, and blanks the title of an imported Short that was imported over 30 days ago and has no snapshot from the last 30 days; the UI calls it "Untitled Short". `publication_daily`, `channel_daily` and `channel_top_videos` are Analytics data and are kept (Developer Policies III.E.4).

## 10. sync_stats_batch (no project)

Imported Shorts due a refresh are grouped per channel into batches of at most 50 (`enqueueStatsBatches`), skipping any already in an active `sync_stats` or batch job; `sync_uploads` enqueues batches the same way for the rows it imports. The step makes one `videos.list` call for all ids (1 unit, kind `stats`), treats an id missing from the response as removed, and runs `syncPublication` for each Short with its numbers. When the unit can't be spent, or Google reports the quota exceeded, the whole batch is re-enqueued for the reset. Stall timeout 10 min.

## 11. sync_uploads (no project)

Enqueued by "Import past Shorts" and, once a channel has been imported, by the worker's due sweep when the last pass is over a day old; never twice at once for one channel (`lockChannelJob`). It reads the uploads playlist (`channels.list`, then `playlistItems.list` pages and `videos.list` for ids not yet known), keeps Shorts (duration, or the `creatorContentType` probe when it answers) and stores them as `imported` publications. Every Data API call is booked under quota kind `import`. A first run walks the whole playlist. Timer runs skip known ids and stop after the first page that holds a video older than the last sync minus 7 days; a manual import (`full: true`) skips known ids but reads every page. Any probe error other than an authorization failure switches detection to duration for the rest of the run. When the quota is spent it re-enqueues itself for the reset with its page token and `passStartedAt`, which becomes `uploadsSyncedAt` when the pass finishes; when the worker shuts down between pages it hands the same payload to a new job that runs right away. New imports enqueue `sync_stats_batch` jobs. Publishing a clip takes the same channel lock before it deletes an imported row with its video id, so an import and a publish of one video never leave it listed twice.

## 12. sync_channel (no project)

Enqueued by the due sweep when the channel has never synced or the last sync is over a day old, and when the overview is opened in that state; the overview polls every 5 s while it runs. The due sweep skips a channel job type whose latest job failed less than 6 h ago. The step reads channel daily metrics from the Analytics API (not booked) for the range from the last stored day minus 3 (90 days back on the first run) through today in Pacific time, and replaces `channel_daily` for that range in one transaction, so a split read never sits beside an older unsplit one. It falls back to an unsplit read (`other`) only when YouTube rejects the `creatorContentType` dimension; any other error fails the job. It then reads the 50 most viewed videos of each period (7, 28 and 90 days ending at the last day with data) into `channel_top_videos`, which feeds "Top Shorts this period", and refreshes the daily curve of every published Short on the channel up to 31 days old (Analytics only: no unit, no snapshot; a Short whose read fails is skipped). Switching the workspace to another YouTube channel cancels its queued `sync_uploads`, `sync_channel` and `sync_stats_batch` jobs.

## 13. analyze_performance (no project)

Enqueued by "Find patterns" on the Insights tab, never twice at once for one channel. It runs with `projectId: null` and needs enough published clips with stats a few days old (`INSIGHTS_MIN_CLIPS`, `INSIGHTS_MIN_AGE_DAYS`). The step sends their stats and retention to Claude (`features/insights/prompt.ts`), records one `claude_run` with no project, cleans the suggestions (limits, evidence ids) and replaces the channel's pending ones, keeping rejected ones. Nothing changes the playbook until a person approves a suggestion.

## 14. probe_music (no project)

Enqueued with `payload: { trackId }` in the same transaction that inserts a music track as `processing`, once its upload completes. The step runs ffprobe on a local copy (`parseAudioProbe`) and decodes it once to 8 kHz mono for 240 waveform peaks, then stores `durationMs` and `peaks` and marks the track `ready`. A track that's gone or no longer `processing` makes it a no-op. A file without an audio stream, or one ffprobe can't read, fails at once (`UNSUPPORTED_MEDIA`); other errors retry up to 3 attempts. Only the final failure marks the track `failed` with the user message ("This file has no audio"), and the file stays stored until the track is deleted. The music library and the clip editor poll `router.refresh()` every 3 s while a track is processing; the track picker lists processing and failed tracks but only `ready` ones can be picked, and saving or rendering a clip with a track that isn't ready is refused.

## Progress

`-progress pipe:1` emits `key=value` blocks ending in `progress=continue|end`. The pure parser (`features/render/progress-parser.ts`) reads `out_time_us` (or `out_time_ms`, which is also microseconds) and returns `min(100, out_time / expected_duration · 100)`. The runner throttles DB writes to at most one per 500 ms.

## Cancellation and timeouts

The runner accepts an `AbortSignal`. Abort sends `SIGTERM`, then `SIGKILL` after 3 s. Jobs fail when they stop making progress, not after a fixed time, so a 7-hour recording isn't killed for being long: any `reportProgress` or `reportDetail` call resets the watchdog. Limits without progress (`jobStallTimeoutMs`): download, transcribe and edit renders 30 min; highlights 20 min; probe, analysis, clip renders and uploads imports 15 min; sweep and stats batches 10 min; stats and channel syncs 5 min. Every job is also capped at 24 h in total. The worker re-queues jobs whose lease expired (their worker died) on startup and every lease interval after that. The last 4 KB of stderr is stored in `jobs.error` on failure.

## Captions (`features/captions`)

`wordsInRange()` takes the transcript words starting inside the clip (times made relative to the clip start), `buildCaptionPages()` groups them (rules in BUSINESS_LOGIC), `applyPageOverrides()` applies the editor's text edits, and `buildAss()` writes a 1080×1920 ASS file. With highlighting on, each page becomes one `Dialogue` per word, all identical except for a `{\c&H…&}` color override on the current word, positioned with `{\an2\pos(540,Y)}` where Y = baseline × 1920. Text is uppercased per style and `{`, `}` and `\` are replaced with full-width forms so transcript text can't inject override tags.

Presets (`styles.ts`): `punch` (Oxanium ExtraBold 92, uppercase, 7 px outline, 3 words), `clean` (Nunito Sans ExtraBold 72, outline + shadow, 4 words), `boxed` (Nunito Sans ExtraBold 68 on a 75% opaque box). Colors are the `background` (text), `foreground` (outline/box) and `primary` (highlight) tokens. The `font` override picks any font from `CAPTION_FONTS` (Oxanium, Nunito Sans, Pricedown). Font files live in `assets/fonts` and are passed to libass with `ass=…:fontsdir=assets/fonts`, so renders don't depend on system fonts. The OFL fonts are committed; Pricedown must be installed locally (ADR-0048).

## Caption burn-in requires libass

`ass=` needs an ffmpeg built with `--enable-libass`. `pnpm run doctor` checks `ffmpeg -filters` for `ass`. Without it, renders fail fast with `DEPENDENCY_MISSING` unless captions are disabled for that render and the clip has no on-screen text (see PROGRESS → Blockers).
