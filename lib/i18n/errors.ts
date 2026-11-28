import type { Locale } from "./config"
import { errorsPtBR } from "./errors-pt-br"

type Build = (...captures: string[]) => string | null

const projectStatuses: Record<string, string> = {
  downloading: "baixando",
  uploaded: "enviado",
  probing: "lendo o vídeo",
  transcribing: "transcrevendo",
  analyzing: "analisando",
  selecting: "selecionando",
  ready_for_review: "pronto para revisão",
  rendering: "renderizando",
  done: "concluído",
  failed: "com falha",
  cancelled: "cancelado",
}

const pickSubjects: Record<string, string> = {
  highlight: "destaques",
  insight: "insights",
}

const diskActions: Record<string, string> = {
  render: "renderizar",
  "download this video": "baixar este vídeo",
}

const zodOrigins: Record<string, string> = {
  string: "o texto",
  number: "o número",
  int: "o número",
  array: "a lista",
  value: "o valor",
}

const zodUnits: Record<string, string> = {
  characters: "caracteres",
  items: "itens",
}

const zodBounds: Record<string, string> = {
  "<=": "no máximo",
  "<": "menos de",
  ">=": "no mínimo",
  ">": "mais de",
}

function limit(text: string) {
  const match = /^(\d+) (hours?|minutes?|ms)$/.exec(text)
  if (!match) return text
  const [, count, unit] = match
  if (unit === "ms") return text
  const one = count === "1"
  return unit!.startsWith("hour")
    ? `${count} ${one ? "hora" : "horas"}`
    : `${count} ${one ? "minuto" : "minutos"}`
}

function clipNames(shown: string) {
  const more = /^(.*) and (\d+) more clips?$/.exec(shown)
  if (more) {
    const [, names, count] = more
    return `${names} e mais ${count} ${count === "1" ? "corte" : "cortes"}`
  }
  const last = shown.lastIndexOf("” and “")
  return last === -1
    ? shown
    : `${shown.slice(0, last)}” e “${shown.slice(last + 7)}`
}

function zodBound(origin: string, bound: string, value: string, unit = "") {
  const subject = zodOrigins[origin]
  const size = unit ? zodUnits[unit] : ""
  if (!subject || size === undefined) return null
  return unit
    ? `Valor inválido: ${subject} precisa ter ${zodBounds[bound]} ${value} ${size}`
    : `Valor inválido: ${subject} precisa ser ${zodBounds[bound]} ${value}`
}

