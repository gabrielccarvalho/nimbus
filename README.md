# Auto-Clipper

Turn long gameplay or screen recordings into vertical 9:16 clips with word-by-word captions. Upload a video and the app transcribes it, finds the best moments, detects the webcam overlay and renders drafts. You review, tweak and export them. Everything runs locally; the only optional network call is the Anthropic API for highlight selection.

## Requirements

- Node 22+ and pnpm 11
- ffmpeg + ffprobe **with libass and libx264**
- whisper.cpp (`whisper-cli`) and a ggml model, for real transcription

### ffmpeg with libass (macOS)

Homebrew's default `ffmpeg` formula may ship without libass, which is needed to burn captions in. Check with:

```sh
ffmpeg -hide_banner -filters | grep " ass "
```

If nothing prints, install the tap build (libass enabled by default) and point the app at it:

```sh
brew tap homebrew-ffmpeg/ffmpeg
brew install homebrew-ffmpeg/ffmpeg/ffmpeg
```

On Debian/Ubuntu, `apt-get install ffmpeg` includes libass.

### whisper.cpp

```sh
brew install whisper-cpp            # provides whisper-cli
mkdir -p models
curl -L -o models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

Use `ggml-small.bin` or larger for non-English or better accuracy.

## Setup

```sh
pnpm install
cp .env.example .env.local   # then edit
pnpm db:migrate
pnpm run setup:vision        # copies MediaPipe WASM and downloads the face model into public/vendor
pnpm run doctor                  # checks ffmpeg, libass, libx264, whisper, model, env, data dir
pnpm dev                     # Next on :3000 + the worker
```

## Environment

See `.env.example` for the full list. Values that also appear in Settings are only defaults: once Settings are saved, the saved values win. The main ones:

| Variable                       | Default                     | Purpose                                                                                                                                                            |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATA_DIR`                     | `./data`                    | Database, uploads and renders                                                                                                                                      |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe`        | Binaries                                                                                                                                                           |
| `VIDEO_ENCODER`                | `libx264`                   | `libx264`, `auto` (first hardware H.264 encoder found) or a specific encoder. Anything but `libx264` turns hardware encoding on by default; Settings can toggle it |
| `WHISPER_BIN`                  | `whisper-cli`               | whisper.cpp CLI                                                                                                                                                    |
| `WHISPER_MODEL`                | `./models/ggml-base.en.bin` | Model file                                                                                                                                                         |
| `WHISPER_LANGUAGE`             | `auto`                      | Default transcription language; overridable in Settings                                                                                                            |
| `TRANSCRIBER`                  | `whisper`                   | `whisper` or `fake`                                                                                                                                                |
| `HIGHLIGHT_SELECTOR`           | `heuristic`                 | `anthropic`, `manual` or `heuristic` (default for new projects; overridable in Settings)                                                                           |
| `ANTHROPIC_API_KEY`            | —                           | Needed for the `anthropic` selector. Never sent to the browser                                                                                                     |
| `ANTHROPIC_MODEL`              | `claude-sonnet-5-5`         | Model id                                                                                                                                                           |
| `MAX_UPLOAD_BYTES`             | 21474836480                 | Upload limit (20 GiB)                                                                                                                                              |
| `LOG_LEVEL`                    | `info`                      | pino level                                                                                                                                                         |

## Scripts

| Script                                                       | Purpose                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| `pnpm dev`                                                   | Next + worker                                           |
| `pnpm build` / `pnpm start`                                  | Production build / server (run `pnpm worker` alongside) |
| `pnpm worker`                                                | Worker only                                             |
| `pnpm lint`, `pnpm typecheck`, `pnpm format`                 | Quality                                                 |
| `pnpm test`                                                  | Unit + integration                                      |
| `pnpm test:unit`, `pnpm test:integration`, `pnpm test:watch` | Single layers                                           |
| `pnpm test:e2e`, `pnpm test:e2e:ui`                          | Playwright                                              |
| `pnpm test:heavy`                                            | Real whisper.cpp (skips if missing)                     |
| `pnpm test:coverage`                                         | Coverage with thresholds                                |
| `pnpm fixtures`                                              | Generate test videos                                    |
| `pnpm run doctor`                                            | Dependency check                                        |
| `pnpm db:generate`, `pnpm db:migrate`                        | Drizzle migrations                                      |

## Docs

Start with [CLAUDE.md](CLAUDE.md), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Progress and known blockers live in [docs/PROGRESS.md](docs/PROGRESS.md).
