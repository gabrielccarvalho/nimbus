"use client"

import * as React from "react"

import { useVideoPlayer } from "@/components/ui/video-player"
import {
  dbToGain,
  musicGainAt,
  type MusicPlan,
} from "@/features/music/envelope"

const MAX_DRIFT_S = 0.15
const GAIN_TIME_CONSTANT_S = 0.015

let context: AudioContext | null = null
const routes = new WeakMap<HTMLMediaElement, GainNode>()

function route(ctx: AudioContext, element: HTMLMediaElement, gain: number) {
  let node = routes.get(element)
  if (!node) {
    node = ctx.createGain()
    node.gain.value = gain
    ctx.createMediaElementSource(element).connect(node).connect(ctx.destination)
    routes.set(element, node)
  }
  return node
}

export function MusicPreview({
  src,
  plan,
  trackStartMs,
  clipStartMs,
  sourceDb,
  onUnavailable,
}: {
  src: string | null
  plan: MusicPlan | null
  trackStartMs: number
  clipStartMs: number
  sourceDb: number
  onUnavailable: () => void
}) {
  const { videoRef, paused, muted } = useVideoPlayer()
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [nodes, setNodes] = React.useState<{
    source: GainNode
    music: GainNode
  } | null>(null)
  const needed = src !== null || sourceDb !== 0
  const latest = React.useRef({
    src,
    plan,
    trackStartMs,
    clipStartMs,
    sourceDb,
  })
  const onUnavailableRef = React.useRef(onUnavailable)
  React.useEffect(() => {
    latest.current = { src, plan, trackStartMs, clipStartMs, sourceDb }
    onUnavailableRef.current = onUnavailable
  })

  React.useEffect(() => {
    if (!needed || nodes) return
    if (typeof window.AudioContext !== "function") {
      onUnavailableRef.current()
      return
    }
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return
    let cancelled = false
    // The video only goes through Web Audio once the context runs: a
    // suspended context would silence it until the next user gesture.
    const connect = (ctx: AudioContext) => {
      if (cancelled || ctx.state !== "running") return
      try {
        setNodes({
          source: route(ctx, video, dbToGain(latest.current.sourceDb)),
          music: route(ctx, audio, 0),
        })
      } catch {
        onUnavailableRef.current()
      }
    }
    const start = () => {
      context ??= new AudioContext()
      const ctx = context
      if (ctx.state === "running") connect(ctx)
      else
        ctx.resume().then(
          () => connect(ctx),
          () => {}
        )
    }
    video.addEventListener("play", start)
    if (!video.paused) start()
    return () => {
      cancelled = true
      video.removeEventListener("play", start)
    }
  }, [needed, nodes, videoRef])

  React.useEffect(() => {
    if (nodes && context) {
      nodes.source.gain.setValueAtTime(dbToGain(sourceDb), context.currentTime)
    }
  }, [nodes, sourceDb])

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  React.useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return
    if (paused || !nodes || !context) {
      audio.pause()
      return
    }
    const ctx = context
    let frame = requestAnimationFrame(function tick() {
      const { src, plan, trackStartMs, clipStartMs } = latest.current
      const t = video.currentTime * 1000 - clipStartMs
      if (!src || !plan || video.paused || t < 0 || t >= plan.lengthMs) {
        if (!audio.paused) audio.pause()
      } else {
        const target = (trackStartMs + t) / 1000
        if (
          !audio.seeking &&
          Math.abs(audio.currentTime - target) > MAX_DRIFT_S
        ) {
          audio.currentTime = target
        }
        if (audio.paused) void audio.play().catch(() => {})
        nodes.music.gain.setTargetAtTime(
          musicGainAt(plan, t),
          ctx.currentTime,
          GAIN_TIME_CONSTANT_S
        )
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [paused, nodes, videoRef])

  return <audio ref={audioRef} src={src ?? undefined} preload="auto" hidden />
}
