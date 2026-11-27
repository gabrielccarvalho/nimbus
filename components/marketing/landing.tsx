import { ArrowRightIcon, PlusIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"

import { Logo, LogoMark } from "@/components/app-shell/logo"
import { LANGUAGES } from "@/components/settings/languages"
import { buttonVariants } from "@/components/ui/button"
import { SignalDot } from "@/components/ui/signal-dot"
import { StatusPill } from "@/components/ui/status-pill"
import { PLANS, type PlanId } from "@/features/accounts/schema"
import { cn } from "@/lib/utils"

import { HeroEdit } from "./hero-edit"
import { InView } from "./in-view"
import styles from "./landing.module.css"
import { StreamToClips } from "./stream-to-clips"

const SECTION = "mx-auto w-full max-w-[1280px] px-[max(20px,4vw)]"
const CHAPTER = cn(SECTION, "relative scroll-mt-6 pt-[clamp(110px,14vw,200px)]")
const H2 =
  "max-w-[980px] text-[clamp(36px,5.4vw,70px)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance"
const LEDE =
  "max-w-[560px] text-[clamp(16px,1.4vw,19px)] leading-normal text-muted-foreground [&_b]:font-medium [&_b]:text-foreground"
const H3 =
  "text-[clamp(22px,2.2vw,28px)] leading-[1.18] font-semibold tracking-[-0.025em]"
const BODY = "text-[15.5px] leading-[1.55] text-muted-foreground"
const STAGE_GAP = "mt-[clamp(48px,6vw,88px)]"
const MUTE = "text-foreground/45"

function Intro({
  label,
  children,
}: {
  label?: string
  children: React.ReactNode
}) {
  return (
    <InView
      className={cn(
        styles.cascade,
        "grid justify-items-center gap-5 text-center"
      )}
    >
      {label && <span className="mono-label">{label}</span>}
      {children}
    </InView>
  )
}

function Thread() {
  return (
    <i
      aria-hidden
      className={cn(
        styles.thread,
        "pointer-events-none absolute top-[clamp(18px,2.4vw,36px)] left-1/2 -ml-px h-[clamp(72px,9.4vw,134px)] w-0.5 rounded-full bg-white/8"
      )}
    >
      <i
        className={cn(
          styles.threadFill,
          "absolute inset-0 rounded-full bg-linear-to-b from-amber/0 to-amber"
        )}
      >
        <i className="absolute bottom-0 left-1/2 size-[7px] -translate-x-1/2 translate-y-1/2 rounded-full bg-amber shadow-[0_0_18px_2px_color-mix(in_oklab,var(--amber)_50%,transparent)]" />
      </i>
    </i>
  )
}

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#editor", label: "The editor" },
  { href: "#learn", label: "What it learns" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "Questions" },
] as const

function Nav() {
  return (
    <header className={cn(SECTION, "flex h-[58px] items-center gap-7")}>
      <Link href="/" aria-label="nimbus, home">
        <Logo />
      </Link>
      <nav
        aria-label="Sections"
        className="flex gap-[26px] text-[13.5px] max-md:hidden"
      >
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <span className="flex-1" />
      <Link
        href="/login"
        className="text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign in
      </Link>
      <Link href="/signup" className={buttonVariants()}>
        Get started
      </Link>
    </header>
  )
}

