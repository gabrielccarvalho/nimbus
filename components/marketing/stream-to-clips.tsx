import { CheckIcon, UploadSimpleIcon } from "@phosphor-icons/react/ssr"

import type { Locale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

import styles from "./landing.module.css"
import { marketing } from "./messages"

const h = (name: keyof typeof styles) => cn(styles.a, styles.h, styles[name])

const STREAM_SECONDS = 3 * 3600 + 12 * 60 + 4

const seconds = (at: string) =>
  at.split(":").reduce((total, part) => total * 60 + Number(part), 0)

const MOMENTS: {
  at: string
  caption: keyof (typeof marketing)["en-US"]["streamToClips"]["captions"]
  score: number
  decision?: "approved" | "rejected"
}[] = [
  { at: "0:12:41", caption: "noWay", score: 94, decision: "approved" },
  { at: "0:31:07", caption: "oneTap", score: 88 },
  { at: "0:48:52", caption: "clutch", score: 91, decision: "approved" },
  { at: "1:09:15", caption: "wait", score: 76, decision: "rejected" },
  { at: "1:27:40", caption: "runIt", score: 85 },
  { at: "1:52:03", caption: "hp", score: 97, decision: "approved" },
  { at: "2:14:26", caption: "letsGo", score: 82 },
  { at: "2:39:58", caption: "what", score: 79 },
  { at: "2:58:11", caption: "gg", score: 90 },
]

const CLIPS = MOMENTS.map((clip) => ({
  ...clip,
  position: (seconds(clip.at) / STREAM_SECONDS) * 100,
}))

const AXIS = [30, 60, 90, 120, 150, 180].map((minutes) => ({
  label: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`,
  position: ((minutes * 60) / STREAM_SECONDS) * 100,
}))

const BAR_COUNT = 180

function waveform() {
  let state = 7
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const x = ((index + 0.5) / BAR_COUNT) * 100
    let height = 8 + random() * 26
    for (const clip of CLIPS) {
      const distance = Math.abs(x - clip.position)
      if (distance < 2.2) {
        height = Math.max(height, (60 + random() * 36) * (1 - distance / 3.2))
      }
    }
    if (random() < 0.07) height = Math.max(height, 40 + random() * 22)
    return Math.round(height * 10) / 10
  })
}

const BARS = waveform()

function Waveform({ className }: { className: string }) {
  const step = 1000 / BAR_COUNT
  return (
    <svg
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      className={cn("absolute inset-0 size-full", className)}
    >
      {BARS.map((height, index) => (
        <rect
          key={index}
          x={index * step + 1.2}
          y={50 - height / 2}
          width={step - 2.4}
          height={height}
          rx="1"
        />
      ))}
    </svg>
  )
}

/**
 * The How it works picture: a 12 s CSS loop of one long stream being read,
 * nine moments marked, each turned into a vertical clip, then decided on. No
 * JavaScript. Each element's own style is its final state (see the stylesheet).
 */
export function StreamToClips({
  locale,
  className,
}: {
  locale: Locale
  className?: string
}) {
  const t = marketing[locale].streamToClips
  const number = new Intl.NumberFormat(locale)
  return (
    <div
      data-slot="stream-to-clips"
      role="img"
      aria-label={t.label}
      className={cn("px-[clamp(16px,2.4vw,30px)] pt-[22px] pb-7", className)}
    >
      <div className="flex min-h-10 flex-wrap items-center gap-x-[18px] gap-y-3">
        <span
          className={cn(
            h("file"),
            "inline-flex h-10 items-center gap-2.5 rounded-full bg-glass ps-1.5 pe-3.5 text-sm font-medium inset-ring-1 inset-ring-hair"
          )}
        >
          <span className="grid size-7 place-items-center rounded-full bg-glass-2 [&_svg]:size-3.5">
            <UploadSimpleIcon />
          </span>
          {t.file}
          <span className="font-mono text-xs text-muted-foreground">
            3:12:04 · {number.format(2.3)} GB
          </span>
        </span>
        <span className="flex-1" />
        <span className="flex gap-[18px] font-mono text-xs font-medium text-tertiary max-md:hidden">
          <span className={h("stat1")}>
            <span className="text-foreground">{number.format(1842)}</span>{" "}
            {t.linesRead}
          </span>
          <span className={h("stat2")}>
            <span className="text-lav">9</span> {t.momentsPicked}
          </span>
          <span className={h("stat3")}>
            <span className="text-mint">3</span> {t.approved}
          </span>
        </span>
      </div>

      <div className="relative mt-[22px] h-[clamp(72px,9vw,116px)]">
        <Waveform className="fill-white/12" />
        <div className={cn(h("read"), "absolute inset-0")}>
          <Waveform className="fill-white/42" />
        </div>
        {CLIPS.map((clip, index) => (
          <i
            key={clip.at}
            className={cn(
              h(`range${index}`),
              "absolute inset-y-0 w-[18px] -translate-x-1/2 rounded-md bg-lav/20 inset-ring-[1.5px] inset-ring-lav"
            )}
            style={{ left: `${clip.position}%` }}
          />
        ))}
        <i
          className={cn(
            h("scan"),
            "absolute -inset-y-2 left-full -ml-px w-0.5 rounded-full bg-amber opacity-0 shadow-[0_0_18px_2px_color-mix(in_oklab,var(--amber)_50%,transparent)]"
          )}
        />
      </div>
      <div className="relative mt-2 h-4 font-mono text-[10.5px] font-medium text-tertiary">
        <span className="absolute left-0">0:00</span>
        {AXIS.map((tick) => (
          <span
            key={tick.label}
            className="absolute -translate-x-1/2"
            style={{ left: `${tick.position}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <svg
        viewBox="0 0 1000 64"
        preserveAspectRatio="none"
        fill="none"
        strokeWidth="1.25"
        strokeDasharray="1"
        className="mt-1 block h-[clamp(44px,5.4vw,72px)] w-full stroke-lav/50 max-md:hidden"
      >
        {CLIPS.map((clip, index) => {
          const from = clip.position * 10
          const to = ((index + 0.5) / CLIPS.length) * 1000
          return (
            <path
              key={clip.at}
              pathLength="1"
              vectorEffect="non-scaling-stroke"
              d={`M${from} 0 C${from} 34 ${to} 30 ${to} 64`}
              className={h(`link${index}`)}
            />
          )
        })}
      </svg>

      <div className="-mx-1.5 grid grid-cols-9 max-md:mt-[18px] max-md:grid-cols-3 max-md:gap-y-3.5">
        {CLIPS.map((clip, index) => {
          const approved = clip.decision === "approved"
          const rejected = clip.decision === "rejected"
          return (
            <div key={clip.at} className={cn(h(`tile${index}`), "px-1.5")}>
              <div className="grid gap-[9px]">
                <span
                  className={cn(
                    "relative block aspect-[9/16] overflow-hidden rounded-xl bg-night bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1.2px)] bg-size-[9px_9px] inset-ring-1 inset-ring-white/10",
                    rejected && cn(h("rejected"), "opacity-30")
                  )}
                >
                  <i className="absolute inset-x-0 top-0 h-[37%] bg-lav/13 shadow-[inset_0_-1px_0_rgb(255_255_255/0.08)]" />
                  <b
                    className={cn(
                      "absolute inset-x-1 top-[62%] text-center text-[13px] leading-[1.1] font-extrabold tracking-normal uppercase [text-shadow:0_1.5px_0_rgb(0_0_0),0_0_8px_rgb(0_0_0/0.8)]",
                      approved && "text-amber"
                    )}
                  >
                    {t.captions[clip.caption]}
                  </b>
                  {approved && (
                    <i
                      className={cn(
                        h(`approved${index}`),
                        "absolute inset-0 rounded-xl inset-ring-2 inset-ring-mint"
                      )}
                    >
                      <span className="absolute top-[7px] right-[7px] grid size-5 place-items-center rounded-full bg-mint text-night [&_svg]:size-[11px]">
                        <CheckIcon weight="bold" />
                      </span>
                    </i>
                  )}
                </span>
                <span className="flex justify-between px-0.5 font-mono text-[11px] font-medium text-tertiary">
                  <span>{clip.at}</span>
                  <span
                    className={approved ? "text-mint" : "text-muted-foreground"}
                  >
                    {clip.score}
                  </span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
