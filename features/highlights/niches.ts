import { z } from "zod"

export const niches = [
  "auto",
  "gta",
  "open-world",
  "horror",
  "shooter",
  "racing",
  "general",
] as const
export const nicheSchema = z.enum(niches)
export type Niche = z.infer<typeof nicheSchema>
export type ResolvedNiche = Exclude<Niche, "auto">

export type NicheProfile = {
  label: string
  description: string
  lookFor: readonly string[]
  titleKeywords: readonly string[]
}

export const NICHE_PROFILES: Record<ResolvedNiche, NicheProfile> = {
  gta: {
    label: "GTA",
    description: "Bugs, physics chaos, chases, crashes and explosions.",
    lookFor: [
      "bugs and glitches: cars or people flying, clipping through the map, T-poses, objects spinning, ragdolls doing something absurd",
      "physics chaos: huge crashes, cars flipping, chain explosions, getting launched",
      "police chases and wanted-level escalation, shootouts, getting busted or wasted at the worst moment",
      "NPCs doing something weird, funny or unexpectedly aggressive",
      "stunts and jumps that land or fail spectacularly",
    ],
    titleKeywords: [
      "gta",
      "grand theft auto",
      "roleplay",
      "los santos",
      "vice city",
      "leonida",
    ],
  },
  "open-world": {
    label: "Open world / sandbox",
    description: "Glitches, physics, emergent chaos.",
    lookFor: [
      "bugs and glitches: things flying, clipping through walls or the floor, broken animations",
      "physics chaos and emergent moments nobody planned",
      "fights or chases that escalate out of control",
      "absurd NPC or creature behaviour",
    ],
    titleKeywords: [
      "minecraft",
      "red dead",
      "rdr",
      "cyberpunk",
      "skyrim",
      "zelda",
      "fortnite",
      "roblox",
      "rust",
      "ark",
      "sandbox",
      "open world",
    ],
  },
  horror: {
    label: "Horror",
    description: "Jump scares and panic.",
    lookFor: [
      "jump scares with the streamer jumping, screaming or ripping off the headset",
      "being chased by the monster and barely escaping or getting caught",
      "dead silence followed by a scream",
      "bugs that break the tension in a funny way",
    ],
    titleKeywords: [
      "horror",
      "terror",
      "resident evil",
      "outlast",
      "fnaf",
      "five nights",
      "phasmophobia",
      "silent hill",
      "dead by daylight",
      "lethal company",
    ],
  },
  shooter: {
    label: "Shooter",
    description: "Clutches, multi-kills and rage.",
    lookFor: [
      "clutches, multi-kills, aces and impossible shots",
      "dying in a stupid way, getting outplayed, rage",
      "hackers, glitches, bullets that clearly should have hit",
      "chaotic close-range fights",
    ],
    titleKeywords: [
      "valorant",
      "cs2",
      "counter-strike",
      "call of duty",
      "cod",
      "warzone",
      "apex",
      "fortnite",
      "overwatch",
      "battlefield",
      "pubg",
      "free fire",
      "rainbow six",
    ],
  },
  racing: {
    label: "Racing",
    description: "Crashes, photo finishes, overtakes.",
    lookFor: [
      "huge crashes and pile-ups",
      "last-corner overtakes and photo finishes",
      "physics bugs: cars launching, flipping or clipping",
      "rage at another driver",
    ],
    titleKeywords: [
      "forza",
      "gran turismo",
      "f1",
      "need for speed",
      "nfs",
      "the crew",
      "assetto",
      "iracing",
      "mario kart",
    ],
  },
  general: {
    label: "General",
    description: "Any game: action and big reactions.",
    lookFor: [
      "bugs and glitches on screen",
      "fails, deaths and close calls",
      "chaos the streamer didn't see coming",
    ],
    titleKeywords: [],
  },
}

const DETECT_ORDER: readonly ResolvedNiche[] = [
  "gta",
  "horror",
  "racing",
  "shooter",
  "open-world",
]

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const keywordPattern = (keyword: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escape(keyword)}(?!\\p{L})`, "iu")

export function detectNiche(title: string): ResolvedNiche {
  return (
    DETECT_ORDER.find((niche) =>
      NICHE_PROFILES[niche].titleKeywords.some((keyword) =>
        keywordPattern(keyword).test(title)
      )
    ) ?? "general"
  )
}

export function resolveNiche(
  niche: Niche | undefined,
  title: string
): ResolvedNiche {
  return !niche || niche === "auto" ? detectNiche(title) : niche
}