function Hero() {
  return (
    <section
      className={cn(
        SECTION,
        "grid justify-items-center gap-6 pt-[clamp(64px,9vw,128px)] text-center"
      )}
    >
      <InView
        className={cn(styles.entrance, "grid justify-items-center gap-6")}
      >
        <a
          href="#how"
          className="inline-flex items-center gap-2.5 rounded-full bg-glass px-3.5 py-[7px] text-sm font-medium inset-ring-1 inset-ring-hair transition-colors hover:bg-white/10"
        >
          <SignalDot tone="amber" lit />
          For streamers and the people who clip them
        </a>
        <h1 className="max-w-[980px] text-[clamp(46px,6.4vw,92px)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
          Long streams in.{" "}
          <span className="text-gradient">Short clips out.</span>
        </h1>
        <p className={LEDE}>
          Paste a YouTube or Twitch link. nimbus picks the moments worth a
          vertical clip and edits each one: framing, captions, effects. Change
          anything you like. <b>Nothing is published until you approve it.</b>
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Get started
          </Link>
          <a href="#how" className={buttonVariants({ size: "lg" })}>
            See how it works
            <ArrowRightIcon data-icon="inline-end" aria-hidden />
          </a>
        </div>
        <p className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-sm text-tertiary">
          <span>Your projects stay private</span>
          <span aria-hidden className="text-foreground/25">
            ·
          </span>
          <span>You approve every clip</span>
          <span aria-hidden className="text-foreground/25">
            ·
          </span>
          <span>Free to start</span>
        </p>
      </InView>
      <InView
        className={cn(
          styles.entrance,
          "relative mt-[clamp(24px,4vw,56px)] w-full"
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-[900px] w-[1300px] -translate-1/2 bg-[radial-gradient(closest-side,rgb(120_132_230/0.085),rgb(120_132_230/0.03)_55%,transparent)]"
        />
        <InView amount={0.4} className="relative">
          <HeroEdit />
        </InView>
      </InView>
    </section>
  )
}

const STEPS = [
  {
    title: "Paste a link",
    body: "A YouTube video, a Twitch VOD or a file of your own. Wide and ultrawide both work.",
  },
  {
    title: "It reads all of it",
    body: "Every word with its timing, every silence, every loud moment.",
  },
  {
    title: "It picks and frames",
    body: "Each moment comes back vertical, with the webcam, a title and captions.",
  },
  {
    title: "You decide",
    body: "Only the clips you approve render. Only the ones you publish go out.",
  },
] as const

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={CHAPTER}>
      <Thread />
      <Intro label="How it works">
        <h2 id="how-title" className={H2}>
          Three hours in. <span className={MUTE}>Nine clips out.</span>
        </h2>
        <p className={LEDE}>
          nimbus reads the whole stream, marks the moments worth keeping and
          hands each one back as a vertical clip. You say which ones go out.
        </p>
      </Intro>
      <InView className={cn(styles.cascade, STAGE_GAP)}>
        <InView
          amount={0.4}
          className="overflow-hidden rounded-[22px] bg-graphite shadow-[0_40px_100px_-40px_rgb(0_0_0/0.7)] inset-ring-1 inset-ring-white/6"
        >
          <StreamToClips />
          <ol className="-ms-px grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className={cn(
                  styles.a,
                  styles.h,
                  styles[`how${index + 1}`],
                  "grid content-start gap-1.5 px-6 pt-[22px] pb-[26px] shadow-[inset_1px_0_0_rgb(255_255_255/0.06),inset_0_1px_0_rgb(255_255_255/0.06)]"
                )}
              >
                <span className="mono-label">0{index + 1}</span>
                <h3 className="text-[19px] leading-tight font-semibold tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="text-[14.5px] leading-normal text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </InView>
      </InView>
    </section>
  )
}

const EDITOR_NOTES = [
  {
    title: "Captions, word by word",
    body: "Three styles, your font, your position. Fix a misheard word and the timing stays.",
  },
  {
    title: "A layout for every clip",
    body: "Webcam on top, an even split, or no webcam at all. Drag the boxes until it sits right.",
  },
  {
    title: "Effects, text and music",
    body: "Zoom, shake, full-screen moments, a hook on screen and a track underneath, all on one timeline.",
  },
  {
    title: "Safe from the Shorts buttons",
    body: "The preview shows where YouTube puts its own interface, so nothing important hides behind it.",
  },
] as const

const TRACK_TONES = {
  lav: "bg-lav/16 text-lav inset-ring-lav/40",
  mint: "bg-mint/14 text-mint inset-ring-mint/36",
  sky: "bg-sky/14 text-sky inset-ring-sky/40",
} as const

function TrackBlock({
  left,
  width,
  tone,
  children,
}: {
  left: number
  width: number
  tone: keyof typeof TRACK_TONES
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        styles.pop,
        "absolute inset-y-[5px] flex items-center overflow-hidden rounded-[7px] px-[9px] whitespace-nowrap inset-ring-1",
        TRACK_TONES[tone]
      )}
      style={
        {
          left: `${left}%`,
          width: `${width}%`,
          "--n": left / 10,
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  )
}