const patternsPtBR: [RegExp, Build][] = [
  [
    /^This file isn't the (\S+) its name says it is$/,
    (format) => `Este arquivo não é o ${format} que o nome diz`,
  ],
  [
    /^This track is under (.+)\. Remove it from (that clip|those clips) first\.$/s,
    (shown, where) =>
      `Esta faixa está em ${clipNames(shown)}. Remova a faixa ${
        where === "that clip" ? "desse corte" : "desses cortes"
      } primeiro.`,
  ],
  [
    /^This list already has (\d+) rules\. Pick one to retire\.$/,
    (cap) => `Esta lista já tem ${cap} regras. Escolha uma para arquivar.`,
  ],
  [
    /^Finding patterns needs (\d+) clips with stats at least (\d+) days old\. You have (\d+)\.$/,
    (clips, days, have) =>
      `Para encontrar padrões, você precisa de ${clips} cortes com estatísticas de pelo menos ${days} dias. Você tem ${have}.`,
  ],
  [
    /^Find patterns needs (\d+) published clips with a week of stats$/,
    (clips) =>
      `Para encontrar padrões, você precisa de ${clips} cortes publicados com uma semana de estatísticas`,
  ],
  [
    /^Google token refresh failed \((.+)\)$/,
    (status) => `Falha ao renovar o acesso do Google (${status})`,
  ],
  [/^YouTube returned (\d+)$/, (status) => `O YouTube retornou ${status}`],
  [/^Groq returned (\d+)$/, (status) => `O Groq retornou ${status}`],
  [/^AbacatePay returned (.+)$/, (reason) => `A AbacatePay retornou ${reason}`],
  [
    /^Your plan allows (\d+) publishes a day$/,
    (count) => `Seu plano permite ${count} publicações por dia`,
  ],
  [
    /^You've used your plan's (\d+) render minutes for this month$/,
    (minutes) =>
      `Você já usou os ${minutes} minutos de renderização do seu plano neste mês`,
  ],
  [
    /^Rendering this takes about (\d+) min and your plan has (\d+) min left this month$/,
    (need, left) =>
      `Renderizar isso leva cerca de ${need} min e seu plano tem ${left} min sobrando neste mês`,
  ],
  [
    /^Your plan's (\d+) GB of storage is full\. Delete a project to make room\.$/,
    (gigabytes) =>
      `Os ${gigabytes} GB de armazenamento do seu plano estão cheios. Exclua um projeto para liberar espaço.`,
  ],
  [
    /^This file doesn't fit in what's left of your plan's (\d+) GB of storage$/,
    (gigabytes) =>
      `Este arquivo não cabe no que sobra dos ${gigabytes} GB de armazenamento do seu plano`,
  ],
  [
    /^You've used your plan's (\d+) Claude picks for this month$/,
    (runs) =>
      `Você já usou as ${runs} seleções com o Claude do seu plano neste mês`,
  ],
  [
    /^Can't move a project from (\w+) to (\w+)$/,
    (from, to) =>
      `Não dá para mover um projeto de ${projectStatuses[from] ?? from} para ${projectStatuses[to] ?? to}`,
  ],
  [
    /^Only failed projects can be retried \(status is (\w+)\)$/,
    (status) =>
      `Só dá para tentar de novo em projetos com falha (o status é ${projectStatuses[status] ?? status})`,
  ],
  [
    /^Clips must be between (\S+) and (\S+) seconds long$/,
    (min, max) => `Os cortes precisam ter entre ${min} e ${max} segundos`,
  ],
  [
    /^A clip can have at most (\d+) parts$/,
    (max) => `Um corte pode ter no máximo ${max} partes`,
  ],
  [
    /^Each part must be at least (\S+) second long$/,
    (min) => `Cada parte precisa ter pelo menos ${min} segundo`,
  ],
  [
    /^Use at most (\d+) characters$/,
    (max) => `Use no máximo ${max} caracteres`,
  ],
  [
    /^The JSON doesn't match the expected shape(.*)$/s,
    (rest) => {
      const issue = /^ \((.*?): (.*)\)$/s.exec(rest)
      const detail = issue
        ? ` (${issue[1]}: ${translateError(issue[2]!, "pt-BR")})`
        : rest
      return `O JSON não está no formato esperado${detail}`
    },
  ],
  [
    /^Claude declined to pick (\w+)s$/,
    (subject) =>
      pickSubjects[subject]
        ? `O Claude se recusou a escolher ${pickSubjects[subject]}`
        : null,
  ],
  [
    /^Claude returned invalid (\w+) JSON twice$/,
    (subject) =>
      pickSubjects[subject]
        ? `O Claude retornou um JSON de ${pickSubjects[subject]} inválido duas vezes`
        : null,
  ],
  [
    /^the API returned (.+)$/,
    (status) => `a API retornou ${status === "an error" ? "um erro" : status}`,
  ],
  [
    /^Job made no progress for (.+)$/,
    (time) => `A tarefa ficou sem progresso por ${limit(time)}`,
  ],
  [/^Job ran longer than (.+)$/, (time) => `A tarefa passou de ${limit(time)}`],
  [/^Download failed: (.+)$/s, (reason) => `Falha no download: ${reason}`],
  [
    /^Couldn't unlock (.+)'s cookies\. Click "Always Allow" on the Keychain prompt and try again\.$/,
    (browser) =>
      `Não foi possível desbloquear os cookies do ${browser}. Clique em "Permitir Sempre" no aviso do Acesso às Chaves e tente de novo.`,
  ],
  [
    /^No (.+) cookies found for profile "(.*)"$/,
    (browser, profile) =>
      `Nenhum cookie do ${browser} encontrado no perfil "${profile}"`,
  ],
  [
    /^Couldn't read (.+)'s cookies$/,
    (browser) => `Não foi possível ler os cookies do ${browser}`,
  ],
  [
    /^File is larger than (\d+) bytes$/,
    (bytes) => `O arquivo tem mais de ${bytes} bytes`,
  ],
  [
    /^Not enough free disk space to (.+) \((\d+) MB free\)$/,
    (action, free) =>
      `Sem espaço livre em disco para ${diskActions[action] ?? action} (${free} MB livres)`,
  ],
  [
    /^(.+) exited with code (\S+)$/,
    (command, code) => `${command} terminou com o código ${code}`,
  ],
  [/^(\S+) was cancelled$/, (command) => `${command} foi cancelado`],
  [/^(\S+) was not found$/, (command) => `${command} não foi encontrado`],
  [
    /^(\S+) timed out after (\d+) ms$/,
    (command, ms) => `${command} passou do limite de ${ms} ms`,
  ],
  [
    /^Too (?:big|small): expected (\w+) to have ([<>]=?)(\S+) (\w+)$/,
    (origin, bound, value, unit) => zodBound(origin, bound, value, unit),
  ],
  [
    /^Too (?:big|small): expected (\w+) to be ([<>]=?)(\S+)$/,
    (origin, bound, value) => zodBound(origin, bound, value),
  ],
  [/^Invalid input: .+$/s, () => "Entrada inválida"],
  [/^Invalid option: .+$/s, () => "Opção inválida"],
]

function fromPatterns(message: string) {
  for (const [pattern, build] of patternsPtBR) {
    const match = pattern.exec(message)
    if (!match) continue
    const built = build(...match.slice(1))
    if (built !== null) return built
  }
  return null
}

// The English message is the key, so a stored error reads in the viewer's language.
export function translateError(message: string, locale: Locale): string {
  if (locale !== "pt-BR") return message
  if (Object.hasOwn(errorsPtBR, message)) return errorsPtBR[message]!
  return fromPatterns(message) ?? message
}

export function matchesErrorPattern(message: string) {
  return patternsPtBR.some(([pattern]) => pattern.test(message))
}
