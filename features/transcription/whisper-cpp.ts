import "server-only"

import { access, readFile, rm } from "node:fs/promises"
import path from "node:path"

import { AppError } from "@/lib/errors"
import { runProcess } from "@/lib/process/run"

import type { RawTranscript, TranscribeInput, Transcriber } from "./transcriber"
import { parseWhisperJson, parseWhisperProgress } from "./whisper-parse"

export type WhisperOptions = {
  binary: string
  model: string
  threads: number
}

export class WhisperCppTranscriber implements Transcriber {
  readonly id = "whisper"

  constructor(private readonly options: WhisperOptions) {}

  async transcribe({
    audioPath,
    durationMs,
    language = "auto",
    signal,
    onProgress,
  }: TranscribeInput): Promise<RawTranscript> {
    try {
      await access(this.options.model)
    } catch {
      throw new AppError(
        "DEPENDENCY_MISSING",
        `Whisper model not found at ${this.options.model}`
      )
    }
    const prefix = path.join(path.dirname(audioPath), "whisper")
    const output = `${prefix}.json`
    await rm(output, { force: true })
    const result = await runProcess(
      this.options.binary,
      [
        "-m",
        this.options.model,
        "-f",
        audioPath,
        "-l",
        language,
        "-t",
        String(this.options.threads),
        "-ojf",
        "-of",
        prefix,
        "-ml",
        "1",
        "-sow",
        "-pp",
      ],
      {
        signal,
        timeoutMs: Math.max(10 * 60_000, durationMs * 4),
        collectStdout: false,
        onStderrLine: (line) => {
          const progress = parseWhisperProgress(line)
          if (progress !== null) onProgress?.(progress)
        },
      }
    )
    if (result.code !== 0) {
      throw new AppError(
        "EXTERNAL",
        `whisper.cpp exited with code ${result.code}`,
        {
          details: { stderrTail: result.stderrTail },
        }
      )
    }
    let json: string
    try {
      json = await readFile(output, "utf8")
    } catch (cause) {
      throw new AppError("EXTERNAL", "whisper.cpp produced no output", {
        cause,
      })
    }
    await rm(output, { force: true })
    return parseWhisperJson(json)
  }
}
