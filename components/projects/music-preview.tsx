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
const videoRoutes = new WeakMap<HTMLMediaElement, GainNode>()
const musicSources = new WeakMap<
  HTMLMediaElement,
  MediaElementAudioSourceNode
>()

function routeVideo(ctx: AudioContext, video: HTMLMediaElement, gain: number) {
  let node = videoRoutes.get(video)
  if (!node) {
    node = ctx.createGain()
    node.gain.value = gain
    ctx.createMediaElementSource(video).connect(node).connect(ctx.destination)
    videoRoutes.set(video, node)
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
  const [source, setSource] = React.useState<GainNode | null>(null)
  const [music, setMusic] = React.useState<GainNode | null>(null)
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
    if (!needed || source) return
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
        setSource(routeVideo(ctx, video, dbToGain(latest.current.sourceDb)))
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
  }, [needed, source, videoRef])

  React.useEffect(() => {
    const video = videoRef.current
    if (!source || !video) return
    const resume = () => {
      if (context && context.state !== "running")
        context.resume().catch(() => {})
    }
    video.addEventListener("play", resume)
    return () => video.removeEventListener("play", resume)
  }, [source, videoRef])

  React.useEffect(() => {
    const audio = audioRef.current
    if (!source || !context || !audio || src === null) return
    const ctx = context
    // An element takes one source node for life, so a re-run effect reuses it.
    let input = musicSources.get(audio)
    if (!input) {
      try {
        input = ctx.createMediaElementSource(audio)
      } catch {
        onUnavailableRef.current()
        return
      }
      musicSources.set(audio, input)
    }
    const gain = ctx.createGain()
    gain.gain.value = 0
    input.connect(gain).connect(ctx.destination)
    setMusic(gain)
    return () => {
      input.disconnect()
      gain.disconnect()
      setMusic(null)
    }
  }, [source, src])

  React.useEffect(() => {
    if (source && context) {
      source.gain.setValueAtTime(dbToGain(sourceDb), context.currentTime)
    }
  }, [source, sourceDb])

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted, src])

  React.useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return
    if (paused || !music || !context) {
      audio.pause()
      return
    }
    const ctx = context
    const sync = () => {
      const { src, plan, trackStartMs, clipStartMs } = latest.current
      const t = video.currentTime * 1000 - clipStartMs
      if (
        !src ||
        !plan ||
        video.paused ||
        video.readyState < video.HAVE_FUTURE_DATA ||
        t < 0 ||
        t >= plan.lengthMs
      ) {
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
        music.gain.setTargetAtTime(
          musicGainAt(plan, t),
          ctx.currentTime,
          GAIN_TIME_CONSTANT_S
        )
      }
    }
    let frame = requestAnimationFrame(function tick() {
      sync()
      frame = requestAnimationFrame(tick)
    })
    video.addEventListener("waiting", sync)
    video.addEventListener("playing", sync)
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener("waiting", sync)
      video.removeEventListener("playing", sync)
    }
  }, [paused, music, videoRef])

  return (
    <audio
      key={src}
      ref={audioRef}
      src={src ?? undefined}
      preload="auto"
      hidden
    />
  )
}
