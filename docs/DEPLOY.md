# Deploying

Nimbus runs in two shapes: on Vercel (web on functions, the worker as a Vercel Daemon) or self-hosted with Docker Compose. Both use Postgres and an S3-compatible bucket (`STORAGE_DRIVER=s3`). See ADR-0070 and [ARCHITECTURE.md](ARCHITECTURE.md).

## Vercel

You need:

- A Vercel Pro team. Daemons are a public beta and run on production deployments only.
- Postgres: Neon from the Vercel Marketplace.
- A Cloudflare R2 (or AWS S3) bucket and an access key that can read, write, list and delete in it.
- Vercel CLI 65.2 or newer if you validate `vercel.json` locally. Older CLIs don't know `daemons` with `livenessProbe`.

`vercel.json` already declares the worker: built from `Dockerfile.worker`, linux/amd64, one instance in `iad1`, 8Gi, `terminationGracePeriodSeconds: 600`, liveness on `GET /healthz` port 8787. Change `iad1` to the region nearest your database. The build migrates the database only when `VERCEL_ENV=production`, then fetches the MediaPipe assets (`pnpm setup:vision`) and runs `next build`.

### Bucket CORS

Browsers upload straight to the bucket as multipart uploads (one presigned PUT per part) and play media from signed GET URLs, so the bucket must allow the app's origin and any preview origins you use. Methods `PUT`, `GET`, `HEAD`; allowed headers `Content-Type` and `Range`; exposed headers `Content-Range`, `Accept-Ranges`, `ETag`, `Content-Length`. The browser reads each part's `ETag`, so an upload fails without it.

R2 (dashboard › bucket › Settings › CORS policy) and the S3 console take this JSON:

