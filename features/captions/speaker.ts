import type { Segment, Word } from "../transcription/schema"

// Short, high-frequency function words. Words shared with another language
// still count for the main one, so only words exclusive to a foreign list can
// push a segment out.
const FUNCTION_WORDS: Record<string, readonly string[]> = {
  pt: "a o os as um uma de do da dos das em no na nos nas que é não sim eu você vc tu ele ela nós eles elas isso esse essa este esta aqui ali lá mas porque pra para por com sem mais muito muita tá tô estou está era foi vai vou meu minha seu sua então também já só ainda quando onde como cara mano né aí agora tudo nada ser ter tem tinha me te se lhe ao aos à às ou nem bem até todo toda todos todas vamos bora acho sei olha pô porra caralho".split(
    " "
  ),
  en: "the a an of to in on at is are was were be been am i you he she we they it this that these those what why how where when who and but or not no yes do does did don't i'm it's that's you're we're they're can can't will won't just so my your his her our their me him us them have has had get got gonna wanna there here with for from about right".split(
    " "
  ),
  es: "el la los las un una de del en que es no sí yo tú usted él ella nosotros ellos esto eso este esta aquí allí pero porque para por con sin más muy está estoy era fue va voy mi tu su entonces también ya solo cuando donde como hay todo nada ser tener tiene qué".split(
    " "
  ),
  fr: "le la les un une des de du en que qui est ne pas oui non je tu il elle nous vous ils elles ce cette ça ici mais parce pour par avec sans plus très suis était va vais mon ma ton ta son sa alors aussi déjà seulement quand où comment tout rien être avoir".split(
    " "
  ),
  de: "der die das ein eine einen dem den des und oder aber nicht nein ja ich du er sie wir ihr es ist sind war waren bin hier da was warum wie wo wann wer mit für von zu auf aus mein dein sein kein auch schon nur noch dann jetzt alles nichts haben hat".split(
    " "
  ),
  it: "il lo la i gli le un una di del della in che è non sì io tu lui lei noi voi loro questo questa quello qui lì ma perché per con senza più molto sono era va vado mio mia tuo tua suo sua allora anche già solo quando dove come tutto niente essere avere".split(
    " "
  ),
}

const LISTS = Object.fromEntries(
  Object.entries(FUNCTION_WORDS).map(([language, words]) => [
    language,
    new Set(words),
  ])
) as Record<string, Set<string>>

const LOOP_MIN_REPEATS = 3

const tokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .split(/[^\p{L}']+/u)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter(Boolean)

const normalized = (text: string) => tokens(text).join(" ")

export function functionWordHits(text: string, language: string) {
  const main = LISTS[language.slice(0, 2).toLowerCase()]
  if (!main) return { main: 0, foreign: 0 }
  const words = tokens(text)
  let foreign = 0
  for (const list of Object.values(LISTS)) {
    if (list === main) continue
    const hits = words.filter((word) => list.has(word) && !main.has(word))
    foreign = Math.max(foreign, hits.length)
  }
  return { main: words.filter((word) => main.has(word)).length, foreign }
}

export function isForeignSegment(text: string, language: string) {
  const hits = functionWordHits(text, language)
  return hits.foreign > 0 && hits.foreign > hits.main
}

export function loopedSegments(segments: readonly Segment[]) {
  const looped = new Set<number>()
  let runStart = 0
  for (let i = 1; i <= segments.length; i++) {
    const same =
      i < segments.length &&
      normalized(segments[i]!.text) === normalized(segments[runStart]!.text)
    if (same) continue
    if (i - runStart >= LOOP_MIN_REPEATS) {
      for (let j = runStart + 1; j < i; j++) looped.add(j)
    }
    runStart = i
  }
  return looped
}

export function speakerWords(transcript: {
  language: string
  words: readonly Word[]
  segments: readonly Segment[]
}): Word[] {
  const looped = loopedSegments(transcript.segments)
  const kept: Word[] = []
  transcript.segments.forEach((segment, index) => {
    if (looped.has(index)) return
    if (isForeignSegment(segment.text, transcript.language)) return
    kept.push(
      ...transcript.words.slice(segment.firstWord, segment.lastWord + 1)
    )
  })
  return kept
}

export function speakerTranscriptWords(
  transcript: Parameters<typeof speakerWords>[0] | undefined
) {
  return transcript ? speakerWords(transcript) : []
}
