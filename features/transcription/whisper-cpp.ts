import "server-only"

import { access, readFile, rm } from "node:fs/promises"
import path from "node:path"

import { AppError } from "@/lib/errors"
import { runProcess } from "@/lib/process/run"

import {
  isEnglishOnlyModel,
  parseDetectedLanguage,
  type LanguageVote,
} from "./language"
import type {
  DetectLanguageInput,
  RawTranscript,
  TranscribeInput,
  Transcriber,
} from "./transcriber"
import { parseWhisperJson, parseWhisperProgress } from "./whisper-parse"

export type WhisperOptions = {
  binary: string
  model: string
  threads: number
}

export class WhisperCppTranscriber implements Transcriber {
  readonly id = "whisper"
  readonly multilingual: boolean

  constructor(private readonly options: WhisperOptions) {
    this.multilingual = !isEnglishOnlyModel(options.model)
  }

  private async assertModel() {
    try {
      await access(this.options.model)
    } catch {
      throw new AppError(
        "DEPENDENCY_MISSING",
        `Whisper model not found at ${this.options.model}`
      )
    }
  }

  async detectLanguage({ samplePath, signal }: DetectLanguageInput) {
    if (!this.multilingual) return null
    await this.assertModel()
    const args = [
      "-m",
      this.options.model,
      "-f",
      samplePath,
      "-l",
      "auto",
      "-dl",
      "-t",
      String(this.options.threads),
    ]
    let vote: LanguageVote | null = null
    const result = await runProcess(this.options.binary, args, {
      signal,
      timeoutMs: 2 * 60_000,
      collectStdout: false,
      onStderrLine: (line) => {
        vote ??= parseDetectedLanguage(line)
      },
    })
    return result.code === 0 ? vote : null
  }

  async transcribe({
    audioPath,
    durationMs,
    language = "auto",
    signal,
    onProgress,
  }: TranscribeInput): Promise<RawTranscript> {
    await this.assertModel()
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
