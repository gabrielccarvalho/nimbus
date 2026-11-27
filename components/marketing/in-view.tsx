"use client"

import { useRender } from "@base-ui/react/use-render"
import { useEffect, useRef, useState } from "react"

/**
 * Tells the stylesheet when its element has been scrolled to: `data-view` is
 * `pending` once it mounts off screen and `seen` when `amount` of it is
 * visible. Before the script runs there is no attribute, so nothing waits on
 * it. With `replay` it goes back to `pending`, with its animations rewound,
 * each time it leaves the screen.
 */
export function InView({
  amount = 0,
  replay = false,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { amount?: number; replay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<"pending" | "seen">()

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    let playing = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting && entry.intersectionRatio >= amount) {
          playing = true
          setView("seen")
          if (!replay) observer.disconnect()
        } else if (!replay) {
          setView(entry.boundingClientRect.top < 0 ? "seen" : "pending")
        } else if (!entry.isIntersecting || !playing) {
          playing = false
          for (const animation of element.getAnimations({ subtree: true })) {
            animation.currentTime = 0
          }
          setView("pending")
        }
      },
      amount > 0
        ? { threshold: [0, amount] }
        : { rootMargin: "0px 0px -12% 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [amount, replay])

  return useRender({
    defaultTagName: "div",
    ref,
    props,
    render,
    state: { slot: "in-view", view },
  })
}
