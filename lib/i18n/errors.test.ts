import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { trackInUseMessage } from "@/features/music/media"

import { matchesErrorPattern, translateError } from "./errors"
import { errorsPtBR } from "./errors-pt-br"

describe("translateError", () => {
  it("returns the English message for en-US", () => {
    expect(translateError("Track not found", "en-US")).toBe("Track not found")
    expect(translateError("Your plan allows 3 publishes a day", "en-US")).toBe(
      "Your plan allows 3 publishes a day"
    )
  })

  it("looks a fixed message up by its English text", () => {
    expect(translateError("Track not found", "pt-BR")).toBe(
      "Faixa não encontrada"
    )
    expect(translateError("Sign in to continue", "pt-BR")).toBe(
      "Entre para continuar"
    )
    expect(translateError("Invalid id", "pt-BR")).toBe("ID inválido")
    expect(
      translateError(
        "Something went wrong. Check the logs for details.",
        "pt-BR"
      )
    ).toBe("Algo deu errado. Veja os logs para mais detalhes.")
  })

  it("does not read object members as messages", () => {
    expect(translateError("constructor", "pt-BR")).toBe("constructor")
    expect(translateError("toString", "pt-BR")).toBe("toString")
  })

  it("rebuilds a message with values in it", () => {
    expect(translateError("Your plan allows 3 publishes a day", "pt-BR")).toBe(
      "Seu plano permite 3 publicações por dia"
    )
    expect(
      translateError("Clips must be between 5 and 180 seconds long", "pt-BR")
    ).toBe("Os cortes precisam ter entre 5 e 180 segundos")
    expect(translateError("ffmpeg exited with code 1", "pt-BR")).toBe(
      "ffmpeg terminou com o código 1"
    )
    expect(translateError("Download failed: HTTP Error 403", "pt-BR")).toBe(
      "Falha no download: HTTP Error 403"
    )
  })

  it("translates the fixed words a message carries", () => {
    expect(
      translateError(
        "Can't move a project from ready_for_review to probing",
        "pt-BR"
      )
    ).toBe(
      "Não dá para mover um projeto de pronto para revisão para lendo o vídeo"
    )
    expect(translateError("Job made no progress for 1 hour", "pt-BR")).toBe(
      "A tarefa ficou sem progresso por 1 hora"
    )
    expect(translateError("Job ran longer than 30 minutes", "pt-BR")).toBe(
      "A tarefa passou de 30 minutos"
    )
    expect(translateError("Job ran longer than 500 ms", "pt-BR")).toBe(
      "A tarefa passou de 500 ms"
    )
    expect(
      translateError(
        "Not enough free disk space to download this video (120 MB free)",
        "pt-BR"
      )
    ).toBe("Sem espaço livre em disco para baixar este vídeo (120 MB livres)")
    expect(translateError("Claude declined to pick insights", "pt-BR")).toBe(
      "O Claude se recusou a escolher insights"
    )
    expect(translateError("the API returned an error", "pt-BR")).toBe(
      "a API retornou um erro"
    )
  })

  it("translates the zod issue inside a JSON shape error", () => {
    expect(
      translateError("The JSON doesn't match the expected shape", "pt-BR")
    ).toBe("O JSON não está no formato esperado")
    expect(
      translateError(
        "The JSON doesn't match the expected shape (clips: Invalid input: expected array, received undefined)",
        "pt-BR"
      )
    ).toBe("O JSON não está no formato esperado (clips: Entrada inválida)")
  })

  it("translates zod's own size messages", () => {
    expect(
      translateError(
        "Too big: expected string to have <=100 characters",
        "pt-BR"
      )
    ).toBe("Valor inválido: o texto precisa ter no máximo 100 caracteres")
    expect(
      translateError("Too small: expected number to be >=1", "pt-BR")
    ).toBe("Valor inválido: o número precisa ser no mínimo 1")
  })

  it.each([
    [
      ["Intro"],
      "Esta faixa está em “Intro”. Remova a faixa desse corte primeiro.",
    ],
    [
      ["Intro", "Rock and roll"],
      "Esta faixa está em “Intro” e “Rock and roll”. Remova a faixa desses cortes primeiro.",
    ],
    [
      ["A", "B", "C"],
      "Esta faixa está em “A”, “B” e mais 1 corte. Remova a faixa desses cortes primeiro.",
    ],
    [
      ["A", "B", "C", "D"],
      "Esta faixa está em “A”, “B” e mais 2 cortes. Remova a faixa desses cortes primeiro.",
    ],
  ])("names the clips a track is under: %j", (titles, expected) => {
    const message = trackInUseMessage(titles.map((title) => ({ title })))
    expect(translateError(message, "pt-BR")).toBe(expected)
  })

  it("falls back to the English message", () => {
    expect(translateError("quotaExceeded: try later", "pt-BR")).toBe(
      "quotaExceeded: try later"
    )
    expect(translateError("Claude declined to pick widgets", "pt-BR")).toBe(
      "Claude declined to pick widgets"
    )
  })
})

