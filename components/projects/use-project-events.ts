"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import type { ProjectSnapshot } from "@/features/pipeline/snapshot"

const MAX_SSE_ERRORS = 3
const POLL_MS = 3000

function fingerprint(snapshot: ProjectSnapshot) {
  return [
    snapshot.status,
    snapshot.awaitingManualSelection,
    snapshot.revision,
    snapshot.clips.map((c) => c.status).join(","),
    snapshot.jobs
      .filter((job) => job.type === "publish_clip")
      .map((job) => `${job.id}:${job.status}:${job.progress}`)
      .join(","),
  ].join("|")
}

export function useProjectEvents(initial: ProjectSnapshot) {
  const router = useRouter()
  const [snapshot, setSnapshot] = React.useState(initial)
  const [prevInitial, setPrevInitial] = React.useState(initial)
  const lastFingerprint = React.useRef(fingerprint(initial))

  if (prevInitial !== initial) {
    setPrevInitial(initial)
    setSnapshot(initial)
  }

  React.useEffect(() => {
    lastFingerprint.current = fingerprint(initial)
  }, [initial])

  React.useEffect(() => {
    let errors = 0
    let pollTimer: ReturnType<typeof setInterval> | undefined
    const source = new EventSource(`/api/projects/${initial.id}/events`)

    source.addEventListener("snapshot", (event) => {
      errors = 0
      const next = JSON.parse(
        (event as MessageEvent<string>).data
      ) as ProjectSnapshot
      setSnapshot(next)
      const nextFingerprint = fingerprint(next)
      if (nextFingerprint !== lastFingerprint.current) {
        lastFingerprint.current = nextFingerprint
        router.refresh()
      }
    })
    source.addEventListener("gone", () => {
      source.close()
      router.refresh()
    })
    source.onerror = () => {
      errors++
      if (errors >= MAX_SSE_ERRORS && !pollTimer) {
        source.close()
        pollTimer = setInterval(() => router.refresh(), POLL_MS)
      }
    }

    return () => {
      source.close()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [initial.id, router])

  return snapshot
}
