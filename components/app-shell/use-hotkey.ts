"use client"

import * as React from "react"

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [role=slider], [role=textbox]") !==
      null
  )
}

export function useHotkey(
  key: string,
  handler: (event: KeyboardEvent) => void,
  { meta = false }: { meta?: boolean } = {}
) {
  const onKey = React.useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    if (event.key.toLowerCase() !== key || event.altKey) return
    if (meta) {
      if (!(event.metaKey || event.ctrlKey)) return
    } else if (
      event.metaKey ||
      event.ctrlKey ||
      isEditableTarget(event.target) ||
      document.querySelector("[role=dialog], [role=alertdialog]")
    ) {
      return
    }
    event.preventDefault()
    handler(event)
  })

  React.useEffect(() => {
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
