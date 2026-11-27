import { cn } from "cn"
import * as React from "react"

import { ui } from "@/components/ui/messages"
import { OVERLAY_MARGIN_X, OVERLAY_TOP_Y } from "@/features/captions/overlay"
import { useMessages } from "@/lib/i18n/client"

type CaptionPreviewWord = { text: string; startMs: number; endMs: number }

type CaptionPreviewPage = {
  startMs: number
  endMs: number
  words: CaptionPreviewWord[]
  lines: number[]
}

type CaptionPreviewStyle = {
  fontFamily: string
  fontSize: number
  uppercase: boolean
  color: string
  highlightColor: string
  outlineColor: string
  outline: number
  box: boolean
  highlight: boolean
}

const FRAME_WIDTH = 1080

const units = (value: number) => `calc(${value} / ${FRAME_WIDTH} * 100cqw)`

function CaptionPreview({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="caption-preview"
      className={cn(
        "@container relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-black",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function useBaselineDrag({
  baseline,
  min,
  max,
  onBaselineChange,
}: {
  baseline: number
  min: number
  max: number
  onBaselineChange?: (baseline: number) => void
}) {
  const t = useMessages(ui).captionPreview
  const grab = React.useRef<{ offset: number; height: number; top: number }>(
    null
  )
  if (!onBaselineChange) return {}
  const change = (next: number) => onBaselineChange(clamp(next, min, max))
  const percent = Math.round(baseline * 100)

  return {
    role: "slider",
    tabIndex: 0,
    "aria-orientation": "vertical" as const,
    "aria-valuemin": Math.round(min * 100),
    "aria-valuemax": Math.round(max * 100),
    "aria-valuenow": percent,
    "aria-valuetext": t.baseline(percent),
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      const frame = event.currentTarget.parentElement?.getBoundingClientRect()
      if (!frame?.height || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      grab.current = {
        top: frame.top,
        height: frame.height,
        offset: baseline - (event.clientY - frame.top) / frame.height,
      }
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const g = grab.current
      if (!g) return
      change((event.clientY - g.top) / g.height + g.offset)
    },
    onPointerUp: () => {
      grab.current = null
    },
    onPointerCancel: () => {
      grab.current = null
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 0.05 : 0.01
      const next = {
        ArrowUp: baseline - step,
        ArrowRight: baseline - step,
        ArrowDown: baseline + step,
        ArrowLeft: baseline + step,
        PageUp: baseline - 0.1,
        PageDown: baseline + 0.1,
        Home: min,
        End: max,
      }[event.key]
      if (next === undefined) return
      event.preventDefault()
      change(next)
    },
  }
}

function CaptionPreviewText({
  className,
  pages,
  currentMs,
  captionStyle,
  baseline,
  minBaseline = 0.1,
  maxBaseline = 0.95,
  onBaselineChange,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  pages: readonly CaptionPreviewPage[]
  currentMs: number
  captionStyle: CaptionPreviewStyle
  baseline: number
  minBaseline?: number
  maxBaseline?: number
  onBaselineChange?: (baseline: number) => void
}) {
  const drag = useBaselineDrag({
    baseline,
    min: minBaseline,
    max: maxBaseline,
    onBaselineChange,
  })
  const page = pages.find((p) => currentMs >= p.startMs && currentMs < p.endMs)
  let active = -1
  page?.words.forEach((word, i) => {
    if (word.startMs <= currentMs) active = i
  })

  const lines: React.ReactNode[] = []
  if (page) {
    let index = 0
    for (const [lineIndex, count] of page.lines.entries()) {
      const words = page.words.slice(index, index + count).map((word, i) => {
        const wordIndex = index + i
        const current = captionStyle.highlight && wordIndex === active
        return (
          <React.Fragment key={wordIndex}>
            {i > 0 && " "}
            <span
              data-slot="caption-preview-word"
              data-active={current || undefined}
              style={
                current ? { color: captionStyle.highlightColor } : undefined
              }
            >
              {captionStyle.uppercase ? word.text.toUpperCase() : word.text}
            </span>
          </React.Fragment>
        )
      })
      index += count
      lines.push(
        <span
          key={lineIndex}
          data-slot="caption-preview-line"
          className="block"
          style={
            captionStyle.box
              ? {
                  width: "fit-content",
                  marginInline: "auto",
                  background: captionStyle.outlineColor,
                  padding: `0 ${units(captionStyle.outline)}`,
                }
              : undefined
          }
        >
          {words}
        </span>
      )
    }
  }

  return (
    <div
      data-slot="caption-preview-text"
      data-draggable={onBaselineChange ? "" : undefined}
      className={cn(
        "absolute inset-x-[5.5%] -translate-y-full text-center leading-[1.15] font-extrabold",
        onBaselineChange &&
          "min-h-[1.15em] cursor-grab touch-none rounded-md outline-none select-none hover:inset-ring-1 hover:inset-ring-white/40 focus-visible:inset-ring-2 focus-visible:inset-ring-lav active:cursor-grabbing",
        className
      )}
      {...drag}
      style={{
        top: `${baseline * 100}%`,
        fontFamily: captionStyle.fontFamily,
        fontSize: units(captionStyle.fontSize),
        color: captionStyle.color,
        ...(captionStyle.box
          ? {}
          : {
              WebkitTextStroke: `${units(captionStyle.outline * 2)} ${captionStyle.outlineColor}`,
              paintOrder: "stroke fill",
            }),
        ...style,
      }}
      {...props}
    >
      {lines}
    </div>
  )
}

const FRAME_HEIGHT = 1920
const OVERLAY_OUTLINE = 8

function CaptionPreviewOverlay({
  className,
  text,
  position,
  fontFamily,
  fontSize,
  color,
  outlineColor,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  text: string
  position: "top" | "center"
  fontFamily: string
  fontSize: number
  color: string
  outlineColor: string
}) {
  return (
    <div
      data-slot="caption-preview-overlay"
      data-position={position}
      className={cn(
        "pointer-events-none absolute text-center leading-[1.15] font-bold text-balance",
        position === "center" && "-translate-y-1/2",
        className
      )}
      style={{
        top:
          position === "center"
            ? "50%"
            : `${(OVERLAY_TOP_Y / FRAME_HEIGHT) * 100}%`,
        left: units(OVERLAY_MARGIN_X),
        right: units(OVERLAY_MARGIN_X),
        fontFamily,
        fontSize: units(fontSize),
        color,
        WebkitTextStroke: `${units(OVERLAY_OUTLINE * 2)} ${outlineColor}`,
        paintOrder: "stroke fill",
        ...style,
      }}
      {...props}
    >
      {text}
    </div>
  )
}

export {
  CaptionPreview,
  CaptionPreviewOverlay,
  CaptionPreviewText,
  type CaptionPreviewPage,
  type CaptionPreviewStyle,
}