const root = path.resolve(import.meta.dirname, "../..")

// Thrown for states the app never reaches or by test doubles; they stay in English.
const allowed: Record<string, string> = {
  "Music probe is missing its track": "job payload invariant",
  "Publish job is missing its publication": "job payload invariant",
  "Channel sync is missing its channel": "job payload invariant",
  "Analysis job is missing its channel": "job payload invariant",
  "Stats batch is missing its Shorts": "job payload invariant",
  "Stats job is missing its publication": "job payload invariant",
  "Uploads job is missing its channel": "job payload invariant",
  "Render job is missing its clip": "job payload invariant",
  "Job has no project": "job payload invariant",
  "Fake YouTube upload failure": "test double",
  "Set FAKE_DOWNLOAD_FILE to use the fake downloader": "test double",
  "Invalid storage key": "storage driver invariant",
  "The local driver has no multipart uploads": "storage driver invariant",
  "Path escapes the data directory": "storage driver invariant",
  "Invalid 7": "every label is checked on its own below",
}

// Messages built somewhere else than the throw site, and what checks them.
const indirect: Record<string, string> = {
  "features/music/service.ts trackInUseMessage(using)":
    "the clip names test above",
  "features/clips/service.ts problem": "partsProblem, in builders",
  "features/highlights/anthropic.ts describeApiError(error)":
    "describeApiError, in builders",
  "features/downloads/yt-dlp-parse.ts message": "KNOWN_ERRORS, in builders",
  "features/publishing/youtube-http.ts message":
    "Google's own text, or YouTube returned N",
  "features/transcription/groq.ts message":
    "Groq's own text, or Groq returned N",
}

const builders: { file: string; from: string; to: string; before: RegExp }[] = [
  {
    file: "features/clips/parts.ts",
    from: "export function partsProblem",
    to: "\n}\n",
    before: /return\s+$/,
  },
  {
    file: "features/highlights/anthropic.ts",
    from: "export function describeApiError",
    to: "\n}\n",
    before: /return\s+$/,
  },
  {
    file: "features/downloads/yt-dlp-parse.ts",
    from: "const KNOWN_ERRORS",
    to: "\n]\n",
    before: /,\s*$/,
  },
  {
    file: "features/jobs/queue.ts",
    from: "async recoverExpired",
    to: "\n    },\n",
    before: /error:\s+$/,
  },
]

type Found = { message: string; template: boolean; where: string }

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(relative)
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [relative]
        : []
    })
    .sort()
}

function literalEnd(source: string, at: number): number | null {
  const quote = source[at]
  if (quote !== '"' && quote !== "'" && quote !== "`") return null
  let i = at + 1
  while (i < source.length) {
    if (source[i] === "\\") i += 2
    else if (source[i] === quote) return i + 1
    else if (quote === "`" && source.startsWith("${", i)) {
      i = closingEnd(source, i + 2, "{", "}")
    } else i++
  }
  return source.length
}

function closingEnd(source: string, at: number, open: string, close: string) {
  let depth = 1
  let i = at
  while (i < source.length) {
    const end = literalEnd(source, i)
    if (end !== null) i = end
    else {
      if (source[i] === open) depth++
      else if (source[i] === close && --depth === 0) return i + 1
      i++
    }
  }
  return source.length
}

function sample(literal: string) {
  const body = literal.slice(1, -1)
  if (literal[0] !== "`") return body.replace(/\\(.)/g, "$1")
  let text = ""
  let i = 0
  while (i < body.length) {
    if (body.startsWith("${", i)) {
      text += "7"
      i = closingEnd(body, i + 2, "{", "}")
    } else {
      if (body[i] === "\\") i++
      text += body[i]
      i++
    }
  }
  return text
}

function literals(source: string, offset = 0, before?: RegExp) {
  const found: { message: string; template: boolean; at: number }[] = []
  let i = 0
  while (i < source.length) {
    const end = literalEnd(source, i)
    if (end === null) {
      i++
      continue
    }
    const head = source.slice(0, i)
    if (before ? before.test(head) : !/[!=]==\s*$/.test(head)) {
      const literal = source.slice(i, end)
      found.push({
        message: sample(literal),
        template: literal.includes("${"),
        at: offset + i,
      })
    }
    i = end
  }
  return found
}

function splitArguments(source: string) {
  const parts: { text: string; at: number }[] = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < source.length) {
    const end = literalEnd(source, i)
    if (end !== null) {
      i = end
      continue
    }
    if ("([{".includes(source[i]!)) depth++
    else if (")]}".includes(source[i]!)) depth--
    else if (source[i] === "," && depth === 0) {
      parts.push({ text: source.slice(start, i), at: start })
      start = i + 1
    }
    i++
  }
  parts.push({ text: source.slice(start), at: start })
  return parts
}

function line(source: string, at: number) {
  return source.slice(0, at).split("\n").length
}

