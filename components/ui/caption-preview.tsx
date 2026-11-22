import { cn } from "cn"
import * as React from "react"

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

function CaptionPreviewText({
  className,
  pages,
  currentMs,
  captionStyle,
  baseline,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  pages: readonly CaptionPreviewPage[]
  currentMs: number
  captionStyle: CaptionPreviewStyle
  baseline: number
}) {
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
      className={cn(
        "absolute inset-x-[5.5%] -translate-y-full text-center leading-[1.15] font-extrabold",
        className
      )}
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

export {
  CaptionPreview,
  CaptionPreviewText,
  type CaptionPreviewPage,
  type CaptionPreviewStyle,
}