function EditorSection() {
  return (
    <section id="editor" aria-labelledby="editor-title" className={CHAPTER}>
      <Thread />
      <Intro label="The editor">
        <h2 id="editor-title" className={H2}>
          A first cut in minutes.{" "}
          <span className="text-gradient">The last word is yours.</span>
        </h2>
        <p className={LEDE}>
          Every clip opens in a real editor. Trim it, rewrite a caption, move
          the webcam, add a song. <b>What you see is what renders.</b>
        </p>
      </Intro>
      <InView className={cn(styles.cascade, STAGE_GAP)}>
        <div
          role="img"
          aria-label="The clip editor's timeline with text, captions, effects, video and music tracks"
          className="overflow-hidden rounded-[18px] bg-sheet shadow-[0_40px_100px_-30px_rgb(0_0_0/0.7)] inset-ring-1 inset-ring-white/7"
        >
          <div className="flex h-[46px] items-center gap-2.5 px-4 text-[13.5px] font-medium shadow-[inset_0_-1px_0_var(--hair)]">
            <span>Add</span>
            <span className="text-muted-foreground">Auto effects</span>
            <span className="flex-1" />
            <span className="font-mono text-xs text-muted-foreground">
              0:11.4 / 0:28.6
            </span>
          </div>
          <div className="flex">
            <div className="w-[92px] shrink-0 py-2.5 text-xs text-tertiary shadow-[inset_-1px_0_0_var(--hair)] max-sm:hidden">
              {["Text", "Captions", "Effects"].map((label) => (
                <div key={label} className="flex h-[34px] items-center ps-4">
                  {label}
                </div>
              ))}
              <div className="flex h-12 items-center ps-4">Video</div>
              <div className="flex h-[34px] items-center ps-4">Music</div>
            </div>
            <div className="relative min-w-0 flex-1 px-6 py-2.5 text-xs font-medium">
              <div className="relative h-[34px]">
                <TrackBlock left={6} width={22} tone="lav">
                  1v4 with 12 HP
                </TrackBlock>
              </div>
              <div className="relative h-[34px]">
                <TrackBlock left={6} width={13} tone="mint">
                  okay okay
                </TrackBlock>
                <TrackBlock left={20} width={17} tone="mint">
                  one more left
                </TrackBlock>
                <TrackBlock left={38} width={16} tone="mint">
                  no way he peeks
                </TrackBlock>
                <TrackBlock left={55} width={20} tone="mint">
                  he peeked, he peeked
                </TrackBlock>
                <TrackBlock left={76} width={14} tone="mint">
                  let&apos;s go
                </TrackBlock>
              </div>
              <div className="relative h-[34px]">
                <TrackBlock left={40} width={15} tone="sky">
                  Full game
                </TrackBlock>
                <TrackBlock left={70} width={15} tone="lav">
                  Full cam
                </TrackBlock>
              </div>
              <div className="relative h-12">
                <span className="absolute inset-x-0 inset-y-1 flex gap-0.5 overflow-hidden rounded-lg">
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
                <span className="absolute inset-y-0.5 right-[10%] left-[6%] rounded-[9px] inset-ring-2 inset-ring-foreground" />
              </div>
              <div className="relative h-[34px]">
                <TrackBlock left={6} width={84} tone="mint">
                  Night drive · ducks under the voice
                </TrackBlock>
              </div>
              <i
                className={cn(
                  styles.seek,
                  "absolute inset-y-1.5 left-[46%] w-0.5 bg-amber"
                )}
              />
            </div>
          </div>
        </div>
      </InView>
      <InView
        render={<ul />}
        className={cn(
          styles.cascade,
          "mt-[34px] grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-[34px] gap-y-[18px]"
        )}
      >
        {EDITOR_NOTES.map((note) => (
          <li key={note.title} className="grid content-start gap-1.5">
            <h3 className="text-xl leading-[1.35] font-medium tracking-[-0.02em]">
              {note.title}
            </h3>
            <p className={BODY}>{note.body}</p>
          </li>
        ))}
      </InView>
    </section>
  )
}

