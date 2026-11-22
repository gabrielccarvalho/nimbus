export const appErrorCodes = [
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_TRANSITION",
  "DEPENDENCY_MISSING",
  "EXTERNAL",
  "TIMEOUT",
  "CANCELLED",
  "STORAGE",
  "TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "INTERNAL",
] as const

export type AppErrorCode = (typeof appErrorCodes)[number]

export type AppErrorOptions = {
  cause?: unknown
  details?: Record<string, unknown>
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly details: Record<string, unknown> | undefined

  constructor(
    code: AppErrorCode,
    message: string,
    options: AppErrorOptions = {}
  ) {
    super(message, { cause: options.cause })
    this.name = "AppError"
    this.code = code
    this.details = options.details
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  if (error instanceof Error) {
    return new AppError("INTERNAL", error.message, { cause: error })
  }
  return new AppError("INTERNAL", "Unknown error", { cause: error })
}

const nonRetryable: ReadonlySet<AppErrorCode> = new Set([
  "VALIDATION",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "DEPENDENCY_MISSING",
  "UNSUPPORTED_MEDIA",
  "TOO_LARGE",
  "CANCELLED",
])

export function isRetryable(error: AppError): boolean {
  return !nonRetryable.has(error.code)
}

export function toUserMessage(error: unknown): string {
  const appError = toAppError(error)
  if (appError.code === "INTERNAL") {
    return "Something went wrong. Check the logs for details."
  }
  return appError.message
}

export type SerializedAppError = {
  code: AppErrorCode
  message: string
}

export type Result<T, E = SerializedAppError> =
  { ok: true; value: T } | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err(error: unknown): Result<never> {
  const appError = toAppError(error)
  return {
    ok: false,
    error: { code: appError.code, message: toUserMessage(appError) },
  }
}

export function assertNever(value: never): never {
  throw new AppError("INTERNAL", `Unexpected value: ${String(value)}`)
}
