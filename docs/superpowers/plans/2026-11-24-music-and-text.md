# Music and on-screen text (Phase 34) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace upload its own music, put one track under a clip with its own start, volume, fades and speech ducking, burn a title text into the clip, preview both in the editor, and keep the "render the latest edit before publishing" rule.

**Architecture:** A new `features/music/` holds the pure audio logic (speech intervals, duck envelope, the per-clip `AudioPlan`, waveform peaks, audio sniffing), the `music_tracks` repository, the upload/rename/delete service and the queries. `render_clip` turns `clips.audioMix` into an `AudioPlan` and `filtergraph.ts` adds the track as a second ffmpeg input mixed with `amix normalize=0`; `clips.textOverlay` becomes one more ASS event in the captions file. The editor gets an "Audio & text" tab whose preview plays the track through Web Audio with the same `musicGainAt` the render uses.

**Tech Stack:** Next.js 16 App Router (route handlers for the streamed upload and the track file), React 19, Drizzle + Postgres (PGlite in tests), zod, Base UI/shadcn (`slider`, `switch`, `select`, `radio-group`, `alert`, `alert-dialog`, existing `Timeline` with `TimelineLoudness` as the waveform), system ffmpeg 9 / ffprobe, libass, Web Audio, Vitest + RTL, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-24-analytics-and-music-design.md` (Constraints, and Phase 34 only).

## Global Constraints

- `music_tracks` belong to a workspace: title (from the file name, editable), stored file, `durationMs` from ffprobe, created by. Upload mp3, m4a/aac, wav, ogg or flac up to 50 MB through the streamed upload path; ffprobe rejects files without an audio stream. Delete is blocked while any clip uses the track, and the message names the clips.
- `clips.audioMix` jsonb, null = today's behaviour: `{ trackId: string | null, trackStartMs, musicDb (-30…0, default -16), sourceDb (-30…+6, default 0), duck: boolean (default true), fadeInMs (default 0), fadeOutMs (default 1500) }`. Our call: dB values are whole numbers, fades are 0–5000 ms.
- If the clip outlasts the remaining track, the music ends early with its fade. No looping.
- Ducking comes from the clip's transcript words, never a sidechain: speech intervals with gaps under 400 ms merged, music −10 dB under speech, 200 ms ramps.
- Render: the track is an extra input seeked to `trackStartMs`, trimmed to the clip, with volume, duck envelope and fades, mixed with the source at `sourceDb` without amix normalisation. Golden tests pin the audio graph.
- `clips.textOverlay` jsonb, null = none: `{ text (≤ 80 chars, defaults to the hook), position: "top" | "center", untilMs: number | null (null = whole clip, default 3000) }`. One extra ASS event with its own style (bold, larger than captions, safe-area aware).
- Editor: a fourth inspector tab, "Audio & text". Preview plays the track through Web Audio in sync with the video with volume, fades and duck; the overlay is drawn on the vertical preview.
- Publish dialog: when a clip has music, a Content ID warning under the privacy setting.
- Any edit to `audioMix` or `textOverlay` makes a rendered clip `approved` again, so the publish dialog says "Render the latest edit first".
- Non-goals: a music catalogue or YouTube Shorts sounds, Content ID checks, cuts inside a clip, more than one track per clip, beat matching, music on the horizontal edit (`render_edit`).
- Files touching DB, filesystem or secrets start with `import "server-only"`. `features/*` never imports `app/` or `components/`. Pure logic is unit tested. Long work stays in the worker. Our call, recorded in ADR-0068: the music upload request runs one ffprobe and one 8 kHz mono decode for the waveform before it answers. A track is at most 50 MB, so both are bounded, and the picker needs the duration and peaks right away.
- shadcn-first: no audio or waveform component exists in the registry (`pnpm dlx shadcn@latest search @shadcn -q audio|wave`, checked 2026-11-25). The waveform scrubber is the existing `Timeline` + `TimelineLoudness` + `TimelineRange`; sliders are the installed `Slider`. Design tokens only.
- Comments only where code can't speak. Conventional Commits, no AI trailers or attribution lines. Never commit `.env*`, `data/` or generated fixtures.
- Phase gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass, and `pnpm test:heavy` (it skips without whisper).

## Review Focus

1. **Deleting a track while someone saves a clip with it** (two tabs): the delete is refused naming that clip, or the save fails with "That music track is no longer in your library". A clip never points at a deleted file (Task 5, Postgres race test).
2. **A track shorter than what the clip needs, or a start near the end of the track:** the music fades out where the track ends, the fades never run past what is left, nothing loops, and the rendered clip keeps its full length with the game audio to the end (Tasks 1, 2, 6).
3. **Overlay text with ASS control characters** (`{\fs200}`, `\N`, backslashes, line breaks) or emoji: drawn literally, never restyling the overlay or the captions (Task 3).
4. **Captions turned off for the project, or an ffmpeg without libass, with an overlay set:** the overlay still burns in with captions off; without libass the render fails with a message about on-screen text instead of silently dropping it (Task 6).
5. **The preview before the first click on play** (browsers start an `AudioContext` suspended) **and browsers without Web Audio:** the video's own sound is never routed into a suspended context, so it never goes silent; without Web Audio the tab says the preview can't play music and the render still includes it (Task 8).

---

### Task 1: Pure music logic

**Files:**

- Create: `features/music/schema.ts`, `features/music/envelope.ts`, `features/music/envelope.test.ts`, `features/music/media.ts`, `features/music/media.test.ts`

**Interfaces:**

- Consumes: `TimeRange` (`features/analysis/schema`), `CaptionWord`, `spokenEnd`, `DEFAULT_PAGING` (`features/captions/pages`).
- Produces:
  - `features/music/schema.ts`:
    - `MUSIC_DB = { min: -30, max: 0, default: -16 }`, `SOURCE_DB = { min: -30, max: 6, default: 0 }`, `FADE_MAX_MS = 5000`
    - `audioMixSchema` (zod object, fields as in Global Constraints; `trackId: z.string().min(1).max(64).nullable()`, `trackStartMs` int ≥ 0 default 0, dB fields `.int()`, fades int 0…`FADE_MAX_MS`), `type AudioMix`, `DEFAULT_AUDIO_MIX: AudioMix` (`trackId: null`, the spec defaults)
    - `MUSIC_MAX_BYTES = 50 * 1024 * 1024`, `MUSIC_PEAK_BUCKETS = 240`, `TRACK_TITLE_MAX = 100`
    - `MUSIC_FORMATS = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac" } as const`, `type MusicFormat = keyof typeof MUSIC_FORMATS`, `MUSIC_ACCEPT = ".mp3,.m4a,.aac,.wav,.ogg,.flac,audio/*"`
    - `type MusicTrackSummary = { id: string; title: string; durationMs: number; peaks: number[]; url: string; usedBy: number }`
  - `features/music/envelope.ts`:
    - `SPEECH_MERGE_GAP_MS = 400`, `DUCK_DB = -10`, `DUCK_RAMP_MS = 200`
    - `dbToGain(db: number): number` (`10 ** (db / 20)`)
    - `speechIntervals(words: readonly CaptionWord[], durationMs: number): TimeRange[]`
    - `duckDbAt(intervals: readonly TimeRange[], tMs: number): number`
    - `type MusicPlan = { musicDb: number; lengthMs: number; fadeInMs: number; fadeOutMs: number; duck: TimeRange[] }`
    - `type AudioPlan = { sourceDb: number; music: MusicPlan | null }`
    - `planAudio(mix: AudioMix | null, track: { durationMs: number } | null, clipDurationMs: number, words: readonly CaptionWord[]): AudioPlan | null`
    - `musicGainAt(plan: MusicPlan, tMs: number): number` (linear factor)
  - `features/music/media.ts`:
    - `AUDIO_MAGIC_BYTES = 12`, `sniffAudio(head: Uint8Array): MusicFormat | null`
    - `waveformPeaks(samples: Int16Array, buckets?: number): number[]`
    - `trackTitleFromFile(name: string): string`
    - `trackInUseMessage(clips: readonly { title: string }[]): string`

- [ ] **Step 1: Write the failing tests**

```ts
// envelope.test.ts
const w = (startMs: number, endMs: number, text = "word") => ({
  text,
  startMs,
  endMs,
})

it("merges gaps under 400 ms and keeps longer ones", () => {
  expect(speechIntervals([w(0, 300), w(600, 900)], 10_000)).toEqual([
    { startMs: 0, endMs: 900 },
  ])
  expect(speechIntervals([w(0, 300), w(700, 900)], 10_000)).toEqual([
    { startMs: 0, endMs: 300 },
    { startMs: 700, endMs: 900 },
  ])
})
it("trims a word stretched over a pause like the captions do", () =>
  expect(speechIntervals([w(1000, 5000, "so")], 10_000)).toEqual([
    { startMs: 1000, endMs: 1460 },
  ]))
it("clamps to the clip", () =>
  expect(speechIntervals([w(9_800, 10_400, "end")], 10_000)).toEqual([
    { startMs: 9_800, endMs: 10_000 },
  ]))

it("ramps 200 ms into and out of speech", () => {
  const speech = [{ startMs: 1000, endMs: 2000 }]
  expect(duckDbAt(speech, 800)).toBe(0)
  expect(duckDbAt(speech, 900)).toBeCloseTo(-5)
  expect(duckDbAt(speech, 1000)).toBe(-10)
  expect(duckDbAt(speech, 1500)).toBe(-10)
  expect(duckDbAt(speech, 2100)).toBeCloseTo(-5)
  expect(duckDbAt(speech, 2200)).toBe(0)
  expect(duckDbAt([{ startMs: 0, endMs: 500 }], 0)).toBe(-10)
})

const mix = { ...DEFAULT_AUDIO_MIX, trackId: "t1" }
it("plans nothing without a mix and only the source without a track", () => {
  expect(planAudio(null, null, 15_000, [])).toBeNull()
  expect(
    planAudio({ ...DEFAULT_AUDIO_MIX, sourceDb: 4 }, null, 15_000, [])
  ).toEqual({ sourceDb: 4, music: null })
})
it("ends the music with the track and fits the fades into what is left", () => {
  const plan = planAudio(
    { ...mix, trackStartMs: 12_000, fadeInMs: 500 },
    { durationMs: 20_000 },
    15_000,
    []
  )
  expect(plan?.music).toEqual({
    musicDb: -16,
    lengthMs: 8_000,
    fadeInMs: 500,
    fadeOutMs: 1_500,
    duck: [],
  })
  expect(
    planAudio(
      { ...mix, trackStartMs: 19_000, fadeInMs: 800, fadeOutMs: 1_500 },
      { durationMs: 20_000 },
      15_000,
      []
    )?.music
  ).toMatchObject({ lengthMs: 1_000, fadeInMs: 800, fadeOutMs: 200 })
  expect(
    planAudio(
      { ...mix, trackStartMs: 20_000 },
      { durationMs: 20_000 },
      15_000,
      []
    )
  ).toEqual({ sourceDb: 0, music: null })
})
it("ducks only when asked", () => {
  const words = [w(1000, 1300)]
  expect(
    planAudio(mix, { durationMs: 60_000 }, 15_000, words)?.music?.duck
  ).toEqual([{ startMs: 1000, endMs: 1300 }])
  expect(
    planAudio({ ...mix, duck: false }, { durationMs: 60_000 }, 15_000, words)
      ?.music?.duck
  ).toEqual([])
})
it("gives the preview the render's gain", () => {
  const plan = {
    musicDb: -16,
    lengthMs: 10_000,
    fadeInMs: 500,
    fadeOutMs: 1_000,
    duck: [{ startMs: 3_000, endMs: 4_000 }],
  }
  expect(musicGainAt(plan, 0)).toBe(0)
  expect(musicGainAt(plan, 250)).toBeCloseTo(0.5 * dbToGain(-16))
  expect(musicGainAt(plan, 2_000)).toBeCloseTo(dbToGain(-16))
  expect(musicGainAt(plan, 3_500)).toBeCloseTo(dbToGain(-26))
  expect(musicGainAt(plan, 9_500)).toBeCloseTo(0.5 * dbToGain(-16))
  expect(musicGainAt(plan, 10_000)).toBe(0)
})
```

```ts
// media.test.ts
const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p
    )
  )

it("sniffs the audio formats we accept", () => {
  expect(sniffAudio(bytes("ID3", [4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("mp3")
  expect(
    sniffAudio(bytes([0xff, 0xfb, 0x90, 0x64], [0, 0, 0, 0, 0, 0, 0, 0]))
  ).toBe("mp3")
  expect(
    sniffAudio(bytes([0xff, 0xf1, 0x50, 0x80], [0, 0, 0, 0, 0, 0, 0, 0]))
  ).toBe("aac")
  expect(sniffAudio(bytes([0, 0, 0, 0x20], "ftypM4A "))).toBe("m4a")
  expect(sniffAudio(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("wav")
  expect(sniffAudio(bytes("OggS", [0, 2, 0, 0, 0, 0, 0, 0]))).toBe("ogg")
  expect(sniffAudio(bytes("fLaC", [0, 0, 0, 0x22, 0, 0, 0, 0]))).toBe("flac")
  expect(sniffAudio(bytes("PK", [3, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
})
it("reduces samples to peaks between 0 and 1", () => {
  expect(waveformPeaks(Int16Array.from([0, 16384, -32768, 0]), 2)).toEqual([
    0.5, 1,
  ])
  expect(waveformPeaks(new Int16Array(0), 240)).toEqual([])
  expect(waveformPeaks(Int16Array.from([100, -200]), 240)).toHaveLength(2)
})
it("titles a track from its file name", () => {
  expect(trackTitleFromFile("lofi_beat_02.mp3")).toBe("lofi beat 02")
  expect(trackTitleFromFile(".mp3")).toBe("Untitled track")
  expect(trackTitleFromFile(`${"a".repeat(140)}.wav`)).toHaveLength(100)
})
it("names the clips that use a track", () => {
  expect(trackInUseMessage([{ title: "Bridge fight" }])).toBe(
    "This track is under “Bridge fight”. Remove it from that clip first."
  )
  expect(trackInUseMessage([{ title: "A" }, { title: "B" }])).toBe(
    "This track is under “A” and “B”. Remove it from those clips first."
  )
  expect(
    trackInUseMessage([
      { title: "A" },
      { title: "B" },
      { title: "C" },
      { title: "D" },
    ])
  ).toBe(
    "This track is under “A”, “B” and 2 more clips. Remove it from those clips first."
  )
})
```

Also assert `audioMixSchema.parse({ trackId: "t1" })` equals `{ ...DEFAULT_AUDIO_MIX, trackId: "t1" }`, and that `musicDb: 1`, `musicDb: -16.5`, `sourceDb: 7` and `fadeOutMs: 5001` are rejected.

- [ ] **Step 2: Run** `pnpm vitest run features/music` — expected FAIL (modules missing).
- [ ] **Step 3: Implement.** Rules the tests leave open:
  - `speechIntervals`: each word becomes `[startMs, spokenEnd(word, DEFAULT_PAGING)]`, clamped to `[0, durationMs]`, empty ones dropped, sorted, then merged while `next.startMs − current.endMs < SPEECH_MERGE_GAP_MS`.
  - `duckDbAt`: `DUCK_DB × Σ trapezoid`, where a trapezoid rises linearly from `start − DUCK_RAMP_MS` to `start` and falls from `end` to `end + DUCK_RAMP_MS`. The 400 ms merge guarantees two intervals' ramps never overlap, so the sum stays ≤ 1.
  - `planAudio`: `lengthMs = min(clipDurationMs, track.durationMs − trackStartMs)`; `music` is `null` when `trackId` or `track` is null or `lengthMs ≤ 0`. `fadeInMs = min(mix.fadeInMs, lengthMs)`, `fadeOutMs = min(mix.fadeOutMs, lengthMs − fadeInMs)`. `duck` is `speechIntervals(words, lengthMs)` when `mix.duck`, else `[]`.
  - `musicGainAt`: 0 outside `[0, lengthMs)`; otherwise `dbToGain(musicDb + duckDbAt(duck, t))` times the linear fade-in factor `t / fadeInMs` and fade-out factor `(lengthMs − t) / fadeOutMs` (each 1 when its fade is 0). Linear amplitude matches ffmpeg's default `afade` curve.
  - `sniffAudio`: `ID3` → mp3; `0xFF` then `(b1 & 0xE0) === 0xE0` → `aac` when `(b1 & 0x06) === 0` (ADTS layer bits), else `mp3`; `ftyp` at offset 4 → m4a; `RIFF`…`WAVE` → wav; `OggS` → ogg; `fLaC` → flac.
  - `waveformPeaks`: `min(buckets, samples.length)` buckets of equal sample spans, each `max |s| / 32768` rounded to 3 decimals.
  - `trackTitleFromFile`: same cleanup as `projectNameFromFile`, fallback "Untitled track", cut to `TRACK_TITLE_MAX`.
- [ ] **Step 4: Run** the same command — expected PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(music): speech ducking, audio plans and track media helpers"`

### Task 2: The audio filtergraph

**Files:**

- Modify: `features/render/filtergraph.ts`, `features/render/effects-graph.ts`, `features/render/render.test.ts`
- Create (by the snapshot run): `features/render/__golden__/audio-duck.txt`, `audio-ends-early.txt`, `audio-source-only.txt`, `cam-top-music.txt`, `effects-music.txt`

**Interfaces:**

- Consumes: Task 1 `AudioPlan`, `MusicPlan`, `DUCK_DB`, `DUCK_RAMP_MS`.
- Produces:
  - `audioGraph({ from, to, audio }: { from: string; to: string; audio?: AudioPlan | null }): string` in `filtergraph.ts` (same file as `seconds`, to avoid an import cycle), returning the audio lines ending in `[a]`.
  - `verticalGraph`, `editGraph` unchanged in output; `verticalGraph` and `effectsGraph` take `audio?: AudioPlan | null` and build their audio through `audioGraph`.
  - `renderArgs` takes `music?: { file: string; seekMs: number }` and adds `[-ss <seekMs s>] -i <file>` right after the source input (`-ss` only when `seekMs > 0`).

- [ ] **Step 1: Write the failing tests** in `render.test.ts`, `describe("audioGraph")`:

```ts
const music = {
  musicDb: -16,
  lengthMs: 15_000,
  fadeInMs: 500,
  fadeOutMs: 1_500,
  duck: [
    { startMs: 1_000, endMs: 2_500 },
    { startMs: 6_000, endMs: 9_000 },
  ],
}

it("mixes ducked, faded music under the source without normalising", () =>
  expect(
    audioGraph({ from: "2.000", to: "17.000", audio: { sourceDb: -3, music } })
  ).toBe(
    [
      "[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS,volume=-3dB,aformat=sample_rates=48000:channel_layouts=stereo[src]",
      "[1:a]atrim=end=15.000,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=-16dB,volume='pow(10,-0.5*(clip((t-0.800)/0.200,0,1)*clip((2.700-t)/0.200,0,1)+clip((t-5.800)/0.200,0,1)*clip((9.200-t)/0.200,0,1)))':eval=frame,afade=t=in:st=0:d=0.500,afade=t=out:st=13.500:d=1.500[music]",
      "[src][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1[a]",
    ].join(";\n")
  ))

it("keeps today's audio line without a plan or at 0 dB", () => {
  const today = "[0:a]atrim=start=2.000:end=17.000,asetpts=PTS-STARTPTS[a]"
  expect(audioGraph({ from: "2.000", to: "17.000" })).toBe(today)
  expect(
    audioGraph({
      from: "2.000",
      to: "17.000",
      audio: { sourceDb: 0, music: null },
    })
  ).toBe(today)
})
```

Also assert:

- Speech from 0 ms writes the ramp as `clip((t+0.200)/0.200,0,1)` (never `t--0.200`).
- `duck: []` and `fadeInMs: 0` drop the expression `volume` and the `afade=t=in` entirely.
- `sourceDb: -3, music: null` ends in `volume=-3dB[a]` with no limiter; `sourceDb: 6, music: null` ends in `volume=6dB,alimiter=limit=0.95:level=0:latency=1[a]`.
- Golden files: `audio-duck.txt` (the case above), `audio-ends-early.txt` (`lengthMs: 8_000`, fade-out `st=6.500`), `audio-source-only.txt` (`sourceDb: 6`), `cam-top-music.txt` (the existing cam-top input plus `audio: { sourceDb: 0, music }`), `effects-music.txt` (the existing zoom+shake+focus input plus the same `audio`).
- Every existing golden file is unchanged (run without `-u`).
- `renderArgs({ ..., seekMs: 10_000, music: { file: "/data/music/w/t.m4a", seekMs: 45_000 } })` starts `["-ss", "10.000", "-i", input, "-ss", "45.000", "-i", "/data/music/w/t.m4a", "-/filter_complex", …]`; with `seekMs: 0` the second `-ss` is absent.

- [ ] **Step 2: Run** `pnpm vitest run features/render/render.test.ts` — expected FAIL (`audioGraph` missing).
- [ ] **Step 3: Implement.** Source branch: today's `atrim`/`asetpts`, then `volume=<sourceDb>dB` when `sourceDb ≠ 0`. With music it gets `aformat=sample_rates=48000:channel_layouts=stereo[src]`. Music branch, in the order the test pins: `atrim=end`, `asetpts`, `aformat`, `volume=<musicDb>dB`, the duck expression when `duck` isn't empty (`pow(10,DUCK_DB/20*(Σ terms))` with `DUCK_DB / 20` printed as `-0.5`), `afade=t=in` when `fadeInMs > 0`, `afade=t=out:st=<lengthMs − fadeOutMs>` when `fadeOutMs > 0`. The limiter is appended when `music` is set or `sourceDb > 0` (our call: `normalize=0` plus +6 dB can clip, and `level=0` keeps alimiter from auto-levelling, which would be normalisation by another name). The commas in the expression are safe inside single quotes, as `enable='between(…)'` already is in `effects-graph.ts`.
- [ ] **Step 4: Run** the same command — expected PASS, with only the five new golden files created.
- [ ] **Step 5: Commit:** `git commit -m "feat(render): mix a music track under the clip in the filtergraph"`

### Task 3: The text overlay in ASS

**Files:**

- Create: `features/captions/overlay.ts`, `features/captions/__golden__/overlay.ass`
- Modify: `features/captions/ass.ts`, `features/captions/captions.test.ts`

**Interfaces:**

- Consumes: `CaptionStyle`, `CAPTION_FONTS`, `assColor`, `escapeAssText`, `assTime`.
- Produces:
  - `features/captions/overlay.ts`:
    - `TEXT_OVERLAY_MAX_CHARS = 80`, `DEFAULT_OVERLAY_UNTIL_MS = 3000`, `OVERLAY_TOP_Y = 240`, `OVERLAY_MARGIN_X = 90`
    - `textOverlaySchema` (`text: z.string().trim().min(1).max(80)`, `position: z.enum(["top", "center"]).default("top")`, `untilMs: z.number().int().min(500).max(180_000).nullable().default(3000)`), `type TextOverlay`
    - `defaultOverlayText(hook: string, title: string): string`
    - `overlayFontSize(style: Pick<CaptionStyle, "fontSize">): number` = `Math.min(192, Math.round(style.fontSize * 1.2))`
    - `overlayEndMs(overlay: Pick<TextOverlay, "untilMs">, clipDurationMs: number): number`
  - `buildAss({ pages, style, baseline, overlay?, width?, height? })` with `overlay?: { text: string; position: TextOverlay["position"]; endMs: number }`.

- [ ] **Step 1: Write the failing tests:**
  - `defaultOverlayText("Wait for it", "Clip")` is `"Wait for it"`; an empty hook falls back to the title; a 120-character hook is cut at the last space before 80 characters and ends with `…` (total ≤ 80).
  - `overlayEndMs({ untilMs: 3000 }, 20_000)` is 3000; `{ untilMs: 30_000 }` on a 20 s clip is 20,000; `{ untilMs: null }` is 20,000.
  - `buildAss` without `overlay` still matches `__golden__/punch.ass` byte for byte.
  - With the punch style and `overlay: { text: "Wait for it", position: "top", endMs: 3000 }`, the output matches `__golden__/overlay.ass`, has a `Style: Title,Oxanium ExtraBold,110,…,-1,0,0,0,100,100,0,0,1,8,0,8,90,90,240,1` line (bold, alignment 8, margins 90/90/240) and its last event is `Dialogue: 1,0:00:00.00,0:00:03.00,Title,,0,0,0,,{\q0}Wait for it`.
  - `position: "center"` uses `{\an5\q0}` and the same Title style.
  - Text `"{\\fs200}big\\Nline\ntwo"` renders as `｛＼fs200｝big＼Nline two` on one line (Review Focus 3); emoji pass through unchanged.
  - With `pages: []` the file has the Title style and one event and no `Caption` events.
- [ ] **Step 2: Run** `pnpm vitest run features/captions` — expected FAIL.
- [ ] **Step 3: Implement.** The Title style uses the caption style's font, `overlayFontSize`, white text (`background` token), `foreground` outline 8, no shadow, Bold `-1`, alignment 8, `MarginL`/`MarginR` = `OVERLAY_MARGIN_X`, `MarginV` = `OVERLAY_TOP_Y`. No `\pos`: libass then wraps the event inside the margins, and `\q0` turns on balanced wrapping for this event only (captions keep `WrapStyle: 2` and their own `\N` breaks). Layer 1 keeps the title above captions. Uppercase isn't applied to the overlay.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(captions): burn an on-screen title as its own ASS event"`

### Task 4: Music library: schema, migration 0018, upload, file route, rename and delete

**Files:**

- Modify: `lib/db/schema.ts`, `lib/storage/index.ts`, `lib/http/range.ts` (`MIME_BY_EXT`), `features/render/ffmpeg-runner.ts`, `features/pipeline/steps/probe-parse.ts`, `features/pipeline/steps/probe-parse.test.ts`, `features/accounts/service.ts` (`deleteOwnedWorkspaces`), `features/accounts/repository.ts` (`storageBytes`)
- Create: `lib/db/migrations/0018_music_and_text.sql` via `pnpm db:generate --name music_and_text`, `features/music/repository.ts`, `features/music/service.ts`, `features/music/queries.ts`, `features/music/actions.ts`, `app/api/uploads/music/route.ts`, `app/api/music/[id]/route.ts`, `scripts/make-fixtures.ts` (tone fixture)
- Test: `tests/integration/music-library.test.ts`

**Interfaces:**

- Consumes: Task 1 (`sniffAudio`, `waveformPeaks`, `trackTitleFromFile`, `trackInUseMessage`, `MUSIC_FORMATS`, `MUSIC_MAX_BYTES`, `MUSIC_PEAK_BUCKETS`), `UPLOAD_FILENAME_HEADER`, `readableFromRequestBody`, `assertDiskSpace`, `requireActor`, `fileResponse`, `errorResponse`.
- Produces:
  - `musicTracks` table: `id` text pk (`newId()`), `workspaceId` FK → workspaces cascade not null, `title` text not null, `storageKey` text not null, `mime` text not null, `bytes` bigint (number) not null default 0, `durationMs` int not null, `peaks` jsonb `number[]` not null, `createdBy` FK → user `set null` nullable, timestamps; index `music_tracks_workspace_idx` on (`workspaceId`, `createdAt`).
  - `clips.audioMix` jsonb `AudioMix | null` and `clips.textOverlay` jsonb `TextOverlay | null` (no backfill: null is today's behaviour).
  - `storageKeys.music(workspaceId, trackId, ext)` = `music/{workspaceId}/{trackId}.{ext}`, `storageKeys.musicPrefix(workspaceId)`, `storageKeys.musicWork(id)` = `tmp/music/{id}.pcm`. `MIME_BY_EXT` gains mp3, m4a, aac, wav, ogg, flac.
  - `runFfprobe(file: string, signal?: AbortSignal, kind: "video" | "audio" = "video")`: for `"audio"` the failure reads "This file couldn't be read as audio".
  - `parseAudioProbe(json: string): { durationMs: number; codec: string }` in `probe-parse.ts`: "This file has no audio track" / "This file has no playable duration" (`UNSUPPORTED_MEDIA`).
  - `type MusicTrack = typeof musicTracks.$inferSelect`; `musicRepository(db)`:
    - `create(track: Omit<NewMusicTrack, "id"> & { id: string }): Promise<MusicTrack>`
    - `get(id: string): Promise<MusicTrack | undefined>`
    - `listForWorkspace(workspaceId: string): Promise<MusicTrack[]>` (newest first)
    - `lock(id: string, mode: "update" | "share"): Promise<MusicTrack | undefined>` (`SELECT … FOR UPDATE | FOR SHARE`)
    - `rename(id: string, title: string): Promise<void>`
    - `delete(id: string): Promise<void>`
    - `clipsUsing(trackId: string): Promise<{ clipId: string; title: string; projectId: string }[]>` (`clips.audio_mix->>'trackId' = id`, any clip status)
    - `usageCounts(workspaceId: string): Promise<Map<string, number>>`
  - `features/music/service.ts`:
    - `type MusicActor = { workspaceId: string; userId: string }`
    - `handleMusicUpload(request: Request, actor: MusicActor): Promise<MusicTrackSummary>`
    - `renameTrack(db: Db, workspaceId: string, trackId: string, title: unknown): Promise<void>`
    - `deleteTrack(db: Db, storage: StorageAdapter, workspaceId: string, trackId: string): Promise<void>`
    - `toSummary(track: MusicTrack, usedBy: number): MusicTrackSummary` (`url: /api/music/{id}`)
  - `features/music/queries.ts`: `musicTracksFor(db: Db, workspaceId: string): Promise<MusicTrackSummary[]>`, `getMusicLibrary(): Promise<MusicTrackSummary[]>` (`requireActor`)
  - `features/music/actions.ts`: `renameMusicTrackAction(trackId: unknown, title: unknown)`, `deleteMusicTrackAction(trackId: unknown)`; both `requireActor` and revalidate `/settings/workspace/music`.
  - `POST /api/uploads/music` → 201 `{ track: MusicTrackSummary }`. It sits under `/api/uploads`, which the proxy matcher already skips (the proxy buffers and truncates bodies past 10 MB), so `proxy.ts` is unchanged.
  - `GET`/`HEAD /api/music/[id]` → the file with range support when the track is in the viewer's workspace, else 404 "File not found".
  - `fixtures.tone` = `tests/fixtures/.generated/tone-880hz.m4a` (30 s, `sine=f=880`, AAC 96k); `FIXTURES_VERSION` becomes `"3"`.

- [ ] **Step 1: Write failing tests:**
  - `parseAudioProbe` (unit, `probe-parse.test.ts`): a stream list with one `audio` stream and `format.duration "30.02"` gives 30,020 ms; a video-only probe throws "This file has no audio track".
  - `music-library.test.ts` (PGlite, a signed-in owner as in `clip-edit-action.test.ts`, real ffprobe):
    - Uploading `fixtures.tone` as `x-file-name: summer_loop.m4a` stores `music/{workspace}/{id}.m4a`, a track titled "summer loop" with `durationMs` within 50 ms of 30,000, 240 peaks all in `[0, 1]` and `createdBy` the owner; the summary's `url` is `/api/music/{id}`.
    - `fixtures.noAudio` named `silent.m4a` → `UNSUPPORTED_MEDIA` "This file has no audio track", and nothing is left under `music/` or `tmp/`.
    - `fixtures.notVideo` named `song.mp3` → "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file".
    - `content-length` over 50 MB → `TOO_LARGE` "Music files can be up to 50 MB"; a streamed body over the limit fails the same way.
    - `renameTrack` trims and saves; `"  "` → `VALIDATION` "Give the track a name".
    - `deleteTrack` removes the row and the file; with a clip whose `audioMix.trackId` is the track it throws `CONFLICT` with `trackInUseMessage` for that clip and keeps both.
    - Another workspace's track: `renameTrack`/`deleteTrack` → `NOT_FOUND` "Track not found"; `GET /api/music/{id}` → 404; the owner's GET with `range: bytes=0-99` → 206.
    - `usageCounts` counts clips per track; `storageBytes` includes track bytes; deleting the owner's workspaces removes `music/{workspace}`.
- [ ] **Step 2: Run** `pnpm fixtures && pnpm vitest run tests/integration/music-library.test.ts features/pipeline/steps/probe-parse.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
  - `handleMusicUpload`: reject `content-length > MUSIC_MAX_BYTES` before reading; `assertDiskSpace`; stream to `storageKeys.uploadTemp(id)` with `maxBytes: MUSIC_MAX_BYTES` and a transform that sniffs the first `AUDIO_MAGIC_BYTES` with `sniffAudio` (the stored extension comes from the sniff, not the file name; a `.mp3` that is really M4A is stored as `.m4a`). Map the storage `TOO_LARGE` to "Music files can be up to 50 MB". Then `runFfprobe(…, "audio")` → `parseAudioProbe`; decode once with `runFfmpeg(["-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", <musicWork>])`, copy into an aligned `Int16Array`, `waveformPeaks(…, MUSIC_PEAK_BUCKETS)`; move to `storageKeys.music`; insert. Any failure removes the temp and work files.
  - `deleteTrack`: in one transaction `lock(id, "update")` (missing or other workspace → "Track not found"), `clipsUsing` → `CONFLICT trackInUseMessage(...)`, delete the row; remove the file after commit.
  - `pnpm db:generate --name music_and_text` and check `0018_music_and_text.sql` creates `music_tracks` with both FKs and adds the two nullable clip columns.
- [ ] **Step 4: Run** the same tests and `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(music): workspace music library with upload, file route, rename and delete"`

### Task 5: Saving a clip's music and text

**Files:**

- Modify: `features/clips/schema.ts`, `features/clips/service.ts`
- Test: `tests/integration/clip-editing.test.ts`, `tests/integration/clip-edit-action.test.ts`, `tests/integration/publish-actions.test.ts`; create `tests/integration/music-race-postgres.test.ts`

**Interfaces:**

- Consumes: Task 1 `audioMixSchema`, Task 3 `textOverlaySchema`, Task 4 `musicRepository.lock`.
- Produces:
  - `clipEditSchema` gains `audioMix: audioMixSchema.nullable().default(null)` and `textOverlay: textOverlaySchema.nullable().default(null)`, so older payloads still parse.
  - `updateClip` stores both and, when `audioMix.trackId` is set, runs the track check and the clip update in one transaction holding `lock(trackId, "share")`.

- [ ] **Step 1: Write failing tests:**
  - Saving `audioMix: { ...DEFAULT_AUDIO_MIX, trackId }` and `textOverlay: { text: "Wait for it", position: "top", untilMs: 3000 }` stores both; saving `null` clears them.
  - A track from another workspace, or a deleted one → `VALIDATION` "That music track is no longer in your library".
  - `trackStartMs` equal to or past the track's `durationMs` → `VALIDATION` "Start the music before the track ends".
  - `textOverlay.text` of 81 characters, and `musicDb: 3`, are rejected by `updateClipAction` with the schema message.
  - A `rendered` clip whose only change is `audioMix` becomes `approved`, and `publishClipAction` on it then fails with "Render the latest edit first"; the same for a `textOverlay`-only change.
  - Postgres race (`describe.runIf(postgresReachable())`, the `import-race-postgres.test.ts` pattern, Review Focus 1): start a `deleteTrack` transaction that holds the `FOR UPDATE` lock, run `updateClip` with that track concurrently, release; expect the save to reject with "That music track is no longer in your library" and the clip's `audioMix` unchanged. In the reverse order (save holding `FOR SHARE`), expect the delete to reject with `trackInUseMessage` for that clip.
- [ ] **Step 2: Run** `pnpm vitest run tests/integration/clip-editing.test.ts tests/integration/clip-edit-action.test.ts tests/integration/publish-actions.test.ts tests/integration/music-race-postgres.test.ts` — FAIL.
- [ ] **Step 3: Implement.** The track must belong to the project's `workspaceId`. Keep the existing `rendered → approved` status rule; it is what makes the publish dialog refuse a stale render.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(clips): save a clip's music mix and on-screen text"`

### Task 6: `render_clip` renders music and the overlay

**Files:**

- Modify: `features/pipeline/steps/render-clip.ts`, `tests/integration/render.test.ts`

**Interfaces:**

- Consumes: Task 1 `planAudio`, Task 2 `audio`/`music` parameters, Task 3 `overlay`, `overlayEndMs`, Task 4 `musicRepository.get`, `fixtures.tone`.

- [ ] **Step 1: Write failing tests** (real ffmpeg, as the existing `render_clip` tests). Helper in the test file: `bandLevelDb(file: string, hz: number, fromS: number, durationS: number): number`, running `ffmpeg -ss <from> -t <dur> -i <file> -af bandpass=f=<hz>:width_type=h:w=100,volumedetect -f null -` with `spawnSync` and parsing `mean_volume` from stderr.
  - **Mix:** with a tone track, `musicDb: 0`, `duck: false`, the 880 Hz band of the render is above −35 dB; the same clip rendered with `audioMix: null` is below −50 dB. The output keeps the clip's length (±100 ms) and 1080×1920.
  - **Duck:** with `duck: true`, compute the clip's intervals with `speechIntervals(wordsInRange(speakerTranscriptWords(transcript), startMs, endMs), durationMs)`; assert the test found a 600 ms window inside an interval and one at least 250 ms from any interval (so a fixture change can't pass vacuously); the 880 Hz level in the speech window is 8–12 dB below the other.
  - **Track runs out (Review Focus 2):** `trackStartMs` = tone duration − 5,000 on a longer clip: the output still lasts the clip's length, the 880 Hz band in its last second is below −50 dB, and the 440 Hz source band there is above −40 dB.
  - **Overlay with captions off (Review Focus 4, `skipIf(!hasLibass)`):** project `captionsEnabled: false`, `textOverlay: { text: "WAIT FOR IT", position: "top", untilMs: 3000 }`. Compared with a render without the overlay, the mean absolute difference of rows 240–420 is above 10 at 1 s and below 1 at 5 s.
  - **No libass:** with `getFfmpegCapabilities` spied to `hasLibass: false` and an overlay set, the job fails with `DEPENDENCY_MISSING` "This ffmpeg can't burn in on-screen text (no libass). Install one with libass or remove the text.", even with captions off.
  - **Missing track:** deleting the `music_tracks` row directly before the job runs fails it with `CONFLICT` "This clip's music track was deleted. Pick another track or remove the music." and the clip becomes `failed`.
- [ ] **Step 2: Run** `pnpm vitest run tests/integration/render.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
  - Load the transcript once when captions are on or `audioMix?.duck` is set; words for ducking are `wordsInRange(speakerTranscriptWords(transcript), clip.startMs, clip.endMs)` (the same words the captions use).
  - A set `trackId` whose track is missing or in another workspace throws the "music track was deleted" error before ffmpeg runs.
  - Write the ASS file when captions are on or `textOverlay` is set, with `pages: []` when captions are off. Check libass for either, with the captions message when captions are on and the on-screen text message otherwise.
  - `overlay = { text, position, endMs: overlayEndMs(textOverlay, durationMs) }`. Pass `audio` to whichever graph runs and `music: { file: storage.resolve(track.storageKey), seekMs: audioMix.trackStartMs }` to `renderArgs` only when `plan.music` is set.
  - Log `music: Boolean(plan?.music)` and `overlay: Boolean(textOverlay)` on "clip rendered".
- [ ] **Step 4: Run** the file and `pnpm vitest run features/render` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(render): render the clip's music and on-screen text"`

### Task 7: Settings › Music

**Files:**

- Create: `components/music/music-upload-button.tsx` (+ test), `components/settings/music-library.tsx` (+ test), `app/(app)/settings/workspace/music/page.tsx`
- Modify: `components/settings/settings-nav.tsx`

**Interfaces:**

- Consumes: Task 4 `getMusicLibrary`, `renameMusicTrackAction`, `deleteMusicTrackAction`, `POST /api/uploads/music`; `MUSIC_ACCEPT`, `MUSIC_MAX_BYTES`.
- Produces:
  - `<MusicUploadButton onUploaded?={(track: MusicTrackSummary) => void} size?="sm" | "default" />`: a hidden file input (`accept={MUSIC_ACCEPT}`) behind a "Upload a track" button; XHR with progress, the same request shape as `project-uploader.tsx` (raw body, `content-type`, `x-file-name` URI-encoded). While sending it is disabled and reads "Uploading… 40%". Success → toast "Added “{title}”", `onUploaded(track)`, `router.refresh()`. A file over 50 MB is refused before sending with the toast "Music files can be up to 50 MB"; a server error toasts its `error.message`.
  - `<MusicLibrary tracks={MusicTrackSummary[]} />`.
  - Nav: "Music" (`/settings/workspace/music`) after "Rendering" in the Workspace group.

- [ ] **Step 1: Write failing component tests:**
  - The section is titled "Music library" with the description "Tracks here can go under any clip in this workspace. MP3, M4A, AAC, WAV, OGG or FLAC, up to 50 MB." and an "Upload a track" button.
  - No tracks → `Empty` "No music yet" / "Upload a track to put it under your clips."
  - A row shows the title in an input labelled "Track title", the duration as `2:10`, and "Not used", "Under 1 clip" or "Under 3 clips".
  - Editing the title and blurring calls `renameMusicTrackAction(id, "New name")` once; an unchanged blur calls nothing.
  - "Delete Summer loop" opens an `AlertDialog` "Delete “Summer loop”?" with "The file is removed from this workspace. This can't be undone." and a "Delete track" button; confirming calls `deleteMusicTrackAction`, and success toasts "Track deleted". A refusal toasts the server message (the clip names).
  - Upload button: selecting a 51 MB `File` toasts the size message and sends nothing; a mocked XHR at 40% shows "Uploading… 40%"; a 201 calls `onUploaded` with the parsed track.
- [ ] **Step 2: Run** `pnpm vitest run components/music components/settings` — FAIL.
- [ ] **Step 3: Implement** with `SettingsSection`/`SettingsSectionHeader`, `Item` rows, `Input`, `AlertDialog`, `Empty` and the `useAction` toast pattern the settings forms use. The page sets `metadata = { title: "Music" }` and renders `<MusicLibrary tracks={await getMusicLibrary()} />`.
- [ ] **Step 4: Run** the tests, `pnpm lint`, `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(music): music library in workspace settings"`

### Task 8: The "Audio & text" tab, Web Audio preview and overlay preview

**Files:**

- Create: `components/projects/audio-text-panel.tsx` (+ test), `components/projects/music-preview.tsx` (+ test)
- Modify: `components/projects/clip-editor.tsx` (+ test), `components/projects/clip-preview.tsx`, `components/projects/clip-player-dialog.tsx`, `components/ui/caption-preview.tsx` (+ test), `app/dev/components/gallery.tsx`, `features/projects/queries.ts` (`getClipEditor`), `app/(app)/projects/[id]/clips/[clipId]/page.tsx`, `docs/COMPONENTS.md`

**Interfaces:**

- Consumes: Tasks 1, 3, 4, 7 (`planAudio`, `musicGainAt`, `dbToGain`, `DEFAULT_AUDIO_MIX`, `MUSIC_DB`, `SOURCE_DB`, `FADE_MAX_MS`, `defaultOverlayText`, `overlayFontSize`, `OVERLAY_TOP_Y`, `OVERLAY_MARGIN_X`, `TEXT_OVERLAY_MAX_CHARS`, `musicTracksFor`, `MusicUploadButton`), `useVideoPlayer`, `wordsInRange`, `captionBaseline`.
- Produces:
  - `getClipEditor` returns `musicTracks: MusicTrackSummary[]` (the project's workspace); the page passes it to `ClipEditor` as `musicTracks`.
  - `<AudioTextPanel audioMix={AudioMix | null} onAudioMixChange={(mix: AudioMix | null) => void} textOverlay={TextOverlay | null} onTextOverlayChange={(overlay: TextOverlay | null) => void} tracks={MusicTrackSummary[]} clipDurationMs={number} hook={string} title={string} captionsNearTop={boolean} previewUnavailable={boolean} disabled={boolean} />`
  - `<MusicPreview src={string | null} plan={MusicPlan | null} trackStartMs={number} clipStartMs={number} sourceDb={number} onUnavailable={() => void} />` (renders a hidden `<audio>` only).
  - `CaptionPreviewOverlay` part in `caption-preview.tsx`: `{ text: string; position: "top" | "center"; fontFamily: string; fontSize: number; color: string; outlineColor: string }` plus div props, sized in 1080-frame units like `CaptionPreviewText`.
  - `ClipPreview` takes `overlay?: { text: string; position: "top" | "center"; untilMs: number | null } | null` and shows it while `currentMs − startMs < (untilMs ?? Infinity)`.
  - `ClipEditor` payload gains `audioMix` and `textOverlay`; the inspector's fourth tab is "Audio & text" (`value="audio"`).

- [ ] **Step 1: Write failing component tests:**
  - **Panel, music:**
    - The `Select` labelled "Track" lists "No music" and each track as "Summer loop · 2:10"; picking one calls `onAudioMixChange({ ...DEFAULT_AUDIO_MIX, trackId })` when the mix was null and keeps the other fields otherwise; "No music" sets `trackId: null`. Next to it sits `MusicUploadButton`, and an upload selects the new track.
    - With a track: a `Timeline` slider "Start in track" (`aria-valuetext` "0:45 of 2:10"), the waveform from `peaks` and a range for the part the clip plays; ArrowRight moves `trackStartMs` by 100 ms. The line under it reads "Starts at 0:45 of 2:10". When the rest of the track is shorter than the clip it adds "The track ends 4.2 s before the clip, so the music fades out early."
    - Sliders "Music volume" (−30…0, `aria-valuetext` "-16 dB") and "Original audio volume" (−30…+6, "0 dB"). The original-audio hint reads "Turn the game and voice up or down. 0 dB keeps them as recorded." and shows without a track.
    - Switch "Lower the music while someone talks" toggles `duck`; "Fade in (seconds)" and "Fade out (seconds)" inputs (step 0.1, 0–5) write ms.
  - **Panel, text:**
    - Switch "Show text on the video" on → `onTextOverlayChange({ text: defaultOverlayText(hook, title), position: "top", untilMs: 3000 })`; off → `null`.
    - A "Text" input (`maxLength` 80) with a "11/80" counter.
    - Radio groups "Position" (Top, Center) and "On screen" (First seconds, Whole clip); a "Seconds" input sets `untilMs` and "Whole clip" sets `null`.
    - `captionsNearTop` with position Top shows "Your captions sit near the top too. Move them or put the text in the center."
    - `previewUnavailable` shows "This browser can't play the music preview. The render will still include it."
  - **MusicPreview** (fake `AudioContext` recording `gain.setTargetAtTime` values, stubbed `HTMLMediaElement.play/pause`):
    - Nothing is created or routed while the video hasn't played (Review Focus 5).
    - After play, the context resumes, and the video is routed through a source gain of `dbToGain(sourceDb)` once, even after re-renders.
    - At clip time 5 s with `trackStartMs` 45 s the audio's `currentTime` is 50; a drift over 150 ms is corrected; under 150 ms it isn't.
    - The music gain follows `musicGainAt` (≈ `dbToGain(-26)` inside speech).
    - Pausing the video, leaving the clip range or passing `plan.lengthMs` pauses the audio.
    - Without `window.AudioContext`, `onUnavailable` is called and the video is left alone.
  - **CaptionPreviewOverlay:** renders the text, top at `240 / 1920` of the frame or centred, at `overlayFontSize` in frame units, with `text-wrap: balance` and side insets of 90 units.
  - **ClipPreview:** the overlay shows at clip time 1 s and is gone at 4 s with `untilMs: 3000`, and stays with `untilMs: null`.
  - **ClipEditor** (`clip-editor.test.tsx`): the tabs are Details, Layout, Captions, "Audio & text"; turning on the overlay autosaves a payload whose `textOverlay` is set, and the save-state reads "Saved" afterwards.
- [ ] **Step 2: Run** `pnpm vitest run components/projects components/ui/caption-preview.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
  - `MusicPreview`: one module-level `AudioContext`, created on the first video `play` event (a user gesture) and resumed there. A `WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>` makes sure each element is routed once. The video is routed only after the context is `running`, so it never plays into a suspended context. While playing, a `requestAnimationFrame` loop reads `video.currentTime`, sets the music gain with `setTargetAtTime(musicGainAt(plan, t), ctx.currentTime, 0.015)` and re-syncs the `<audio>` (`timeupdate` fires about 4 times a second, too coarse for 200 ms ramps).
  - The editor builds the plan with `planAudio(audioMix, track, endMs − startMs, wordsInRange(words, startMs, endMs))`, so a trim moves the duck and the music length at once.
  - `captionsNearTop` = captions on and `captionBaseline(style, layout) < 0.4`.
  - `ClipEffectsPreview` passes `overlay` through to `ClipPreview`; `clip-player-dialog.tsx` passes `clip.textOverlay`.
  - The gallery gets a `CaptionPreviewOverlay` example, and `docs/COMPONENTS.md` gets the part plus `AudioTextPanel`, `MusicPreview` and `MusicUploadButton`.
- [ ] **Step 4: Run** the tests, `pnpm lint`, `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(editor): audio and text tab with a live music preview"`

### Task 9: Content ID warning in the publish dialog

**Files:**

- Modify: `components/projects/publish-dialog.tsx`, `components/projects/publish-dialog.test.tsx`, `components/projects/clip-editor.tsx` (pass the live `audioMix`)

**Interfaces:**

- Consumes: `AudioMix`.
- Produces: `PublishClip` gains `audioMix: AudioMix | null` (a `Clip` already satisfies it); the editor passes `{ ...clip, status: clipStatus, audioMix }`.

- [ ] **Step 1: Write failing tests:**
  - With `audioMix.trackId` set, the form shows an `Alert` right under the Privacy field titled "Check the music rights" with "Music you don't own can get this Short claimed or muted by YouTube's Content ID. Nimbus doesn't check tracks."
  - With `audioMix: null`, or `trackId: null` (source volume only), there is no alert.
  - The dialog passes axe with the alert shown.
- [ ] **Step 2: Run** `pnpm vitest run components/projects/publish-dialog.test.tsx` — FAIL.
- [ ] **Step 3: Implement** with `Alert`, `AlertTitle`, `AlertDescription` and `WarningIcon`, below the scheduled-privacy note.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit:** `git commit -m "feat(publishing): warn about music rights before publishing"`

### Task 10: End to end, docs and phase close

**Files:**

- Create: `tests/e2e/music.spec.ts`
- Modify: `docs/DECISIONS.md` (ADR-0068), `docs/PROGRESS.md`, `docs/PIPELINE.md`, `docs/BUSINESS_LOGIC.md`, `docs/TESTING.md`, `docs/COMPONENTS.md`

- [ ] **Step 1: Write `music.spec.ts`** (`seedYouTubeChannel`/`removeYouTubeChannel` as in `publish.spec.ts`, `test.setTimeout(240_000)`):
  - Go to `/settings/workspace/music`, upload `fixtures.tone` through "Upload a track", expect a row with title "tone-880hz" and "0:30". Run axe.
  - Upload `fixtures.notVideo` named `song.mp3` and expect the toast "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file".
  - Upload the wide fixture, confirm the layout, open the first clip's editor, open "Audio & text", pick "tone-880hz · 0:30" under "Track", turn on "Show text on the video", expect the Text input to hold the clip's hook (or title), and wait for "Saved". Run axe on the tab.
  - Back on `/settings/workspace/music`, "Delete tone-880hz" then "Delete track" shows a toast naming the clip, and the row stays.
  - In the editor, "Render this clip", expect the status "Up to date" within 120 s, then the "Publish" button is enabled. Open it, expect "Check the music rights" under Privacy. Run axe.
  - Change "Music volume" with the keyboard, wait for "Saved", and expect "Render the latest edit first".
- [ ] **Step 2: Write ADR-0068 "Music and on-screen text"** in the existing format. Cover:
  - workspace `music_tracks`, the 50 MB streamed upload under `/api/uploads` (the proxy skip), sniffed formats with the stored extension taken from the sniff, ffprobe at upload, 240 waveform peaks computed once at 8 kHz mono
  - `audioMix`/`textOverlay` as nullable jsonb (null = today), whole-dB values, 0–5 s fades, the overlay text defaulting to the hook (cut at a word to 80 characters with "…", or the title when there is no hook)
  - ducking from transcript words with the captions' `spokenEnd` trim, so stretched Whisper words don't hold the duck through pauses; the 400 ms merge keeping ramps from overlapping; `eval=frame` stepping the ramps in audio-frame sizes (about 21 ms)
  - the graph: input seek, `atrim` to the music length, `amix normalize=0`, and the `alimiter` (`level=0`) added against clipping, which isn't normalisation
  - no looping, and the fades fitted into what the track has left
  - the overlay as a Title style on layer 1 wrapped by libass (`\q0`) inside 90 px side margins, 240 px from the top, 1.2× the caption size, needing libass even with captions off
  - delete blocked under `FOR UPDATE`/`FOR SHARE` locks instead of a foreign key (the track id lives in jsonb)
  - the Web Audio preview routing the video only once the context runs
  - no music on `render_edit`
  - unverified: how YouTube's Content ID treats the mixed audio, and the preview on Safari and Firefox
- [ ] **Step 3: Update the docs:**
  - **PROGRESS:** a "Phase 34: Music and on-screen text (ADR-0068)" section with Tasks 1–10 checked, the spec and plan paths, and a "Not verified" line for Content ID and non-Chromium previews.
  - **PIPELINE:** under `render_clip`, the music input, the audio graph and the overlay event, and the two new failure messages.
  - **BUSINESS_LOGIC:** a "Music and on-screen text" section with the defaults, ranges, ducking rule, the track-runs-out rule, delete blocking and the stale-render rule.
  - **TESTING:** the tone fixture, the band-level helper in `render.test.ts`, the Postgres race test, and the fake `AudioContext` in the preview tests. Note that the real-ffmpeg music checks live in `tests/integration/render.test.ts` (run by `pnpm test`), because `pnpm test:heavy` only covers whisper.cpp.
  - **COMPONENTS:** confirm the Task 8 entries and add `MusicLibrary`.
- [ ] **Step 4: Run the full gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:heavy`. All must pass (`test:heavy` skips without whisper).
- [ ] **Step 5: Commit:** `git commit -m "test(e2e): music under a clip with an on-screen title; docs for phase 34 (ADR-0068)"`
