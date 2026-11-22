# Pipeline

Every step runs in the worker as a job. Each handler reads inputs from the DB and storage, writes outputs, transitions the project and enqueues the next job in one transaction. Commands below are what `features/render/*` and the step handlers actually build. Paths are absolute paths resolved by the StorageAdapter.

All ffmpeg invocations use `-hide_banner -nostdin -y`. Long-running ones add `-progress pipe:1 -nostats` so the runner can parse progress (see "Progress").

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
ffmpeg -i <source> -vn -ac 1 -ar 16000 -c:a pcm_s16le <audio.wav>
```

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

## 4. select (`selecting → awaiting_layout | ready_for_review`)

The configured HighlightSelector returns raw candidates. Shared post-processing (`features/highlights/postprocess.ts`) snaps, bounds, de-overlaps and sorts them (rules in BUSINESS_LOGIC). Clips are inserted with status `candidate`.

- **anthropic** (`features/highlights/anthropic.ts`): Messages API with structured outputs (`output_config.format` from the zod schema), `effort: "high"`, server-side refusal fallbacks (`fallbacks: "default"`). `stop_reason` is checked before parsing. An unparseable or truncated reply gets one repair turn; a refusal, API error or second bad reply falls back to HeuristicSelector, and each clip's reason starts with "Claude unavailable (…)" so the editor can see it.
- The prompt (`features/highlights/prompt.ts`) contains the timestamped transcript, the 15 loudest 250 ms buckets, silences and the length/count limits. Manual mode shows the same prompt plus a JSON reply format.
- **manual**: the step finishes with zero candidates and sets `awaitingManualSelection`; the Clips page shows the prompt and accepts pasted JSON (prose around the JSON is ignored), which goes through the same post-processing.
- **heuristic** (`features/highlights/heuristic.ts`): windows anchored at every sentence start and every 5 s, at the minimum length and at the midpoint of min/max. Loudness is the 90th percentile of normalized loudness in the window; density is words per second; keywords count hype phrases; question/answer is 1 when a question is followed by a non-question.

## 5. layout (`awaiting_layout → ready_for_review`)

Client-side (`features/layout/detect-webcam.ts`). An off-screen `<video>` seeks to 8 evenly spaced frames of the proxy.

- **Border heuristic** (`border-heuristic.ts`, pure): frames are scaled to 320 px wide and grayscaled. For each pixel the second-smallest vertical/horizontal gradient across frames is kept (one frame may disagree, e.g. a scene cut), so only static edges survive. Rows and columns are ranked by their longest run of strong edge pixels; every pair of top rows × pair of top columns that forms a plausible overlay (2–35% of the frame, aspect 0.75–2.4) is scored by how much of its perimeter is edge. Among boxes within 0.12 of the best score the largest wins, so an outer frame beats an inner detail.
- **Face detection**: MediaPipe Tasks Vision `blaze_face_short_range` (CPU, WASM served from `public/vendor/mediapipe`, installed by `pnpm run setup:vision`). It runs on the border box crop first (webcam faces are tiny in the full frame), then on the whole frame. If the assets are missing it is skipped and the border result stands.
- **Combining** (`detection.ts`, pure): border score ≥ 0.6 with a face inside → `cam-top` at ≥ 0.9 confidence; border alone → 0.8 × score; no border but a steady small face in ≥ half the frames → a 16:9 box around the face; otherwise `no-cam-blur-fill`.

The user adjusts the box in the layout editor, with a live 9:16 canvas preview drawn from the same `planLayout()` used by the renderer, and confirms (Server Action `confirmLayoutAction` → `awaiting_layout → ready_for_review`). "Use for every W×H recording" saves a LayoutPreset. Skipped automatically when the aspect is `other` or a preset matches the resolution. The layout can be edited again later without changing the status.

## 6. render_clip (`ready_for_review → rendering → done`)

Inputs: clip range, layout, caption pages → ASS file. Output: `render` asset.

Crop values are computed in TypeScript as even integers from normalized rects and the source size, so the filtergraph is a plain golden-testable string. Every graph ends with `fps=<fps>,format=yuv420p` and, when captions are enabled, `ass=<subs.ass>`.

### cam-top (and split-50 with 960/960)

```
[0:v]trim=start=S:end=E,setpts=PTS-STARTPTS,split=2[cam][game];
[cam]crop=CW:CH:CX:CY,scale=1080:672:force_original_aspect_ratio=increase,crop=1080:672,setsar=1[top];
[game]crop=GW:GH:GX:GY,scale=1080:1248:force_original_aspect_ratio=increase,crop=1080:1248:(iw-1080)*FX:(ih-1248)/2,setsar=1[bottom];
[top][bottom]vstack=inputs=2,fps=30,format=yuv420p,ass='subs.ass'[v];
[0:a]atrim=start=S:end=E,asetpts=PTS-STARTPTS[a]
```

`increase` + `crop` implements "cover". `FX` (gameplay focus) shifts the crop window horizontally, which matters for 21:9 where the gameplay crop is very wide.

### no-cam-blur-fill

```
[0:v]trim=start=S:end=E,setpts=PTS-STARTPTS,split=2[bgsrc][fg];
[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2,eq=brightness=-0.15,setsar=1[bg];
[fg]scale=1080:-2,setsar=1[fgs];
[bg][fgs]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p,ass='subs.ass'[v];
[0:a]atrim=start=S:end=E,asetpts=PTS-STARTPTS[a]
```

### Output encoding

```sh
ffmpeg -ss <S−2s> -i <source> -/filter_complex <graph.txt> -map [v] -map [a] \
  -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -movflags +faststart \
  -progress pipe:1 -nostats <out.mp4>
```

Input seeking (`-ss` before `-i`) jumps to the nearest keyframe 2 s before the clip, and `trim` inside the graph cuts accurately relative to that point (the builder subtracts the pre-roll from `S`/`E`). The graph is written to a file and passed with `-/filter_complex` (ffmpeg ≥ 7 syntax; `-filter_complex_script` is deprecated) so long graphs never hit argv limits.

## 7. render_edit (horizontal silence-cut edit)

Keep ranges = complement of silences longer than 1000 ms, each cut shrunk by 150 ms padding on both sides, adjacent ranges merged. Built as trim/atrim + concat:

```
[0:v]trim=start=A0:end=B0,setpts=PTS-STARTPTS[v0];[0:a]atrim=start=A0:end=B0,asetpts=PTS-STARTPTS[a0];
[0:v]trim=start=A1:end=B1,setpts=PTS-STARTPTS[v1];[0:a]atrim=start=A1:end=B1,asetpts=PTS-STARTPTS[a1];
...
[v0][a0][v1][a1]...concat=n=K:v=1:a=1[vc][ac];
[vc]format=yuv420p,ass='edit.ass'[v]
```

Why concat instead of `select`/`aselect`: `aselect` works on whole audio frames (~21–23 ms), so error accumulates across hundreds of cuts and drifts A/V sync. `atrim` is sample-accurate. Subtitle timings are remapped onto the cut timeline before generating the ASS file (ADR-0019).

## Progress

`-progress pipe:1` emits `key=value` blocks ending in `progress=continue|end`. The pure parser (`features/render/progress-parser.ts`) reads `out_time_us` (or `out_time_ms`, which is also microseconds) and returns `min(100, out_time / expected_duration · 100)`. The runner throttles DB writes to at most one per 500 ms.

## Cancellation and timeouts

The runner accepts an `AbortSignal`. Abort sends `SIGTERM`, then `SIGKILL` after 3 s. Per-job timeout defaults: probe 2 min, transcribe 4× media duration (min 10 min), analyze 15 min, render 3× clip duration (min 5 min). The last 4 KB of stderr is stored in `jobs.error` on failure.

## Captions (`features/captions`)

`wordsInRange()` takes the transcript words starting inside the clip (times made relative to the clip start), `buildCaptionPages()` groups them (rules in BUSINESS_LOGIC), `applyPageOverrides()` applies the editor's text edits, and `buildAss()` writes a 1080×1920 ASS file. With highlighting on, each page becomes one `Dialogue` per word, all identical except for a `{\c&H…&}` color override on the current word, positioned with `{\an2\pos(540,Y)}` where Y = baseline × 1920. Text is uppercased per style and `{`, `}` and `\` are replaced with full-width forms so transcript text can't inject override tags.

Presets (`styles.ts`): `punch` (Oxanium ExtraBold 92, uppercase, 7 px outline, 3 words), `clean` (Nunito Sans ExtraBold 72, outline + shadow, 4 words), `boxed` (Nunito Sans ExtraBold 68 on a 75% opaque box). Colors are the `background` (text), `foreground` (outline/box) and `primary` (highlight) tokens. Fonts are static OFL TTFs in `assets/fonts` and passed to libass with `ass=…:fontsdir=assets/fonts`, so renders don't depend on system fonts.

## Caption burn-in requires libass

`ass=` needs an ffmpeg built with `--enable-libass`. `pnpm run doctor` checks `ffmpeg -filters` for `ass`. Without it, renders fail fast with `DEPENDENCY_MISSING` unless captions are disabled for that render (see PROGRESS → Blockers).
