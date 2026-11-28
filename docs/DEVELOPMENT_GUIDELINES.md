# Development guidelines

## Next.js 16 conventions

This repo runs Next 16.4. APIs differ from older versions; check `node_modules/next/dist/docs/` before using one.

- **Server Components by default.** Add `"use client"` only at interactive leaves (a button with state, a player, an editor). Pass server data down as props.
- **Reads**: `features/<f>/queries.ts`, `import "server-only"`, call `await connection()` (from `next/server`) at the top so the route renders per request. Cache Components (`cacheComponents`) is off (ADR-0015).
- **Mutations**: Server Actions in `features/<f>/actions.ts` with `"use server"`. Every action parses input with zod, returns `Result<T, AppError>`, never throws to the client, and calls `revalidatePath()` for the affected routes.
- **Uploads**: file bytes never go through a Server Action or a hosted request body (Vercel caps those at 4.5 MB). `startUploadAction` checks the mime and the size cap (`MAX_UPLOAD_BYTES`, or 50 MB for music), mints the project or track id and returns a signed token plus a target: `multipart` on S3 (the browser signs parts with `signUploadPartsAction`, PUTs them and collects their ETags), or `single` on the local driver, `/api/uploads/<token>`, which streams the body to the final key with the signed size as its limit and the magic-byte check. The browser PUTs with XHR for progress, then `completeUploadAction(token, parts)` checks the session against the token, the stored size and that the first bytes match the claimed extension. Nothing is moved after the upload.
- **Media**: `app/api/media/[...path]/route.ts` goes through `fileResponse()`: a 302 to a signed URL (4 h) when the driver has one (S3), otherwise the file streamed from `DATA_DIR` with `Range` support (206, `Content-Range`, `Accept-Ranges: bytes`) and the right `Content-Type`. `LocalStorage` rejects keys that escape `DATA_DIR`. It only serves project media and renders (`isServableKey`); the database, partial uploads and work files are 404 (ADR-0037).
- **Worker steps** work in `ctx.scratch`, the job's own directory under `SCRATCH_DIR`. Get inputs with `storage.localCopy(key, ctx.scratch, signal)`, write outputs inside the scratch dir and store them with `produceFile` or `storage.putFile`. Never build a path into storage: on S3 there is none. Count `localCopyCost` in disk checks, which run against `SCRATCH_DIR`.
- **Request code** (pages, actions, route handlers) never runs ffmpeg, ffprobe or yt-dlp, and never calls the transcription API, and never checks disk space. If it needs a binary's answer, enqueue a job or read what the worker recorded (`worker_heartbeats` holds ffmpeg capabilities).
- **Segments**: `loading.tsx` (skeletons matching the final layout), `error.tsx` (client component, friendly message, retry) and `not-found.tsx` for project and clip routes. Call `notFound()` from `next/navigation` when a lookup misses.
- **Fonts**: UI fonts come from `next/font` in `app/layout.tsx`. Caption fonts live in `assets/fonts` and are registered in `CAPTION_FONTS` (ADR-0048). Don't add others.
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

## Translations

Two locales, `en-US` and `pt-BR` (ADR-0088). No text a person reads is written inside a component.

- Messages live in `components/<area>/messages.ts` (`components/projects/messages/*.ts`), shared words in `lib/i18n/common.ts`. `defineMessages({ "en-US": {…}, "pt-BR": {…} })`: en-US is the shape, a pt-BR that differs is a type error. Add both in the same commit.
- A message with a value is a function (`memberSince: (date: string) => …`); a count goes through `plural(locale, count, { one, other })`. Don't join translated fragments: word order differs.
- Client Components: `useMessages(dictionary)` and `useLocale()` from `lib/i18n/client`. Server Components and `generateMetadata`: `getMessages(dictionary)` and `getLocale()` from `lib/i18n/server`. A helper outside React takes `t` or `locale` as an argument.
- Labels that come from `features/*` data (plans, niches, statuses, caption styles) are mapped by id in the area's messages; `features` stays free of UI text.
- Dates, numbers, currency and lists: `Intl` with the active locale. `formatDate` and `formatRelativeDay` take it.
- Errors: throw `AppError` with the English message as before, then add its Portuguese to `lib/i18n/errors-pt-br.ts` (or a pattern in `lib/i18n/errors.ts` when it carries a value). `lib/i18n/errors.test.ts` fails on a message a person can see without one. Logs stay English.
- Not translated: the product name, platform names, keys on a `Kbd`, prompts sent to Claude, anything a person typed or Claude wrote.
- Tests assert on the English text; the default context is en-US, so a component test needs no provider. Wrap in `LocaleProvider` to test another language.

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
