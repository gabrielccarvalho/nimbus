"use client"

import { useRender } from "@base-ui/react/use-render"
import { useEffect, useRef, useState } from "react"

/**
 * Tells the stylesheet when its element is scrolled to: `data-view` is `seen`
 * once `amount` of it is visible and `pending`, with its animations rewound,
 * whenever it is fully off screen, so everything inside plays again on the way
 * back. Before the script runs there is no attribute, so nothing waits on it.
 */
export function InView({
  amount = 0,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { amount?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<"pending" | "seen">()

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    let playing = false
    const reset = () => {
      playing = false
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.currentTime = 0
      }
      setView("pending")
    }
    const enter = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= amount) {
          playing = true
          setView("seen")
        } else if (!playing) {
          reset()
        }
      },
      amount > 0 ? { threshold: amount } : { rootMargin: "0px 0px -12% 0px" }
    )
    const leave = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) reset()
    })
    enter.observe(element)
    leave.observe(element)
    return () => {
      enter.disconnect()
      leave.disconnect()
    }
  }, [amount])

  return useRender({
    defaultTagName: "div",
    ref,
    props,
    render,
    state: { slot: "in-view", view },
  })
}