function thrownMessages() {
  const found: Found[] = []
  const unknown: string[] = []
  for (const file of ["features", "lib", "app", "worker"].flatMap(
    sourceFiles
  )) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const match of source.matchAll(/new AppError\(/g)) {
      const start = match.index + match[0].length
      const end = closingEnd(source, start, "(", ")") - 1
      const [code, message] = splitArguments(source.slice(start, end))
      if (!code || !message || code.text.trim() === '"INTERNAL"') continue
      const where = `${file}:${line(source, match.index)}`
      const inside = literals(message.text, start + message.at)
      if (inside.length === 0) {
        const expression = `${file} ${message.text.trim()}`
        if (!/^[A-Z_]+_MESSAGE$/.test(message.text.trim())) {
          if (!indirect[expression]) unknown.push(`${where} ${expression}`)
        }
        continue
      }
      for (const { message: text, template, at } of inside) {
        found.push({
          message: text,
          template,
          where: `${file}:${line(source, at)}`,
        })
      }
    }
    for (const match of source.matchAll(/const [A-Z_]+_MESSAGE\s*=\s*/g)) {
      const at = match.index + match[0].length
      const end = literalEnd(source, at)
      if (end === null) continue
      const literal = source.slice(at, end)
      found.push({
        message: sample(literal),
        template: literal.includes("${"),
        where: `${file}:${line(source, at)}`,
      })
    }
    if (file.startsWith("features/") && source.includes('from "zod"')) {
      const custom =
        /message:\s*("(?:[^"\\\n]|\\.)*")|,\s*("(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*\)/g
      for (const match of source.matchAll(custom)) {
        const literal = match[1] ?? match[2]!
        const text = sample(literal)
        if (!/^[A-Z].* /.test(text)) continue
        found.push({
          message: text,
          template: literal.includes("${"),
          where: `${file}:${line(source, match.index)}`,
        })
      }
    }
    for (const match of source.matchAll(
      /parse(?:Id|Input)\([^()]*?,\s*"([^"]+)"\s*,?\s*\)/g
    )) {
      found.push({
        message: `Invalid ${match[1]}`,
        template: false,
        where: `${file}:${line(source, match.index)}`,
      })
    }
  }
  for (const { file, from, to, before } of builders) {
    const source = readFileSync(path.join(root, file), "utf8")
    const start = source.indexOf(from)
    const end = source.indexOf(to, start)
    if (start === -1) unknown.push(`${file} no longer has "${from}"`)
    for (const item of literals(source.slice(start, end), start, before)) {
      if (/^[A-Z_]+$/.test(item.message)) continue
      found.push({
        message: item.message,
        template: item.template,
        where: `${file}:${line(source, item.at)}`,
      })
    }
  }
  return { found, unknown }
}

describe("pt-BR error catalog", () => {
  const { found, unknown } = thrownMessages()

  it("finds the messages the app throws", () => {
    expect(found.length).toBeGreaterThan(250)
    expect(found.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        "Track not found",
        "Stats are already refreshing",
        "This video is private",
        "Two parts of the clip overlap",
        "the API key was rejected",
        "Worker stopped while running this job",
        "Reconnect YouTube in Settings › Connected channels",
        "Write the rule",
        "Tags are too long",
        "A caption must end after it starts",
        "Use at most 7 characters",
        "Invalid clip id",
        "Your plan allows 7 publishes a day",
      ])
    )
  })

  it("has every message a person can see", () => {
    const missing = found
      .filter(({ message, template }) => {
        if (allowed[message]) return false
        if (Object.hasOwn(errorsPtBR, message)) return false
        return !template || !matchesErrorPattern(message)
      })
      .map(({ message, where }) => `  ${where}  ${JSON.stringify(message)}`)
    expect(
      missing,
      `No pt-BR translation for:\n${[...new Set(missing)].join("\n")}\n` +
        "Add the English text to lib/i18n/errors-pt-br.ts, or a pattern to lib/i18n/errors.ts when it carries values (shown here as 7). " +
        "A message no person sees goes in `allowed` in lib/i18n/errors.test.ts with the reason.\n"
    ).toEqual([])
  })

  it("knows where every message that is not written at the throw comes from", () => {
    expect(
      unknown,
      `These errors take their message from somewhere this test does not read:\n  ${unknown.join("\n  ")}\n` +
        "Translate what they can say, then list the expression in `indirect` (or the function in `builders`) in lib/i18n/errors.test.ts.\n"
    ).toEqual([])
  })

  it("allows only messages that are still thrown", () => {
    const thrown = new Set(found.map((item) => item.message))
    expect(Object.keys(allowed).filter((text) => !thrown.has(text))).toEqual([])
  })

  it("keeps a translation that differs from the English", () => {
    const same = Object.entries(errorsPtBR)
      .filter(([english, portuguese]) => english === portuguese)
      .map(([english]) => english)
    expect(same).toEqual([])
  })
})
