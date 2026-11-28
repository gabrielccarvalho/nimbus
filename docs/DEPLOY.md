# Deploying

Nimbus runs in two shapes: on Vercel (web on functions, the worker as a Vercel Daemon) or self-hosted with Docker Compose. Both use Postgres and an S3-compatible bucket (`STORAGE_BACKEND=s3`). See ADR-0070 and [ARCHITECTURE.md](ARCHITECTURE.md).

## Vercel

You need:

- A Vercel Pro team. Daemons are a public beta and run on production deployments only. A personal, non-commercial instance fits on Hobby with the changes in [Vercel Hobby](#vercel-hobby-personal-use).
- Postgres: Neon from the Vercel Marketplace.
- A Cloudflare R2 (or AWS S3) bucket and an access key that can read, write, list and delete in it.
- Vercel CLI 65.2 or newer if you validate `vercel.json` locally. Older CLIs don't know `daemons` with `livenessProbe`.

`vercel.json` already declares the worker: built from `Dockerfile.worker`, linux/amd64, sized for Hobby: 2Gi and no instances in `iad1` until you scale it up (see [Running the worker](#running-the-worker)), `terminationGracePeriodSeconds: 600`, liveness on `GET /healthz` port 8787. Change `iad1` to the region nearest your database. On Pro, set `"instances": { "iad1": 1 }` and `"memory": "8Gi"` so the worker is always on (ADR-0094). The build migrates the database only when `VERCEL_ENV=production`, then fetches the MediaPipe assets (`pnpm setup:vision`) and runs `next build`.

### Bucket CORS

Browsers upload straight to the bucket as multipart uploads (one presigned PUT per part) and play media from signed GET URLs, so the bucket must allow the app's origin and any preview origins you use. Methods `PUT`, `GET`, `HEAD`; allowed headers `Content-Type` and `Range`; exposed headers `Content-Range`, `Accept-Ranges`, `ETag`, `Content-Length`. The browser reads each part's `ETag`, so an upload fails without it. Signed GET URLs live 4 h, so a leaked one keeps working until it expires.

R2 (dashboard › bucket › Settings › CORS policy; path not verified) and the S3 console take this JSON:

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

The worker's sweep aborts multipart uploads older than 24 h, the deadline for completing one. As a backstop, add a lifecycle rule to the bucket that aborts incomplete multipart uploads after 1 day (S3: `AbortIncompleteMultipartUpload` with `DaysAfterInitiation: 1`; R2 should have the same rule under the bucket's object lifecycle settings, not verified), so parts don't pile up if the worker is down.

### Environment variables

Daemons have no environment of their own: the worker reads the project's variables, so everything goes in the project settings. Scope `DATABASE_URL` per environment (production and preview should not share a database unless you mean them to).

| Variable                                                | Used by | Purpose                                                                                                                            |
| ------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                          | both    | Postgres connection string; the Neon integration should set it (not verified)                                                      |
| `DATABASE_POOL_MAX`                                     | both    | Connections per process (default 10); keep it low for functions                                                                    |
| `STORAGE_BACKEND`                                       | both    | `s3`                                                                                                                               |
| `S3_ENDPOINT`                                           | both    | `https://<account>.r2.cloudflarestorage.com` for R2; leave unset on AWS                                                            |
| `S3_REGION`                                             | both    | `auto` for R2; required on AWS (the bucket's region)                                                                               |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | both    | Bucket and credentials                                                                                                             |
| `S3_FORCE_PATH_STYLE`                                   | both    | `true` only for stores that need path-style URLs (MinIO)                                                                           |
| `S3_PUBLIC_ENDPOINT`                                    | web     | Only when the browser reaches storage on a different host than `S3_ENDPOINT`; used to sign URLs                                    |
| `BETTER_AUTH_SECRET`                                    | web     | 32+ random characters                                                                                                              |
| `BETTER_AUTH_URL`                                       | web     | The production URL. Preview URLs are trusted through `VERCEL_URL` and `VERCEL_BRANCH_URL`, which Vercel sets                       |
| `NIMBUS_SECRET_KEY`                                     | both    | 32+ random characters; signs upload tokens and encrypts workspace secrets                                                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`              | both    | Google sign-in and YouTube; the worker refreshes tokens when publishing                                                            |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`              | web     | Twitch sign-in                                                                                                                     |
| `ABACATEPAY_API_KEY`, `ABACATEPAY_CREATOR_PRODUCT_ID`   | web     | Creator checkout (see Billing below); without both, Plan & usage offers no checkout                                                |
| `ABACATEPAY_WEBHOOK_SECRET`                             | web     | 32+ characters, the same secret given to the AbacatePay webhook; without it the webhook route answers 404                          |
| `ANTHROPIC_API_KEY`                                     | both    | Claude picks and Find patterns for every workspace (ADR-0092)                                                                      |
| `HIGHLIGHT_SELECTOR`                                    | both    | Default selector for new projects                                                                                                  |
| `MAX_UPLOAD_BYTES`                                      | both    | Upload cap (default 20 GiB)                                                                                                        |
| `YTDLP_COOKIES_TEXT`                                    | worker  | Contents of a cookies.txt for link imports; the daemon has no browser to read                                                      |
| `WORKER_SHUTDOWN_GRACE_MS`                              | worker  | Leave unset: the worker image sets `570000`, which keeps running jobs inside the daemon's 600 s grace period. Change both together |
| `SCRATCH_CACHE_BYTES`                                   | worker  | Bound on the shared input cache under `SCRATCH_DIR/cache` (default 64 GiB); size it to the daemon's disk                           |
| `WORKER_CONCURRENCY`, `WORKER_RENDER_CONCURRENCY`       | worker  | Throughput knobs                                                                                                                   |
| `NIMBUS_ROLE`                                           | doctor  | `web` when running `pnpm run doctor` against the web side; the worker image sets `worker`                                          |

Don't set `SCRATCH_DIR` or the binary paths on Vercel. The worker image sets the first (and `WORKER_SHUTDOWN_GRACE_MS`) and puts ffmpeg and yt-dlp on the PATH; a project value would most likely replace them, though whether a project variable overrides the image's `ENV` in a Daemon is not verified.

### Billing

Creator is sold as an AbacatePay subscription (API v2, ADR-0090). Once per environment, in AbacatePay's test mode first:

1. Create a v2 API key with CUSTOMER:CREATE, SUBSCRIPTION:CREATE and SUBSCRIPTION:READ, and set it as `ABACATEPAY_API_KEY`. Test keys start `abc_dev_`, production keys `abc_prod_`.
2. Run `pnpm billing:product` with that key and set the id it prints as `ABACATEPAY_CREATOR_PRODUCT_ID`.
3. In Integração › Webhooks, add a v2 webhook to `<BETTER_AUTH_URL>/api/billing/webhook` with the events `subscription.completed`, `subscription.renewed` and `subscription.cancelled`, and the secret from `ABACATEPAY_WEBHOOK_SECRET`. AbacatePay refuses `localhost`, so test locally through a tunnel.
4. Upgrade from Settings › Plan & usage with the test card `4242 4242 4242 4242`, and check that the workspace moves to Creator within a minute.

The worker moves a Creator workspace back to Free once its paid month (plus 4 days for AbacatePay's retries) has passed without a renewal.

### Previews have no worker

Daemons run on production deployments only. A preview enqueues jobs and they wait in `jobs` until some worker connected to the same database leases them. With a preview database of its own, run a worker locally against it (`pnpm worker` with that `DATABASE_URL` and the bucket settings). Previews don't migrate, so migrate that database by hand with `pnpm db:migrate`.

A local worker pointed at the production database processes production jobs. Don't do that by accident.

### Operating it

- Every production deploy sends the worker SIGTERM. Running jobs get `WORKER_SHUTDOWN_GRACE_MS` to finish; the rest are aborted and handed back to the queue without using up a retry, and the next worker starts them again from the start of their step. `/healthz` keeps answering while the worker drains.
- Daemons bill provisioned memory while idle.
- Settings shows "No worker online" when the worker's heartbeat in `worker_heartbeats` is more than 3 minutes old.

### First deploy checks

1. Pull the production env (`vercel env pull`) and run `NIMBUS_ROLE=web pnpm run doctor` with it: env validation, Postgres, the bucket and its CORS.
2. Check that the deployed site serves `/vendor/mediapipe/*` (for example `/vendor/mediapipe/blaze_face_short_range.tflite`); webcam detection loads it in the browser. Whether the daemon's `root: "./"` affects the web build's static assets is unverified.
3. Upload a short video and check that it reaches the bucket, the worker picks it up and the settings page shows the worker online.

## Vercel Hobby (personal use)

Hobby runs Nimbus for one person if the worker is on only while there is work. It can't host the paid product: Vercel's terms limit Hobby to "personal or non-commercial use", and Nimbus sells Creator. The daemon quota is shared by the whole team, so the capacity below is the total for every user.

Limits as of November 2026 ([Daemons limits](https://vercel.com/docs/daemons/limits), [Limits](https://vercel.com/docs/limits), [Hobby](https://vercel.com/docs/plans/hobby)):

| Resource                   | Hobby                                              | What it means here                                                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Daemon size                | 1 GiB or 2 GiB, 1 vCPU                             | Pro's `8Gi` isn't available                                                           |
| Daemon Active CPU          | 5 h per month                                      | The real ceiling: ffmpeg time (budget below)                                          |
| Daemon Provisioned Memory  | 420 GB-h per month, counted while idle             | One 2 GiB instance left on runs out in about 9 days; about 210 instance-hours a month |
| Quota reached              | Daemons stop until the 1st (UTC) or an upgrade     | Jobs wait in `jobs`                                                                   |
| Functions                  | 2 GB / 1 vCPU, 300 s max; 4 h Active CPU, 360 GB-h | See "Open project pages" below                                                        |
| Function quota reached     | The feature pauses, in most cases for 30 days      | The site can go down for the rest of the month                                        |
| Fast Data Transfer         | 100 GB                                             | Media plays from the bucket, so this stays small                                      |
| Static files, request body | 100 MB per CLI deploy, 4.5 MB per request          | `public/` is about 29 MB; uploads go straight to the bucket                           |
| Container Registry         | 10 GB storage                                      | The worker image is about 2.1 GB; whether old images count isn't verified             |
| Runtime logs               | 1 hour                                             | Read worker logs soon after a failure                                                 |

### Active CPU budget

Measured with ffmpeg on one Apple M5 core on a synthetic 1080p60 source at 10 Mb/s, then doubled for a Vercel vCPU. The factor of two is a guess, so treat these as estimates and check the daemon's Active CPU in Usage after the first real project.

| Step                                    | CPU per unit             | Per 1 h recording with 5 clips |
| --------------------------------------- | ------------------------ | ------------------------------ |
| probe (640 px proxy of the whole video) | ~35 min per source hour  | ~35 min                        |
| audio, analysis, cut detection          | ~1–2 min per source hour | ~2 min                         |
| render_clip (60 s, 1080×1920)           | ~2–5 min per clip        | ~10–25 min                     |
| render_edit (horizontal edit)           | ~3 h per source hour     | don't run it on the daemon     |

That is about 50–60 CPU-minutes per 1-hour recording, so 5 h covers roughly 5 one-hour recordings a month (10 half-hour ones). Transcription (Groq) and selection (Claude) are network calls and use almost no CPU. Wall time is about one hour per 1-hour recording on 1 vCPU, about 2 GB-h of memory, so memory only runs out when the worker is left on idle.

### Free tiers next to it

- **Neon Free**: 100 CU-hours per project per month, and the compute can't sleep while anything queries it for 5 minutes. The worker polls every `WORKER_POLL_MS` (1 s) and an open project page polls every 500 ms, so a worker left on keeps the database awake: about 180 CU-hours a month at 0.25 CU, and Neon suspends the compute mid-month. Fix the compute size at 0.25 CU in the Neon console; Free autoscales up to 2 CU, which burns 8× faster. 1 GB storage and 5 GB transfer are enough for one person.
- **R2 Free**: 10 GB-month of storage, free egress. A 1-hour 1080p60 recording at 10 Mb/s is about 4.5 GB, so two recordings fill it and anything past that is billed. Delete projects once their clips are exported.

### Changes from the Pro setup

1. `vercel.json` already sets the daemon to `"memory": "2Gi"` and `"instances": { "iad1": 0 }`.
2. Use Vercel CLI 65.2 or newer (`vercel daemons scale` needs 64.3).
3. Set `WORKER_CONCURRENCY=1` (one vCPU), `SCRATCH_CACHE_BYTES` and `MAX_UPLOAD_BYTES` well under the daemon's disk (for example 10 GiB and 6 GiB). The daemon's ephemeral disk size isn't documented, and the defaults assume 64 GiB.
4. Leave `ABACATEPAY_*` unset so there is no checkout. Sign up with the address in `ADMIN_EMAIL` (`features/accounts/schema.ts`) to get the `admin` plan; any other account is Free (60 render minutes, 25 GB).
5. Keep `HIGHLIGHT_SELECTOR` and the rest as in the Pro table.

### Running the worker

`instances: 0` keeps the daemon off, so uploads wait in the queue and Settings shows "No worker online". Start it when there is work and stop it once the queue is empty:

```sh
vercel daemons scale worker iad1=1    # starts in a minute or so
vercel daemons scale worker iad1=0    # SIGTERM; running jobs get the grace period, the rest go back to the queue
```

The override survives deploys and wins over `instances` until `vercel daemons scale worker --reset`.

For heavy work (long recordings, the horizontal edit), run the worker on your own machine instead: `vercel env pull .env.production.local --environment=production`, then `NODE_ENV=production pnpm worker`, which reads that file ahead of `.env.local`. Add `VIDEO_ENCODER=auto` to it, and drop `SCRATCH_DIR` and the binary paths if the pull brought any. It uses no daemon quota and gets the machine's hardware encoder. It processes production jobs, which here is the point. It needs ffmpeg and yt-dlp locally (`pnpm run doctor`).

The worker also runs the maintenance timers: the 6-hour sweep, stats syncs, and the daily deletion of YouTube stats older than 30 days. While it's off, none of these run and old YouTube data stays past 30 days, so start it at least once a week.

Scaling isn't automated. The full fix would be for the web side to scale the daemon to 1 through the Vercel REST API when it enqueues a job and finds no live heartbeat, and for the worker to scale itself to 0 after a few idle minutes. That isn't built yet.

### Open project pages

`/api/projects/[id]/events` streams for as long as the page is open: Vercel cuts it at 300 s and `EventSource` reconnects. Each open project page keeps a function instance alive at 2 GB and keeps Neon awake, so 360 GB-h is about 180 instance-hours a month (tabs open together may share an instance; not verified). Close project tabs you aren't watching. The fix in code would be to end the stream once the project has no running jobs. That isn't built either.

## Self-hosting

Docker Compose 2.24 or newer (the override file uses `!reset` and `!override`).

```sh
cp .env.selfhost.example .env.selfhost   # then fill in the secrets and MinIO's root user
docker compose -f docker-compose.yml -f docker-compose.selfhost.yml \
  --env-file .env.selfhost --profile selfhost up -d --build
```

This runs Postgres, MinIO, a one-off `migrate`, `web` and `worker`. The app listens on port 3000 (`NIMBUS_WEB_PORT`) and MinIO's S3 API on 9010 (`NIMBUS_S3_PORT`), which browsers need for signed URLs. Both listen on every interface; set `NIMBUS_S3_PORT=127.0.0.1:9010` (likewise `NIMBUS_WEB_PORT`) when a reverse proxy on the same host fronts them. Postgres and the MinIO console are not published. When the app is reached on another host or port, keep `BETTER_AUTH_URL`, `MINIO_CORS_ORIGIN` and `S3_PUBLIC_ENDPOINT` in step; MinIO takes its CORS origin from `MINIO_CORS_ORIGIN` rather than bucket rules.

The MinIO image is Bitnami's frozen `bitnamilegacy/minio` build, because official MinIO images are no longer published. It gets no security updates, so keep port 9010 off the public internet or swap it for a maintained S3-compatible store such as Garage or SeaweedFS (neither tested with Nimbus).

Transcription needs no server setup: each workspace adds its own Groq key in Settings › Workspace, and projects in a workspace without one skip it (ADR-0091). The worker needs outbound HTTPS to `api.groq.com`.

### Moving existing media

`pnpm storage:push` copies media from `DATA_DIR` into the configured bucket. Run it on the host with `STORAGE_BACKEND=s3` and the bucket settings (for the self-host stack: `S3_ENDPOINT=http://localhost:9010`, `S3_BUCKET=nimbus`, `S3_FORCE_PATH_STYLE=true` and MinIO's root user as the keys). It streams each file, skips `tmp/` and keys whose size in the bucket already matches, and prints copied, skipped and failed counts. It exits non-zero when a copy failed; run it again to retry. Move the database separately (`pg_dump` into the new Postgres).
