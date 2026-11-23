# Nimbus

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

If nothing prints, install `ffmpeg-full` (keg-only, so it doesn't replace `ffmpeg`) and point the app at it in `.env.local`:

```sh
brew install ffmpeg-full
```

```sh
FFMPEG_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe
```

Put the same two lines in `.env.test.local` so the caption tests run against it too (tests never read `.env.local`).

On Debian/Ubuntu, `apt-get install ffmpeg` includes libass.

### whisper.cpp

```sh
brew install whisper-cpp            # provides whisper-cli
mkdir -p models
curl -L -o models/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

The default is a multilingual model (~550 MB), so streams in any language can be transcribed and their spoken language detected. English-only models (`*.en.bin`) are smaller but can't detect or transcribe other languages; Settings warns when one is configured.

### yt-dlp (optional)

Needed only to import videos from a link (YouTube, Twitch VODs and the other sites yt-dlp supports). Uploads work without it.

```sh
brew install yt-dlp
```

Sites change often; if imports start failing, `brew upgrade yt-dlp` first.

### Caption fonts (optional)

Oxanium and Nunito Sans are bundled. Pricedown is licensed by Typodermic for desktop use only, so it isn't in the repo: download it from typodermicfonts.com and copy `Pricedown Bl.otf` to `assets/fonts/Pricedown-Black.otf`. Until then it shows as "Not installed" in the font picker.

## Setup

```sh
pnpm install
cp .env.example .env.local   # then edit
docker compose up -d db      # Postgres 17 on localhost:5442
pnpm db:migrate
pnpm run setup:vision        # copies MediaPipe WASM and downloads the face model into public/vendor
pnpm run doctor              # checks ffmpeg, libass, libx264, whisper, model, env, Postgres, data dir
pnpm dev                     # starts the database, migrates, then Next on :3000 + the worker
```

Only Postgres runs in Docker. Next and the worker run on the host because VideoToolbox and whisper.cpp's Metal acceleration aren't available inside Docker on macOS.

Projects from the earlier SQLite version can be copied over once with `pnpm db:import-sqlite [path/to/app.db]` (defaults to `DATA_DIR/app.db`). Media files stay where they are.

## Environment

See `.env.example` for the full list. Values that also appear in Settings are only defaults: once Settings are saved, the saved values win. The main ones:

| Variable                       | Default                                 | Purpose                                                                                                                                                            |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATA_DIR`                     | `./data`                                | Database, uploads and renders                                                                                                                                      |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe`                    | Binaries                                                                                                                                                           |
| `VIDEO_ENCODER`                | `libx264`                               | `libx264`, `auto` (first hardware H.264 encoder found) or a specific encoder. Anything but `libx264` turns hardware encoding on by default; Settings can toggle it |
| `WHISPER_BIN`                  | `whisper-cli`                           | whisper.cpp CLI                                                                                                                                                    |
| `WHISPER_MODEL`                | `./models/ggml-large-v3-turbo-q5_0.bin` | Model file                                                                                                                                                         |
| `WHISPER_LANGUAGE`             | `auto`                                  | Default transcription language; overridable in Settings                                                                                                            |
| `TRANSCRIBER`                  | `whisper`                               | `whisper` or `fake`                                                                                                                                                |
| `YTDLP_PATH`                   | `yt-dlp`                                | yt-dlp binary for link imports                                                                                                                                     |
| `YTDLP_COOKIES_FROM_BROWSER`   | —                                       | Browser yt-dlp reads YouTube cookies from (`chrome`, `firefox`, ...) to pass the "not a bot" check                                                                 |
| `YTDLP_COOKIES`                | —                                       | Netscape `cookies.txt` path, the alternative to a browser                                                                                                          |
| `DOWNLOADER`                   | `yt-dlp`                                | `yt-dlp` or `fake` (copies `FAKE_DOWNLOAD_FILE`)                                                                                                                   |
| `HIGHLIGHT_SELECTOR`           | `heuristic`                             | `anthropic`, `manual` or `heuristic` (default for new projects; overridable in Settings)                                                                           |
| `ANTHROPIC_API_KEY`            | —                                       | Needed for the `anthropic` selector. Never sent to the browser                                                                                                     |
| `ANTHROPIC_MODEL`              | `claude-sonnet-5-5`                     | Model id                                                                                                                                                           |
| `MAX_UPLOAD_BYTES`             | 21474836480                             | Upload limit (20 GiB)                                                                                                                                              |
| `LOG_LEVEL`                    | `info`                                  | pino level                                                                                                                                                         |

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
