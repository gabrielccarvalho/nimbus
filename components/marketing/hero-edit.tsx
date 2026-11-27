import { cn } from "@/lib/utils"

import styles from "./landing.module.css"

const a = (name: keyof typeof styles) => cn(styles.a, styles[name])

const TONES = {
  lav: "bg-lav/16 text-lav inset-ring-lav/40",
  mint: "bg-mint/16 text-mint inset-ring-mint/40",
  sky: "bg-sky/16 text-sky inset-ring-sky/40",
} as const

const DOTS = {
  lav: "bg-lav",
  mint: "bg-mint",
  sky: "bg-sky",
  amber: "bg-amber",
} as const

function Chip({
  side,
  top,
  tone,
  appear,
  children,
}: {
  side: "left" | "right"
  top: string
  tone: keyof typeof DOTS
  appear: keyof typeof styles
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        a(appear),
        "absolute inline-flex items-center gap-[0.7cqw] rounded-[1.2cqw] bg-graphite/94 px-[1.2cqw] py-[0.75cqw] text-[1.2cqw] font-medium whitespace-nowrap shadow-[0_1cqw_2.5cqw_rgb(0_0_0/0.45)] inset-ring-1 inset-ring-white/10",
        side === "left" ? "right-[63%]" : "left-[63%]"
      )}
      style={{ top }}
    >
      <i className={cn("size-[0.6cqw] rounded-[0.15cqw]", DOTS[tone])} />
      {children}
    </span>
  )
}

function Block({
  left,
  width,
  tone,
  appear,
  children,
}: {
  left: string
  width: string
  tone: keyof typeof TONES
  appear: keyof typeof styles
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        a(appear),
        "absolute inset-y-[12%] flex items-center overflow-hidden rounded-[0.55cqw] px-[0.7cqw] whitespace-nowrap inset-ring-1",
        TONES[tone]
      )}
      style={{ left, width }}
    >
      {children}
    </span>
  )
}

const DOT_GRID =
  "bg-[radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1.2px)] bg-size-[1.1cqw_1.1cqw]"

const STEPS = [
  { name: "step1", dot: "lav", label: "Find the webcam" },
  { name: "step2", dot: "lav", label: "Frame it vertical" },
  { name: "step3", dot: "mint", label: "Write the captions" },
  { name: "step4", dot: "amber", label: "Trim it" },
  { name: "step5", dot: "sky", label: "Punch in, add music" },
  { name: "step6", dot: "mint", label: "You approve" },
] as const

/**
 * The landing hero: a 14 s CSS loop of a clip being edited. No JavaScript and
 * no video file. Sizes inside the stage are in `cqw`, so it scales as one
 * picture. Each element's own style is its final state (see the stylesheet).
 */
