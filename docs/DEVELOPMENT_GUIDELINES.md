# Development guidelines

## Next.js 16 conventions

This repo runs Next 16.4. APIs differ from older versions; check `node_modules/next/dist/docs/` before using one.

- **Server Components by default.** Add `"use client"` only at interactive leaves (a button with state, a player, an editor). Pass server data down as props.
- **Reads**: `features/<f>/queries.ts`, `import "server-only"`, call `await connection()` (from `next/server`) at the top so the route renders per request. Cache Components (`cacheComponents`) is off (ADR-0015).
- **Mutations**: Server Actions in `features/<f>/actions.ts` with `"use server"`. Every action parses input with zod, returns `Result<T, AppError>`, never throws to the client, and calls `revalidatePath()` for the affected routes.
- **Uploads** never go through Server Actions (body limits). `app/api/uploads/route.ts` streams `request.body` to disk with `Readable.fromWeb` + `stream/promises.pipeline`, enforces `MAX_UPLOAD_BYTES`, checks the declared mime and the magic bytes, and writes to `*.part` then renames.
- **Media**: `app/api/media/[...path]/route.ts` serves files from `DATA_DIR` with `Range` support (206, `Content-Range`, `Accept-Ranges: bytes`), path traversal protection (resolve, then verify the result stays inside `DATA_DIR`) and the right `Content-Type`. It only serves project media and renders (`isServableKey`); the database, partial uploads and work files are 404 (ADR-0037).
- **Segments**: `loading.tsx` (skeletons matching the final layout), `error.tsx` (client component, friendly message, retry) and `not-found.tsx` for project and clip routes. Call `notFound()` from `next/navigation` when a lookup misses.
- **Fonts** come from `next/font` in `app/layout.tsx`. Don't add others.
- **Typed routes** are on (`typedRoutes: true`). Use `Link` with literal or template hrefs; `as Route` only when building dynamic hrefs.
- **Long work** never runs in a request. Enqueue a job.
- **Route handlers** use the Node runtime (default). Don't set `runtime = "edge"`.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes` off (too noisy with third-party types).
- No `any`. Unknown input is `unknown` and parsed with zod.
- Exhaustive `switch` over unions ends with `assertNever(x)`.
- Prefer `type` aliases and discriminated unions. Export inferred types from zod schemas (`z.infer`).

## Errors

```ts
type AppErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "DEPENDENCY_MISSING"
  | "EXTERNAL"
  | "TIMEOUT"
  | "CANCELLED"
  | "STORAGE"
  | "INTERNAL"
class AppError extends Error {
  code
  cause
  details?
}
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }
```

- Domain code throws `AppError`. Boundaries (actions, route handlers, job handlers) catch and convert.
- Users see `toUserMessage(error)`: the message for known codes, a generic sentence for `INTERNAL`. Never a stack trace.
- Job handlers mark errors as retryable or not (`DEPENDENCY_MISSING`, `VALIDATION` and `INVALID_TRANSITION` are not).

## Logging

- `lib/logger.ts` exports a pino logger. Pretty in development, JSON otherwise, `silent` in tests unless `LOG_LEVEL` is set.
- Always log with context: `logger.child({ projectId, jobId })`.
- Never log secrets, full transcripts or file contents.

## Code style

- Prettier (repo config: no semicolons, double quotes, trailing commas es5) + `prettier-plugin-tailwindcss` for class ordering.
- Files kebab-case, components PascalCase, hooks `useX`, tests `*.test.ts(x)` beside the source, Playwright specs `*.spec.ts`.
- Comments only for what the code can't say: constraints, gotchas, workaround reasons.
- Pure functions for logic; side effects at the edges.

## Accessibility

- Every interactive element is keyboard reachable with a visible focus ring (the preset's `focus-visible:ring-*`).
- Every control has an accessible name (`aria-label` or a `<Label>`).
- Color is never the only signal: status badges carry text, selected states carry an icon or `aria-pressed`.
- Respect `prefers-reduced-motion` (`motion-safe:` / `motion-reduce:` variants).

## Commits and PRs

Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`, `perf:`, `ci:`. One commit per completed task group. No force-push, no history rewrites, no AI attribution trailers.

PR checklist:

- [ ] `pnpm lint && pnpm typecheck && pnpm test` green (plus `pnpm test:e2e` for UI changes)
- [ ] shadcn-first rule followed, COMPONENTS.md updated
- [ ] Inputs validated with zod at every boundary
- [ ] No hard-coded colors
- [ ] Keyboard and screen-reader checked
- [ ] Docs, PROGRESS.md and ADRs updated