function Promise() {
  return (
    <section aria-labelledby="promise-title" className={CHAPTER}>
      <Thread />
      <InView
        className={cn(
          styles.cascade,
          "flex flex-wrap items-center justify-center gap-x-[88px] gap-y-12"
        )}
      >
        <div
          role="img"
          aria-label="Seal: nothing leaves without you"
          className="relative size-[220px] shrink-0"
        >
          <svg viewBox="0 0 200 200" aria-hidden className="size-full">
            <defs>
              <path
                id="seal-ring"
                d="M100 100m-78 0a78 78 0 1 1 156 0a78 78 0 1 1-156 0"
              />
            </defs>
            <g className={styles.seal}>
              <text className="fill-muted-foreground font-mono text-[10.6px] font-semibold tracking-[2.3px]">
                <textPath href="#seal-ring">
                  NIMBUS · NOTHING LEAVES WITHOUT YOU · YOU APPROVE EVERY CLIP ·
                </textPath>
              </text>
            </g>
          </svg>
          <LogoMark className="absolute top-1/2 left-1/2 h-14 w-[88px] -translate-1/2" />
        </div>
        <div className="grid max-w-[620px] flex-[1_1_420px] gap-5">
          <span className="mono-label">The one promise</span>
          <h2 id="promise-title" className={H2}>
            Nothing leaves without you.
          </h2>
          <p className={LEDE}>
            nimbus suggests. You approve. A clip renders only after you say yes,
            and it reaches YouTube only when you press publish.{" "}
            <b>Every clip gets its own title and hook</b>, so your channel never
            reads like a template.
          </p>
        </div>
      </InView>
    </section>
  )
}

function Learn() {
  return (
    <section id="learn" aria-labelledby="learn-title" className={CHAPTER}>
      <Thread />
      <Intro label="What it learns">
        <h2 id="learn-title" className={H2}>
          Post. See what worked. <span className={MUTE}>Do more of that.</span>
        </h2>
        <p className={LEDE}>
          Connect your YouTube channel and nimbus follows each Short after it
          goes up. Then it suggests rules for your next recordings.{" "}
          <b>You approve those too.</b>
        </p>
      </Intro>
      <InView
        className={cn(
          styles.cascade,
          STAGE_GAP,
          "grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[18px]"
        )}
      >
        <figure className="grid content-start gap-4 rounded-[18px] bg-graphite p-[22px]">
          <figcaption className="mono-label">
            Example · growth since upload
          </figcaption>
          <svg
            viewBox="0 0 320 150"
            preserveAspectRatio="none"
            role="img"
            aria-label="An example Short gaining views faster than the channel's usual Short at the same age"
            className="h-[170px] w-full"
          >
            <path
              d="M0 37.5h320M0 75h320M0 112.5h320"
              className="stroke-white/6"
              strokeWidth="1"
            />
            <path
              d="M0 146 C40 132 70 122 110 112 S200 98 320 90"
              fill="none"
              className={cn(styles.draw, styles.draw2, "stroke-lav")}
              strokeWidth="3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M0 146 C30 110 60 74 110 52 S220 22 320 14"
              fill="none"
              className={cn(styles.draw, "stroke-amber")}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
            <li className="flex items-center gap-[7px]">
              <i aria-hidden className="h-[3px] w-3.5 rounded-sm bg-amber" />
              This Short
            </li>
            <li className="flex items-center gap-[7px]">
              <i aria-hidden className="h-[3px] w-3.5 rounded-sm bg-lav" />
              Your usual Short at the same age
            </li>
          </ul>
        </figure>
        <div className="grid content-start gap-3.5 rounded-[18px] bg-graphite p-[22px]">
          <span className="mono-label">Example · a suggested rule</span>
          <h3 className={H3}>Put the hook on screen in the first second.</h3>
          <p className={BODY}>
            Suggested from your own published clips, with the ones that support
            it and the ones that don&apos;t listed underneath.
          </p>
          <span
            aria-hidden
            className="flex w-fit gap-0.5 rounded-full bg-glass p-[3px] text-[13.5px] font-medium text-muted-foreground inset-ring-1 inset-ring-hair"
          >
            <span className="flex h-8 items-center px-3.5">Reject</span>
            <span
              className={cn(
                styles.yes,
                "flex h-8 items-center rounded-full bg-mint/18 px-3.5 text-mint inset-ring-1 inset-ring-mint/50"
              )}
            >
              Approve
            </span>
          </span>
        </div>
      </InView>
    </section>
  )
}

const gigabytes = (bytes: number) => `${Math.round(bytes / 1024 ** 3)} GB`
const count = new Intl.NumberFormat("en-US")

const CONTACT_HREF = "mailto:gabe@nimbus.dev"

const PLAN_COPY: Record<
  Exclude<PlanId, "admin">,
  {
    who: string
    price: string | null
    per?: string
    cta: string
    contact?: boolean
    featured?: boolean
  }
> = {
  free: {
    who: "Try it on one stream",
    price: "0",
    cta: "Get started",
  },
  creator: {
    who: "For posting every week",
    price: "67,69",
    per: "a month",
    cta: "Choose Creator",
    featured: true,
  },
  studio: {
    who: "For daily streams and clipping teams",
    price: null,
    cta: "Get in contact",
    contact: true,
  },
}

