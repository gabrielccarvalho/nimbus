import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import { ImageResponse } from "next/og"

import { SOCIAL_IMAGE } from "@/lib/i18n/social-metadata"

const SIZE = { width: SOCIAL_IMAGE.width, height: SOCIAL_IMAGE.height }

// Satori can't read CSS variables, so these mirror the tokens in app/globals.css.
const C = {
  night: "#06070b",
  graphite: "#101218",
  graphite3: "#1d2027",
  text: "#f5f5f7",
  secondary: "#a1a1a6",
  tertiary: "#86868b",
  amber: "#ffb36b",
  pink: "#ff8fc0",
  lav: "#b3bcff",
  mint: "#86e3bb",
}

const W = SIZE.width
const PAD = 72
const STRIP_Y = 538
const STRIP_H = 44
const BAR_GAP = 7
const MOMENTS = [
  { at: 410, width: 34 },
  { at: 715, width: 28 },
  { at: 1000, width: 40 },
]
const TILE = { w: 128, h: 228, gap: 22, top: 82 }
const TILES_LEFT = W - PAD - 3 * TILE.w - 2 * TILE.gap

const CLOUD = [
  [10, 1],
  [13, 1],
  [4, 4],
  [7, 4],
  [10, 4],
  [13, 4],
  [16, 4],
  [1, 7],
  [4, 7],
  [7, 7],
  [10, 7],
  [13, 7],
  [16, 7],
  [19, 7],
  [1, 10],
  [4, 10],
  [7, 10],
  [10, 10],
  [13, 10],
  [16, 10],
  [19, 10],
] as const

function level(x: number) {
  const wave =
    0.55 +
    0.25 * Math.sin(x / 37) +
    0.15 * Math.sin(x / 11 + 1.3) +
    0.1 * Math.sin(x / 5.3 + 0.4)
  return Math.min(1, Math.max(0.12, wave))
}

function momentAt(x: number) {
  return MOMENTS.find((m) => Math.abs(x - m.at) <= m.width / 2)
}

function tileX(index: number) {
  return TILES_LEFT + index * (TILE.w + TILE.gap)
}

function tileTop(index: number) {
  return index === 1 ? TILE.top - 18 : TILE.top
}

function Strip() {
  const bars = []
  for (let x = PAD; x <= W - PAD; x += BAR_GAP) {
    const h = Math.round(STRIP_H * level(x))
    const marked = Boolean(momentAt(x))
    bars.push(
      <rect
        key={x}
        x={x}
        y={STRIP_Y + (STRIP_H - h) / 2}
        width={3}
        height={h}
        rx={1.5}
        fill={marked ? C.amber : C.graphite3}
      />
    )
  }
  const curves = MOMENTS.map((m, i) => {
    const toX = tileX(i) + TILE.w / 2
    const toY = tileTop(i) + TILE.h + 14
    const fromY = STRIP_Y - 10
    return (
      <path
        key={m.at}
        d={`M ${m.at} ${fromY} C ${m.at} ${fromY - 90}, ${toX} ${toY + 90}, ${toX} ${toY}`}
        stroke={C.amber}
        strokeOpacity={0.55}
        strokeWidth={2}
        strokeDasharray="2 7"
        strokeLinecap="round"
        fill="none"
      />
    )
  })
  return (
    <svg
      width={W}
      height={SIZE.height}
      viewBox={`0 0 ${W} ${SIZE.height}`}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {curves}
      {bars}
      <rect
        x={MOMENTS[2]!.at + 46}
        y={STRIP_Y - 12}
        width={2}
        height={STRIP_H + 24}
        rx={1}
        fill={C.amber}
      />
    </svg>
  )
}

const CLIPS = [
  { said: ["NO", "WAY"], spoken: 1, glow: C.pink, status: "To review" },
  { said: ["CLUTCH", "1V4"], spoken: 0, glow: C.lav, status: "To review" },
  { said: ["WAIT", "FOR", "IT"], spoken: 2, glow: C.amber, status: "Approved" },
]

function Streamer() {
  return (
    <div
      style={{
        height: 76,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: `linear-gradient(160deg, #22252e, ${C.graphite})`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            background: "#3a3f4b",
          }}
        />
        <div
          style={{
            width: 58,
            height: 24,
            marginTop: 4,
            borderTopLeftRadius: 29,
            borderTopRightRadius: 29,
            background: "#3a3f4b",
          }}
        />
      </div>
    </div>
  )
}

function Clip({ index }: { index: number }) {
  const featured = index === 1
  const clip = CLIPS[index]!
  const approved = clip.status === "Approved"
  return (
    <div
      style={{
        position: "absolute",
        left: tileX(index),
        top: tileTop(index),
        width: TILE.w,
        height: TILE.h,
        display: "flex",
        flexDirection: "column",
        borderRadius: 18,
        overflow: "hidden",
        background: C.graphite,
        boxShadow: featured
          ? `0 0 0 1.5px ${C.lav}99, 0 0 60px -10px ${C.lav}88`
          : `0 0 0 1px rgba(255,255,255,0.07)`,
      }}
    >
      <Streamer />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 22,
          background: `radial-gradient(110% 80% at 50% 25%, ${clip.glow}40, transparent 72%), linear-gradient(180deg, #171a22, #0c0e13)`,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 5,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {clip.said.map((word, i) => (
            <span
              key={word}
              style={{ color: i === clip.spoken ? C.lav : C.text }}
            >
              {word}
            </span>
          ))}
        </div>
      </div>
      <div
        style={{
          height: 30,
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: 12,
          fontSize: 12,
          fontWeight: 500,
          color: approved ? C.mint : C.tertiary,
          background: C.graphite,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: approved ? C.mint : C.tertiary,
          }}
        />
        {clip.status}
      </div>
    </div>
  )
}

function Mark() {
  return (
    <svg width={44} height={28} viewBox="0 0 22 14">
      {CLOUD.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={2.4}
          height={2.4}
          rx={0.6}
          fill={x === 13 && y === 4 ? C.amber : C.text}
        />
      ))}
    </svg>
  )
}

const font = (file: string) =>
  readFile(
    path.join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file)
  )
const fonts = Promise.all([
  font("Geist-Medium.ttf"),
  font("Geist-SemiBold.ttf"),
])

export async function socialImage() {
  const [medium, semibold] = await fonts
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: `radial-gradient(90% 80% at 85% 10%, ${C.lav}1f, transparent 60%), ${C.night}`,
        fontFamily: "Geist",
        color: C.text,
      }}
    >
      <Strip />
      {[0, 1, 2].map((index) => (
        <Clip key={index} index={index} />
      ))}
      <div
        style={{
          position: "absolute",
          left: PAD,
          top: 64,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: "-0.03em",
        }}
      >
        <Mark />
        nimbus
      </div>
      <div
        style={{
          position: "absolute",
          left: PAD,
          top: 196,
          display: "flex",
          flexDirection: "column",
          fontSize: 78,
          fontWeight: 600,
          letterSpacing: "-0.045em",
          lineHeight: 1.02,
        }}
      >
        <span>Long streams in.</span>
        <span
          style={{
            backgroundImage: `linear-gradient(92deg, ${C.amber}, ${C.pink} 34%, ${C.lav} 66%, ${C.mint})`,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Short clips out.
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: PAD,
          top: 392,
          display: "flex",
          fontSize: 26,
          fontWeight: 500,
          color: C.secondary,
          letterSpacing: "-0.01em",
        }}
      >
        For streamers and clippers.
      </div>
    </div>,
    {
      ...SIZE,
      fonts: [
        { name: "Geist", data: medium, weight: 500, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
      ],
    }
  )
}
