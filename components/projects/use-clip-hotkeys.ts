"use client"

import * as React from "react"

import { isEditableTarget } from "@/components/app-shell/use-hotkey"

const OVERLAYS =
  "[role=dialog]:not([data-hotkeys-through]), [role=alertdialog], [role=menu], [role=listbox]"
const CONTROLS =
  "button, a[href], summary, [role=button], [role=tab], [role=switch], [role=menuitem], [role=checkbox]"

export type ClipHotkeys = Record<string, (event: KeyboardEvent) => void>

// Keys are the lowercased event.key, prefixed "mod+" and/or "shift+".
export function useClipHotkeys(bindings: ClipHotkeys) {
  const onKey = React.useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return
    if (isEditableTarget(event.target)) return
    if (document.querySelector(OVERLAYS)) return
    const key = event.key.toLowerCase()
    if (
      key === " " &&
      event.target instanceof Element &&
      event.target.closest(CONTROLS)
    )
      return
    const mod = event.metaKey || event.ctrlKey ? "mod+" : ""
    const shift = event.shiftKey ? "shift+" : ""
    const handler = bindings[`${mod}${shift}${key}`]
    if (!handler) return
    event.preventDefault()
    handler(event)
  })

  React.useEffect(() => {
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