function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className={CHAPTER}>
      <Thread />
      <Intro label="Pricing">
        <h2 id="pricing-title" className={H2}>
          Start free. <span className={MUTE}>Pay when you post more.</span>
        </h2>
      </Intro>
      <InView
        render={<ul />}
        className={cn(
          styles.cascade,
          STAGE_GAP,
          "grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-[18px]"
        )}
      >
        {(Object.keys(PLAN_COPY) as (keyof typeof PLAN_COPY)[]).map((id) => {
          const plan = PLANS[id]
          const copy = PLAN_COPY[id]
          const custom = copy.price === null
          const lines = [
            ["Render minutes a month", plan.renderMinutes],
            [
              "Storage",
              plan.storageBytes === null ? null : gigabytes(plan.storageBytes),
            ],
            ["Clip picks with Claude a month", plan.claudeRuns],
            ["Publishes a day", plan.publishesPerDay],
          ] as const
          const button = buttonVariants({
            variant: copy.featured ? "primary" : "default",
            size: "lg",
          })
          return (
            <li
              key={id}
              className={cn(
                "grid gap-[22px] rounded-[30px]",
                copy.featured
                  ? "bg-graphite-2 bg-[radial-gradient(120%_70%_at_50%_0%,color-mix(in_oklab,var(--lav)_20%,transparent),transparent_62%)] px-[34px] pt-11 pb-[42px] shadow-[0_0_90px_-24px_color-mix(in_oklab,var(--lav)_50%,transparent),0_40px_100px_-30px_rgb(0_0_0/0.7)] inset-ring-[1.5px] inset-ring-lav/55 md:-mt-[18px]"
                  : "bg-graphite p-[34px] inset-ring-1 inset-ring-white/7"
              )}
            >
              <div className="grid gap-1.5">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xl font-semibold tracking-[-0.02em]">
                    {plan.name}
                  </h3>
                  {copy.featured && (
                    <StatusPill tone="lav">Recommended</StatusPill>
                  )}
                </div>
                <p className="text-sm text-tertiary">{copy.who}</p>
              </div>
              <p className="flex items-baseline gap-2">
                {!custom && (
                  <span className="mt-1.5 self-start text-xl leading-none font-semibold text-muted-foreground">
                    R$
                  </span>
                )}
                <span
                  className={cn(
                    "leading-none font-semibold tracking-[-0.05em] tabular-nums",
                    copy.featured ? "text-[64px]" : "text-[52px]"
                  )}
                >
                  {copy.price ?? "Custom"}
                </span>
                {copy.per && (
                  <span className="text-sm text-tertiary">{copy.per}</span>
                )}
              </p>
              {copy.contact ? (
                <a href={CONTACT_HREF} className={button}>
                  {copy.cta}
                </a>
              ) : (
                <Link href="/signup" className={button}>
                  {copy.cta}
                </Link>
              )}
              <dl className="grid gap-3 text-[15.5px] text-muted-foreground">
                {lines.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt>{label}</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {custom
                        ? "Custom"
                        : value === null
                          ? "No limit"
                          : typeof value === "number"
                            ? count.format(value)
                            : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </InView>
      <p className="mx-auto mt-[34px] max-w-[46em] text-center text-sm text-tertiary">
        Picking and titling clips with Claude uses your own Claude API key. The
        built-in selector needs no key.
      </p>
    </section>
  )
}

const languages = LANGUAGES.filter((item) => item.value !== "auto").map(
  (item) => item.label
)

const FAQ = [
  {
    q: "Does nimbus publish anything on its own?",
    a: "No. A clip renders only after you approve it, and it goes to YouTube only when you press publish on that clip. You can change the title, description and privacy each time.",
  },
  {
    q: "I clip other people's streams. Is nimbus for me?",
    a: "Yes. Paste the link to the stream and nimbus picks and edits the clips the same way. You review them and publish to your own channel. Get the streamer's permission first: nimbus doesn't check who owns a video.",
  },
  {
    q: "What can I import?",
    a: "MP4, MOV, MKV or WebM files, and links to YouTube videos, Twitch VODs and most video sites. Only import videos you own or have the rights to use.",
  },
  {
    q: "My recording has no webcam. Does it still work?",
    a: "Yes. nimbus looks for a webcam the first time you open a clip. Without one, the clip either fills the frame with the gameplay or shows the whole picture over a blurred copy of itself. You choose.",
  },
  {
    q: "Which languages does it understand?",
    a: `It detects the spoken language on its own, or you can set it: ${languages.slice(0, -1).join(", ")} and ${languages.at(-1)}.`,
  },
  {
    q: "Do I need a Claude API key?",
    a: "Only if you want Claude to pick and title the clips or to suggest rules from your results. The built-in selector scores loudness, speech and your catchphrases with no key at all.",
  },
  {
    q: "Where can I publish?",
    a: "YouTube Shorts today. TikTok and Instagram are planned. You can always download the rendered clips and post them anywhere.",
  },
] as const

function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className={cn(CHAPTER, "max-w-[980px]")}
    >
      <Thread />
      <InView className={styles.cascade}>
        <h2
          id="faq-title"
          className={cn(H2, "mb-[clamp(32px,4vw,56px)] text-center")}
        >
          Questions
        </h2>
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group shadow-[inset_0_-1px_0_var(--hair)]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6 text-xl leading-[1.35] font-medium tracking-[-0.02em] transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-glass-2 transition-transform duration-[350ms] ease-snappy group-open:rotate-45"
              >
                <PlusIcon className="size-3.5" />
              </span>
            </summary>
            <p className="max-w-[46em] pe-[52px] pb-6 text-[17px] text-muted-foreground">
              {item.a}
            </p>
          </details>
        ))}
      </InView>
    </section>
  )
}

