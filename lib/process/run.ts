import "server-only"

import { spawn } from "node:child_process"

import { AppError } from "@/lib/errors"

export type RunOptions = {
  timeoutMs?: number
  signal?: AbortSignal
  cwd?: string
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
  collectStdout?: boolean
  stderrTailBytes?: number
}

export type RunResult = {
  code: number
  stdout: string
  stderrTail: string
}

const KILL_GRACE_MS = 3000

function lineSplitter(onLine: (line: string) => void) {
  let buffer = ""
  return {
    push(chunk: string) {
      buffer += chunk
      let index = buffer.search(/\r?\n|\r/)
      while (index !== -1) {
        const line = buffer.slice(0, index)
        const sep = buffer[index] === "\r" && buffer[index + 1] === "\n" ? 2 : 1
        buffer = buffer.slice(index + sep)
        onLine(line)
        index = buffer.search(/\r?\n|\r/)
      }
    },
    flush() {
      if (buffer) onLine(buffer)
      buffer = ""
    },
  }
}

export function runProcess(
  command: string,
  args: readonly string[],
  options: RunOptions = {}
): Promise<RunResult> {
  const {
    timeoutMs,
    signal,
    cwd,
    onStdoutLine,
    onStderrLine,
    collectStdout = true,
    stderrTailBytes = 4096,
  } = options

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError("CANCELLED", `${command} was cancelled`))
      return
    }

    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderrTail = ""
    let settled = false
    let timedOut = false
    let aborted = false
    let killTimer: NodeJS.Timeout | undefined

    const stdoutLines = onStdoutLine ? lineSplitter(onStdoutLine) : undefined
    const stderrLines = onStderrLine ? lineSplitter(onStderrLine) : undefined

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      if (collectStdout) stdout += chunk
      stdoutLines?.push(chunk)
    })
    child.stderr.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-stderrTailBytes)
      stderrLines?.push(chunk)
    })

    const terminate = () => {
      child.kill("SIGTERM")
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS)
    }

    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true
          terminate()
        }, timeoutMs)
      : undefined

    const onAbort = () => {
      aborted = true
      terminate()
    }
    signal?.addEventListener("abort", onAbort, { once: true })

    const cleanup = () => {
      settled = true
      if (timer) clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      signal?.removeEventListener("abort", onAbort)
    }

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return
      cleanup()
      if (error.code === "ENOENT") {
        reject(
          new AppError("DEPENDENCY_MISSING", `${command} was not found`, {
            cause: error,
          })
        )
        return
      }
      reject(
        new AppError("INTERNAL", `${command} failed to start`, { cause: error })
      )
    })

    child.on("close", (code) => {
      if (settled) return
      cleanup()
      stdoutLines?.flush()
      stderrLines?.flush()
      if (aborted) {
        reject(new AppError("CANCELLED", `${command} was cancelled`))
        return
      }
      if (timedOut) {
        reject(
          new AppError(
            "TIMEOUT",
            `${command} timed out after ${timeoutMs} ms`,
            {
              details: { stderrTail },
            }
          )
        )
        return
      }
      resolve({ code: code ?? -1, stdout, stderrTail })
    })
  })
}

export async function runOrThrow(
  command: string,
  args: readonly string[],
  options?: RunOptions
): Promise<RunResult> {
  const result = await runProcess(command, args, options)
  if (result.code !== 0) {
    throw new AppError(
      "EXTERNAL",
      `${command} exited with code ${result.code}`,
      {
        details: { stderrTail: result.stderrTail },
      }
    )
  }
  return result
}