export function HeroEdit({ className }: { className?: string }) {
  return (
    <div data-slot="hero-edit" className={className}>
      <div
        role="img"
        aria-label="A clip being edited: nimbus finds the webcam, frames the clip vertically and writes the captions; the clip is trimmed, a zoom and a song are added, and it is approved"
        className="@container relative aspect-[12/7] overflow-hidden rounded-[18px] bg-graphite text-start shadow-[0_40px_100px_-30px_rgb(0_0_0/0.7)] inset-ring-1 inset-ring-white/7"
      >
        <div className="absolute inset-x-0 top-0 flex h-[9%] items-center gap-[1cqw] px-[2.5%] shadow-[inset_0_-1px_0_var(--hair)]">
          <span className="text-[1.3cqw] font-semibold tracking-[-0.02em]">
            The 1v4 clutch nobody saw coming
          </span>
          <span className="text-[1.05cqw] text-tertiary">· Saved</span>
          <span className="flex-1" />
          <span className="flex gap-[0.15cqw] rounded-full bg-glass p-[0.25cqw] text-[1.1cqw] font-medium inset-ring-1 inset-ring-hair">
            <span className="rounded-full px-[1.1cqw] py-[0.5cqw] text-muted-foreground">
              Reject
            </span>
            <span
              className={cn(
                a("approve"),
                "rounded-full bg-mint/18 px-[1.1cqw] py-[0.5cqw] text-mint inset-ring-1 inset-ring-mint/50"
              )}
            >
              Approve
            </span>
          </span>
        </div>

        <div className="absolute top-[13%] left-[41.3%] aspect-[9/16] w-[17.4%] overflow-hidden rounded-[1.5cqw] bg-night shadow-[0_2.5cqw_6cqw_-2.5cqw_rgb(0_0_0/0.9)] inset-ring-1 inset-ring-white/10">
          <div className={cn(a("zoom"), "absolute inset-0", DOT_GRID)} />
          <div
            className={cn(
              a("source"),
              "absolute inset-x-0 top-[34%] aspect-video bg-graphite-2 opacity-0"
            )}
          >
            <i
              className={cn(
                a("in4"),
                "absolute bottom-[8%] left-[5%] aspect-[4/3] w-[30%] rounded-[0.3cqw] bg-lav/12 inset-ring-[0.18cqw] inset-ring-lav"
              )}
            />
          </div>
          <div
            className={cn(
              a("cam"),
              "absolute inset-x-0 top-0 h-[38%] overflow-hidden bg-lav/12 shadow-[inset_0_-1px_0_rgb(255_255_255/0.1)]"
            )}
          >
            <span className="absolute top-[0.6cqw] left-[0.6cqw] rounded-[0.45cqw] bg-night/72 px-[0.55cqw] py-[0.25cqw] text-[0.85cqw] font-medium text-lav">
              Webcam
            </span>
          </div>
          <div
            className={cn(
              a("in80"),
              "absolute inset-x-[8%] top-[9%] rounded-[0.6cqw] bg-night/70 px-[0.6cqw] py-[0.5cqw] text-center text-[1.05cqw] leading-tight font-semibold"
            )}
          >
            1v4 with 12 HP
          </div>
          <div className="absolute inset-x-[4%] top-[60%] flex flex-wrap justify-center gap-x-[0.45cqw] text-[1.6cqw] leading-[1.1] font-extrabold tracking-normal uppercase [text-shadow:0_0.15cqw_0_rgb(0_0_0),0_0_0.7cqw_rgb(0_0_0/0.8)]">
            <span className={a("word1")}>no way</span>
            <span className={a("word2")}>he</span>
            <span className={cn(a("word3"), "text-amber")}>peeks</span>
          </div>
          <div
            className={cn(
              a("in90"),
              "absolute inset-0 rounded-[1.5cqw] inset-ring-[0.22cqw] inset-ring-mint"
            )}
          />
        </div>

        <Chip side="left" top="17%" tone="lav" appear="in8">
          Webcam found
        </Chip>
        <Chip side="left" top="31%" tone="mint" appear="in38">
          Captions, word by word
        </Chip>
        <Chip side="left" top="45%" tone="sky" appear="in66">
          Zoom 1.4× on the last kill
        </Chip>
        <Chip side="right" top="17%" tone="lav" appear="in20">
          Framed 9:16, webcam on top
        </Chip>
        <Chip side="right" top="31%" tone="amber" appear="in56">
          Trimmed to 0:28
        </Chip>
        <Chip side="right" top="45%" tone="mint" appear="in77">
          Night drive, under your voice
        </Chip>

        <div className="absolute inset-x-0 top-[67%] bottom-0 bg-sheet text-[1cqw] font-medium shadow-[inset_0_1px_0_var(--hair)]">
          <div className="absolute inset-y-0 left-0 w-[8%] text-tertiary shadow-[inset_-1px_0_0_var(--hair)]">
            {(
              [
                ["Text", "10%"],
                ["Captions", "28%"],
                ["Effects", "46%"],
                ["Video", "66%"],
                ["Music", "85%"],
              ] as const
            ).map(([label, top]) => (
              <span key={label} className="absolute left-[22%]" style={{ top }}>
                {label}
              </span>
            ))}
          </div>
          <div className="absolute inset-y-0 right-[3%] left-[9%]">
            <div className="absolute inset-x-0 top-[6%] h-[16%]">
              <Block left="12%" width="24%" tone="lav" appear="in80">
                1v4 with 12 HP
              </Block>
            </div>
            <div className="absolute inset-x-0 top-[24%] h-[16%]">
              <Block left="12%" width="14%" tone="mint" appear="in30">
                no way
              </Block>
              <Block left="27%" width="10%" tone="mint" appear="in33">
                he
              </Block>
              <Block left="38%" width="14%" tone="mint" appear="in36">
                peeks
              </Block>
            </div>
            <div className="absolute inset-x-0 top-[42%] h-[16%]">
              <Block left="52%" width="12%" tone="sky" appear="in66">
                Zoom
              </Block>
            </div>
            <div className="absolute inset-x-0 top-[60%] h-[20%]">
              <span className="absolute inset-x-0 inset-y-[10%] flex gap-[0.15cqw] overflow-hidden rounded-[0.6cqw]">
                {Array.from({ length: 10 }, (_, index) => (
                  <i
                    key={index}
                    className={cn(
                      "flex-1",
                      index % 2 ? "bg-graphite-3" : "bg-graphite-2"
                    )}
                  />
                ))}
              </span>
              <span
                className={cn(
                  a("trim"),
                  "absolute inset-y-[4%] right-[18%] left-[12%] rounded-[0.7cqw] inset-ring-[0.18cqw] inset-ring-foreground"
                )}
              >
                <i className="absolute inset-y-0 left-0 w-[0.7cqw] rounded-l-[0.7cqw] bg-foreground" />
                <i className="absolute inset-y-0 right-0 w-[0.7cqw] rounded-r-[0.7cqw] bg-foreground" />
              </span>
            </div>
            <div className="absolute inset-x-0 top-[82%] h-[15%]">
              <Block left="12%" width="70%" tone="mint" appear="in77">
                Night drive
              </Block>
            </div>
            <i
              className={cn(
                a("playhead"),
                "absolute inset-y-[3%] left-[82%] w-[0.16cqw] bg-amber"
              )}
            />
          </div>
        </div>

        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={cn(
            a("cursor"),
            "absolute top-[4.5%] left-[93.5%] size-[1.7cqw] fill-foreground stroke-night opacity-0 drop-shadow-[0_0.2cqw_0.4cqw_rgb(0_0_0/0.6)]"
          )}
        >
          <path
            d="M2 1.5 13 7l-4.6 1.4L7 13z"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <ol className="mt-[18px] flex flex-wrap justify-center gap-x-[22px] gap-y-2 text-sm font-medium">
        {STEPS.map((step) => (
          <li
            key={step.name}
            className={cn(a(step.name), "flex items-center gap-2")}
          >
            <i
              aria-hidden
              className={cn("size-[7px] rounded-[2px]", DOTS[step.dot])}
            />
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  )
}
