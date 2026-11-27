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

export type MusicVoice = { key: string; src: string; plan: MusicPlan }

export function MusicPreview({
  voices,
  clipStartMs,
  sourceDb,
  onUnavailable,
}: {
  voices: readonly MusicVoice[]
  clipStartMs: number
  sourceDb: number | null
  onUnavailable: () => void
}) {
  const { videoRef } = useVideoPlayer()
  const [source, setSource] = React.useState<GainNode | null>(null)
  const needed = voices.length > 0 || sourceDb !== 0
  const sourceGain = sourceDb === null ? 0 : dbToGain(sourceDb)
  const latestGain = React.useRef(sourceGain)
  const onUnavailableRef = React.useRef(onUnavailable)
  React.useEffect(() => {
    latestGain.current = sourceGain
    onUnavailableRef.current = onUnavailable
  })

  React.useEffect(() => {
    if (!needed || source) return
    if (typeof window.AudioContext !== "function") {
      onUnavailableRef.current()
      return
    }
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    // The video only goes through Web Audio once the context runs: a
    // suspended context would silence it until the next user gesture.
    const connect = (ctx: AudioContext) => {
      if (cancelled || ctx.state !== "running") return
      try {
        setSource(routeVideo(ctx, video, latestGain.current))
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
    if (source && context) {
      source.gain.setValueAtTime(sourceGain, context.currentTime)
    }
  }, [source, sourceGain])

  return voices.map((voice) => (
    <MusicVoicePlayer
      key={voice.key}
      src={voice.src}
      plan={voice.plan}
      clipStartMs={clipStartMs}
      routed={source !== null}
      onUnavailable={onUnavailable}
    />
  ))
}

function MusicVoicePlayer({
  src,
  plan,
  clipStartMs,
  routed,
  onUnavailable,
}: {
  src: string
  plan: MusicPlan
  clipStartMs: number
  routed: boolean
  onUnavailable: () => void
}) {
  const { videoRef, paused, muted, now } = useVideoPlayer()
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const [music, setMusic] = React.useState<GainNode | null>(null)
  const latest = React.useRef({ plan, clipStartMs })
  const onUnavailableRef = React.useRef(onUnavailable)
  React.useEffect(() => {
    latest.current = { plan, clipStartMs }
    onUnavailableRef.current = onUnavailable
  })

  React.useEffect(() => {
    const audio = audioRef.current
    if (!routed || !context || !audio) return
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
  }, [routed])

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

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
      const { plan, clipStartMs } = latest.current
      const t = now() - clipStartMs - plan.startMs
      if (
        video.paused ||
        video.readyState < video.HAVE_FUTURE_DATA ||
        t < 0 ||
        t >= plan.lengthMs
      ) {
        if (!audio.paused) audio.pause()
      } else {
        const target = (plan.inMs + t) / 1000
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
  }, [paused, music, videoRef, now])

  return (
    <audio
      ref={audioRef}
      src={src}
      crossOrigin="anonymous"
      preload="auto"
      hidden
    />
  )
}
