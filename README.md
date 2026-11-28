# Nimbus

Turn long gameplay or screen recordings into vertical 9:16 clips with word-by-word captions. Upload a video and the app transcribes it, finds the best moments, detects the webcam overlay and renders drafts. You review, tweak and export them. Everything runs locally except two optional calls: Groq for transcription, with each workspace's own key, and the Anthropic API for highlight selection, with the server's key.

## Requirements

- Node 22+ and pnpm 11
- ffmpeg + ffprobe **with libass and libx264**
- a Groq API key, added in Settings › Workspace, for transcription (without one, projects skip it)

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
pnpm run doctor              # checks ffmpeg, libass, libx264, env, Postgres, data dir
pnpm dev                     # starts the database, migrates, then Next on :3000 + the worker
```

Only Postgres runs in Docker. Next and the worker run on the host because VideoToolbox isn't available inside Docker on macOS.

Projects from the earlier SQLite version can be copied over once with `pnpm db:import-sqlite [path/to/app.db]` (defaults to `DATA_DIR/app.db`). Media files stay where they are.

## Deploying

Nimbus deploys to Vercel Pro: the web app on functions, the worker as a Vercel Daemon built from `Dockerfile.worker`, Postgres from Neon (Vercel Marketplace) and media in an R2 or S3 bucket. The bucket needs CORS for the app's origins (PUT, GET, HEAD; `Range` allowed; `Content-Range`, `Accept-Ranges`, `ETag` exposed). Preview deployments have no worker, so their jobs wait until one runs against their database. Setup, environment variables and first-deploy checks are in [docs/DEPLOY.md](docs/DEPLOY.md).

## Self-hosting

`docker-compose.selfhost.yml` runs Postgres, MinIO, the web app and the worker in containers. Copy `.env.selfhost.example` to `.env.selfhost`, fill it in and follow [docs/DEPLOY.md](docs/DEPLOY.md#self-hosting). `pnpm storage:push` copies existing `data/` media into the bucket.

## Environment

See `.env.example` for the full list. Values that also appear in Settings are only defaults: once Settings are saved, the saved values win. The main ones:

| Variable                       | Default              | Purpose                                                                                                                                                            |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATA_DIR`                     | `./data`             | Uploads and renders with the local storage driver                                                                                                                  |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Binaries                                                                                                                                                           |
| `VIDEO_ENCODER`                | `libx264`            | `libx264`, `auto` (first hardware H.264 encoder found) or a specific encoder. Anything but `libx264` turns hardware encoding on by default; Settings can toggle it |
| `WHISPER_LANGUAGE`             | `auto`               | Default transcription language; overridable in Settings                                                                                                            |
| `TRANSCRIBER`                  | `groq`               | `groq` (each workspace's key) or `fake`                                                                                                                            |
| `YTDLP_PATH`                   | `yt-dlp`             | yt-dlp binary for link imports                                                                                                                                     |
| `YTDLP_COOKIES_FROM_BROWSER`   | —                    | Browser yt-dlp reads YouTube cookies from (`chrome`, `firefox`, ...) to pass the "not a bot" check                                                                 |
| `YTDLP_COOKIES`                | —                    | Netscape `cookies.txt` path, the alternative to a browser                                                                                                          |
| `DOWNLOADER`                   | `yt-dlp`             | `yt-dlp` or `fake` (copies `FAKE_DOWNLOAD_FILE`)                                                                                                                   |
| `HIGHLIGHT_SELECTOR`           | `heuristic`          | `anthropic`, `manual` or `heuristic` (default for new projects; overridable in Settings)                                                                           |
| `ANTHROPIC_API_KEY`            | —                    | The server's key for every workspace's Claude picks and pattern finding. Never sent to the browser                                                                 |
| `ANTHROPIC_MODEL`              | `claude-sonnet-5-5`  | Model id                                                                                                                                                           |
| `MAX_UPLOAD_BYTES`             | 21474836480          | Upload limit (20 GiB)                                                                                                                                              |
| `LOG_LEVEL`                    | `info`               | pino level                                                                                                                                                         |

## Scripts

| Script                                                       | Purpose                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `pnpm dev`                                                   | Next + worker                                                                  |
| `pnpm build` / `pnpm start`                                  | Production build / server (run `pnpm worker` alongside)                        |
| `pnpm worker`                                                | Worker only                                                                    |
| `pnpm lint`, `pnpm typecheck`, `pnpm format`                 | Quality                                                                        |
| `pnpm test`                                                  | Unit + integration                                                             |
| `pnpm test:unit`, `pnpm test:integration`, `pnpm test:watch` | Single layers                                                                  |
| `pnpm test:e2e`, `pnpm test:e2e:ui`                          | Playwright                                                                     |
| `pnpm test:heavy`                                            | Real Groq transcription (skips without `GROQ_API_KEY`)                         |
| `pnpm test:s3`                                               | Storage contract on MinIO (`docker compose --profile s3 up -d`; skips if down) |
| `pnpm test:coverage`                                         | Coverage with thresholds                                                       |
| `pnpm fixtures`                                              | Generate test videos                                                           |
| `pnpm run doctor`                                            | Dependency check                                                               |
| `pnpm db:generate`, `pnpm db:migrate`                        | Drizzle migrations                                                             |
| `pnpm storage:push`                                          | Copy `DATA_DIR` media into the S3 bucket (`STORAGE_BACKEND=s3`)                |

## Docs

Start with [CLAUDE.md](CLAUDE.md), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Progress and known blockers live in [docs/PROGRESS.md](docs/PROGRESS.md).