```json
[
  {
    "AllowedOrigins": [
      "https://nimbus.example.com",
      "https://nimbus-git-main-team.vercel.app"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": [
      "Content-Range",
      "Accept-Ranges",
      "ETag",
      "Content-Length"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

With `aws s3api put-bucket-cors`, wrap the array as `{ "CORSRules": [...] }`. `pnpm run doctor` warns when the `BETTER_AUTH_URL` origin is missing from the rules.

### Abandoned uploads

The worker's sweep aborts multipart uploads older than 24 h, the deadline for completing one. As a backstop, add a lifecycle rule to the bucket that aborts incomplete multipart uploads after 1 day (S3: `AbortIncompleteMultipartUpload` with `DaysAfterInitiation: 1`; R2 has the same rule under the bucket's object lifecycle settings), so parts don't pile up if the worker is down.

### Environment variables

Daemons have no environment of their own: the worker reads the project's variables, so everything goes in the project settings. Scope `DATABASE_URL` per environment (production and preview should not share a database unless you mean them to).

| Variable                                                             | Used by | Purpose                                                                                                  |
| -------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                       | both    | Postgres connection string; the Neon integration sets it                                                 |
| `DATABASE_POOL_MAX`                                                  | both    | Connections per process (default 10); keep it low for functions                                          |
| `STORAGE_DRIVER`                                                     | both    | `s3`                                                                                                     |
| `S3_ENDPOINT`                                                        | both    | `https://<account>.r2.cloudflarestorage.com` for R2; leave unset on AWS                                  |
| `S3_REGION`                                                          | both    | `auto` for R2; required on AWS (the bucket's region)                                                     |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`              | both    | Bucket and credentials                                                                                   |
| `S3_FORCE_PATH_STYLE`                                                | both    | `true` only for stores that need path-style URLs (MinIO)                                                 |
| `S3_PUBLIC_ENDPOINT`                                                 | web     | Only when the browser reaches storage on a different host than `S3_ENDPOINT`; used to sign URLs          |
| `BETTER_AUTH_SECRET`                                                 | web     | 32+ random characters                                                                                    |
| `BETTER_AUTH_URL`                                                    | web     | The production URL. Preview URLs are trusted through `VERCEL_URL`, which Vercel sets                     |
| `NIMBUS_SECRET_KEY`                                                  | both    | 32+ random characters; signs upload tokens and encrypts workspace secrets                                |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                           | both    | Google sign-in and YouTube; the worker refreshes tokens when publishing                                  |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`                           | web     | Twitch sign-in                                                                                           |
| `ANTHROPIC_API_KEY`                                                  | both    | The `anthropic` highlight selector                                                                       |
| `HIGHLIGHT_SELECTOR`                                                 | both    | Default selector for new projects                                                                        |
| `MAX_UPLOAD_BYTES`                                                   | both    | Upload cap (default 20 GiB)                                                                              |
| `YTDLP_COOKIES_TEXT`                                                 | worker  | Contents of a cookies.txt for link imports; the daemon has no browser to read                            |
| `WORKER_SHUTDOWN_GRACE_MS`                                           | worker  | `570000`: running jobs get this long after SIGTERM, inside the daemon's 600 s grace period               |
| `SCRATCH_CACHE_BYTES`                                                | worker  | Bound on the shared input cache under `SCRATCH_DIR/cache` (default 64 GiB); size it to the daemon's disk |
| `WORKER_CONCURRENCY`, `WORKER_RENDER_CONCURRENCY`, `WHISPER_THREADS` | worker  | Throughput knobs                                                                                         |
| `NIMBUS_ROLE`                                                        | doctor  | `web` when running `pnpm run doctor` against the web side; the worker image sets `worker`                |

Don't set `WHISPER_MODEL`, `SCRATCH_DIR` or the binary paths on Vercel. The worker image sets the first two and puts ffmpeg, whisper-cli and yt-dlp on the PATH; a project value would replace them.

### Previews have no worker

Daemons run on production deployments only. A preview enqueues jobs and they wait in `jobs` until some worker connected to the same database leases them. With a preview database of its own, run a worker locally against it (`pnpm worker` with that `DATABASE_URL` and the bucket settings). Previews don't migrate, so migrate that database by hand with `pnpm db:migrate`.

A local worker pointed at the production database processes production jobs. Don't do that by accident.

### Operating it

- Every production deploy sends the worker SIGTERM. Running jobs get `WORKER_SHUTDOWN_GRACE_MS` to finish; the rest are aborted and retried from the start of their step. `/healthz` keeps answering while the worker drains.
- Daemons bill provisioned memory while idle.
- Settings shows "No worker online" when the worker's heartbeat in `worker_heartbeats` is more than 3 minutes old.

### First deploy checks

1. Pull the production env (`vercel env pull`) and run `NIMBUS_ROLE=web pnpm run doctor` with it: env validation, Postgres, the bucket and its CORS.
2. Check that the deployed site serves `/vendor/mediapipe/*` (for example `/vendor/mediapipe/blaze_face_short_range.tflite`); webcam detection loads it in the browser. Whether the daemon's `root: "./"` affects the web build's static assets is unverified.
3. Upload a short video and check that it reaches the bucket, the worker picks it up and the settings page shows the worker online.

## Self-hosting

Docker Compose 2.24 or newer (the override file uses `!reset` and `!override`).

```sh
cp .env.selfhost.example .env.selfhost   # then fill in the secrets and MinIO's root user
docker compose -f docker-compose.yml -f docker-compose.selfhost.yml \
  --env-file .env.selfhost --profile selfhost up -d --build
```

This runs Postgres, MinIO, a one-off `migrate`, `web` and `worker`. The app listens on port 3000 (`NIMBUS_WEB_PORT`) and MinIO's S3 API on 9010 (`NIMBUS_S3_PORT`), which browsers need for signed URLs. Postgres and the MinIO console are not published. When the app is reached on another host or port, keep `BETTER_AUTH_URL`, `MINIO_CORS_ORIGIN` and `S3_PUBLIC_ENDPOINT` in step; MinIO takes its CORS origin from `MINIO_CORS_ORIGIN` rather than bucket rules.

The MinIO image is Bitnami's frozen `bitnamilegacy/minio` build, because official MinIO images are no longer published. It gets no security updates, so keep port 9010 off the public internet or swap it for a maintained S3-compatible store such as Garage or SeaweedFS (neither tested with Nimbus).

The worker image downloads a pinned whisper model and checks its sha256. To use another model, pass `WHISPER_MODEL_URL` and `WHISPER_MODEL_FILE` as build args and change `WHISPER_MODEL_SHA256` to the new file's hash, or set it empty to skip the check.

### Moving existing media

`pnpm storage:push` copies media from `DATA_DIR` into the configured bucket. Run it on the host with `STORAGE_DRIVER=s3` and the bucket settings (for the self-host stack: `S3_ENDPOINT=http://localhost:9010`, `S3_BUCKET=nimbus`, `S3_FORCE_PATH_STYLE=true` and MinIO's root user as the keys). It streams each file, skips `tmp/` and keys whose size in the bucket already matches, and prints copied, skipped and failed counts. It exits non-zero when a copy failed; run it again to retry. Move the database separately (`pg_dump` into the new Postgres).