function Closing() {
  return (
    <section
      aria-labelledby="closing-title"
      className="relative px-[max(20px,4vw)] pt-[clamp(110px,14vw,200px)] text-center"
    >
      <Thread />
      <InView className={cn(styles.cascade, "grid justify-items-center gap-6")}>
        <h2
          id="closing-title"
          className="max-w-[980px] text-[clamp(44px,6.4vw,84px)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance"
        >
          The next stream already has{" "}
          <span className="text-gradient">the clips.</span>
        </h2>
        <div>
          <Link
            href="/signup"
            className={buttonVariants({
              variant: "primary",
              size: "lg",
              className: "h-[58px] px-[34px] text-[19px]",
            })}
          >
            Get started
          </Link>
        </div>
        <p className="text-sm text-tertiary">
          Free to start. Only import videos you own or have the rights to use.
        </p>
      </InView>
      <InView className={STAGE_GAP}>
        <svg
          viewBox="0 0 1200 150"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden
          className={cn(
            styles.arch,
            "block h-[clamp(90px,12vw,150px)] w-full overflow-visible"
          )}
        >
          <defs>
            <linearGradient id="horizon" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--amber)" />
              <stop offset=".34" stopColor="var(--pink)" />
              <stop offset=".66" stopColor="var(--lav)" />
              <stop offset="1" stopColor="var(--mint)" />
            </linearGradient>
          </defs>
          <path
            d="M-40 150 Q600 -30 1240 150"
            fill="none"
            stroke="url(#horizon)"
            strokeWidth="5"
            strokeDasharray="5 9"
            className={styles.arc1}
          />
          <path
            d="M-40 170 Q600 -8 1240 170"
            fill="none"
            className={cn(styles.arc2, "stroke-white/14")}
            strokeWidth="4"
            strokeDasharray="4 10"
          />
          <path
            d="M-40 192 Q600 16 1240 192"
            fill="none"
            className={cn(styles.arc3, "stroke-white/7")}
            strokeWidth="4"
            strokeDasharray="4 10"
          />
        </svg>
      </InView>
    </section>
  )
}

function Footer() {
  return (
    <footer className="shadow-[inset_0_1px_0_var(--hair)]">
      <div
        className={cn(
          SECTION,
          "flex flex-wrap items-center gap-x-12 gap-y-4 pt-[34px] pb-12 text-sm text-tertiary"
        )}
      >
        <Logo />
        {[NAV[0], NAV[3], NAV[4]].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="transition-colors hover:text-foreground"
          >
            {item.label}
          </a>
        ))}
        <Link href="/login" className="transition-colors hover:text-foreground">
          Sign in
        </Link>
        <span className="flex-1" />
        <span>Nothing is published until you approve it.</span>
      </div>
    </footer>
  )
}

/** The public landing page (docs/DECISIONS.md, ADR-0083). */
export function Landing() {
  return (
    <div
      data-slot="landing"
      className="overflow-x-clip text-[17px] leading-normal"
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-graphite-3 px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <EditorSection />
        <Promise />
        <Learn />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
