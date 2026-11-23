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
- The prompt (`features/highlights/prompt.ts`) contains the timestamped transcript (lines in another language marked `(game)`), the 15 loudest 250 ms buckets, silences, game dialogue stretches, runs of camera cuts and the length/count limits. Manual mode shows the same prompt plus a JSON reply format.
- **manual**: the step finishes with zero candidates and sets `awaitingManualSelection`; the Clips page shows the prompt and accepts pasted JSON (prose around the JSON is ignored), which goes through the same post-processing.
- **heuristic** (`features/highlights/heuristic.ts`): windows anchored at every sentence start and every 5 s, at the minimum length and at the midpoint of min/max. Loudness is the 90th percentile of normalized loudness in the window; density is words per second; keywords count hype phrases; question/answer is 1 when a question is followed by a non-question.

## 5. layout (`awaiting_layout → ready_for_review`)

Client-side (`features/layout/detect-webcam.ts`). An off-screen `<video>` seeks to 8 evenly spaced frames of the proxy.

- **Border heuristic** (`border-heuristic.ts`, pure): frames are scaled to 320 px wide and grayscaled. For each pixel the second-smallest vertical/horizontal gradient across frames is kept (one frame may disagree, e.g. a scene cut), so only static edges survive. Rows and columns are ranked by their longest run of strong edge pixels; every pair of top rows × pair of top columns that forms a plausible overlay (2–35% of the frame, aspect 0.75–2.4) is scored by how much of its perimeter is edge. Among boxes within 0.12 of the best score that contain the best box, the largest wins, so an outer frame beats an inner detail but an unrelated static outline elsewhere (a HUD panel) can't.
- **Face detection**: MediaPipe Tasks Vision `blaze_face_short_range` (CPU, WASM served from `public/vendor/mediapipe`, installed by `pnpm run setup:vision`). It runs on the border box crop first (webcam faces are tiny in the full frame), then on the whole frame. If the assets are missing it is skipped and the border result stands.
- **Combining** (`detection.ts`, pure): border score ≥ 0.6 with a face inside → `cam-top` at ≥ 0.9 confidence; border alone → 0.8 × score; no border but a steady small face in ≥ half the frames → a 16:9 box around the face; otherwise `no-cam-blur-fill`.

The user adjusts the box in the layout editor, with a live 9:16 canvas preview drawn from the same `planLayout()` used by the renderer, and confirms (Server Action `confirmLayoutAction` → `awaiting_layout → ready_for_review`). "Use for every W×H recording" saves a LayoutPreset. Skipped automatically for square or portrait sources or when a preset matches the resolution. The layout can be edited again later without changing the status.

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

## Progress

`-progress pipe:1` emits `key=value` blocks ending in `progress=continue|end`. The pure parser (`features/render/progress-parser.ts`) reads `out_time_us` (or `out_time_ms`, which is also microseconds) and returns `min(100, out_time / expected_duration · 100)`. The runner throttles DB writes to at most one per 500 ms.

## Cancellation and timeouts

The runner accepts an `AbortSignal`. Abort sends `SIGTERM`, then `SIGKILL` after 3 s. Jobs fail when they stop making progress, not after a fixed time, so a 7-hour recording isn't killed for being long: any `reportProgress` or `reportDetail` call resets the watchdog. Limits without progress (`jobStallTimeoutMs`): download, transcribe and edit renders 30 min; highlights 20 min; probe, analysis and clip renders 15 min; sweep 10 min. Every job is also capped at 24 h in total. The worker re-queues jobs whose lease expired (their worker died) on startup and every lease interval after that. The last 4 KB of stderr is stored in `jobs.error` on failure.

## Captions (`features/captions`)

`wordsInRange()` takes the transcript words starting inside the clip (times made relative to the clip start), `buildCaptionPages()` groups them (rules in BUSINESS_LOGIC), `applyPageOverrides()` applies the editor's text edits, and `buildAss()` writes a 1080×1920 ASS file. With highlighting on, each page becomes one `Dialogue` per word, all identical except for a `{\c&H…&}` color override on the current word, positioned with `{\an2\pos(540,Y)}` where Y = baseline × 1920. Text is uppercased per style and `{`, `}` and `\` are replaced with full-width forms so transcript text can't inject override tags.

Presets (`styles.ts`): `punch` (Oxanium ExtraBold 92, uppercase, 7 px outline, 3 words), `clean` (Nunito Sans ExtraBold 72, outline + shadow, 4 words), `boxed` (Nunito Sans ExtraBold 68 on a 75% opaque box). Colors are the `background` (text), `foreground` (outline/box) and `primary` (highlight) tokens. The `font` override picks any font from `CAPTION_FONTS` (Oxanium, Nunito Sans, Pricedown). Font files live in `assets/fonts` and are passed to libass with `ass=…:fontsdir=assets/fonts`, so renders don't depend on system fonts. The OFL fonts are committed; Pricedown must be installed locally (ADR-0048).

## Caption burn-in requires libass

`ass=` needs an ffmpeg built with `--enable-libass`. `pnpm run doctor` checks `ffmpeg -filters` for `ass`. Without it, renders fail fast with `DEPENDENCY_MISSING` unless captions are disabled for that render (see PROGRESS → Blockers).
