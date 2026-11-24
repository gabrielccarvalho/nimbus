# Architecture

Nimbus is one Next.js app plus one long-running Node worker process. They share a Postgres database (Docker for local development) and a data directory on local disk. Nothing leaves the machine except optional calls to the Anthropic API and the Google (YouTube) APIs used for publishing and insights.

## System diagram

```mermaid
flowchart LR
  subgraph Browser
    UI[React UI<br/>RSC + client leaves]
    WD[Webcam detector<br/>MediaPipe WASM + border heuristic]
  end

  subgraph Next[Next.js process]
    RSC[Server Components<br/>features/*/queries.ts]
    SA[Server Actions<br/>features/*/actions.ts]
    UP[/api/uploads<br/>streaming upload/]
    MD[/api/media/...path<br/>Range serving/]
    SSE[/api/projects/id/events<br/>SSE/]
    ZIP[/api/projects/id/export<br/>streamed zip/]
  end

  subgraph Worker[worker/index.ts]
    WL[Worker loop<br/>lease → run → complete]
    H[Job handlers<br/>probe · transcribe · analyze · select · render]
  end

  DB[(Postgres)]
  FS[(DATA_DIR<br/>sources · audio · renders)]
  FF[ffmpeg / ffprobe]
  WH[whisper.cpp]
  AN[Anthropic API]

  UI --> RSC & SA & UP & MD & SSE
  WD --> SA
  RSC & SA & SSE --> DB
  UP --> FS & DB
  MD & ZIP --> FS
  WL --> DB
  WL --> H
  H --> FF & WH & AN & FS & DB
```

## Request vs worker boundary

| Runs in a request (Next)             | Runs in the worker                             |
| ------------------------------------ | ---------------------------------------------- |
| Reading projects, clips, transcripts | ffprobe, audio extraction, thumbnails, proxies |
| Validating and persisting user edits | whisper.cpp transcription                      |
| Enqueuing jobs                       | silencedetect / ebur128 analysis               |
| Streaming uploads to disk            | Highlight selection (LLM or heuristic)         |
| Serving media with Range             | Rendering clips and the horizontal edit        |
| Streaming job progress over SSE      | Orphan sweeping, temp cleanup                  |

A request never waits on ffmpeg, whisper or an LLM call. Mutations that kick off work insert a row into `jobs` and return. The one exception is the Manual LLM selector, where the user pastes JSON that is validated and post-processed synchronously (pure code, milliseconds).

## Pipeline data flow

```mermaid
sequenceDiagram
  participant U as User
  participant N as Next
  participant D as Postgres
  participant W as Worker
  U->>N: POST /api/uploads (stream)
  N->>D: project(uploaded) + asset(source) + job(probe)
  W->>D: lease probe
  W->>D: asset metadata, thumbnail, proxy, status=transcribing, job(transcribe)
  W->>D: transcript, status=analyzing, job(analyze)
  W->>D: signals, status=selecting, job(select)
  W->>D: clips(candidate), status=awaiting_layout | ready_for_review
  U->>N: confirm layout (Server Action)
  N->>D: layout(confirmed), status=ready_for_review
  U->>N: approve clips, render
  N->>D: status=rendering, job(render_clip) × N
  W->>D: assets(render), clip status, status=done
  N-->>U: SSE progress throughout
```

Each step handler is responsible for: reading its inputs, doing the work, writing outputs, transitioning the project through the state machine and enqueuing the next job, in that order. Transition and enqueue happen in one transaction.

## Folder structure

```
app/                 routes only: pages, layouts, route handlers, loading/error UI
  (app)/             app shell with sidebar
  dev/components/    component gallery (404 in production)
  api/               uploads, media, SSE
components/
  ui/                shadcn + shadcn-style primitives
  app-shell/         sidebar, header, breadcrumbs
  <domain>/          app-specific composites (projects, clips, captions, layout-editor…)
features/<name>/     domain logic per feature
lib/                 db, env, logger, storage, sse, result/errors, utils
worker/              worker entry point
scripts/             doctor, fixtures
tests/               integration, contracts, e2e, fixtures, utils
docs/
```

Import direction: `app → components → features → lib`. `features` never imports `app` or `components`. `lib` never imports runtime code from `features`; the one exception is `lib/db/schema.ts`, which imports domain _types_ (`import type`) for JSON columns.

## Adapter interfaces

All external capabilities sit behind interfaces so tests can swap them and the stack can change later.

```ts
interface StorageAdapter {
  resolve(key: string): string // absolute path inside DATA_DIR, throws on traversal
  writeStream(
    key: string,
    body: Readable,
    opts?: { maxBytes?: number }
  ): Promise<{ bytes: number }>
  stat(key: string): Promise<{ bytes: number } | null>
  readStream(key: string, range?: { start: number; end: number }): Readable
  remove(key: string): Promise<void>
  usage(): Promise<{ bytes: number }>
}

interface Transcriber {
  readonly id: string
  transcribe(input: {
    audioPath: string
    language?: string
    signal?: AbortSignal
    onProgress?: (pct: number) => void
  }): Promise<RawTranscript>
}

interface HighlightSelector {
  readonly id: "anthropic" | "manual" | "heuristic"
  select(input: SelectionInput): Promise<HighlightCandidate[]> // raw; post-processing is shared
}
```

`ProcessRunner` wraps `child_process.spawn` for ffmpeg/ffprobe/whisper with timeout, abort and stderr-tail capture. Pure builders (`features/render/filtergraph.ts`, `features/captions/ass.ts`) produce argument arrays and file contents; only the runner touches processes.

## Persistence

- Postgres 17 via `pg` + Drizzle (`lib/db`). `docker-compose.yml` runs it on port 5442; `DATABASE_URL` points at it. JSON columns are `jsonb`, times are `timestamptz`.
- Every repository method is async. `withTransaction(db, async (tx) => …)` runs a transaction; code inside must use `tx`, not `db`, or it runs outside the transaction.
- The job queue claims work with `SELECT … FOR UPDATE SKIP LOCKED` inside a transaction, so any number of workers can lease without double-claiming.
- Repositories (`features/*/repository.ts`) are the only modules that issue queries, apart from the sweep step's three key lookups.
- Files live under `DATA_DIR` with keys like `projects/<projectId>/source.mp4`, `projects/<projectId>/renders/<clipId>.mp4`. The DB stores keys, never absolute paths.

## Realtime

The worker writes `jobs.progress`, `jobs.detail` and project status to Postgres. `detail` is a small step-specific JSON object (`features/pipeline/detail.ts`: download bytes and speed, the transcript's last few hundred characters, a 240-point waveform, candidates found so far), written with the heartbeat at most every 500 ms, flushed before the job completes and cleared when it's leased again. The snapshot only includes it for running jobs. `/api/projects/[id]/events` polls the DB every 500 ms (the next poll starts after the previous one finishes) within the request and emits SSE events only when the snapshot changes, with a heartbeat comment every 15 s. The client falls back to `router.refresh()` polling if `EventSource` errors repeatedly.

## server-only in the worker

Server modules start with `import "server-only"`. That package throws unless resolved under the `react-server` export condition, so the worker runs as `tsx --conditions=react-server worker/index.ts` and Vitest aliases `server-only` to an empty module. See ADR-0016.
