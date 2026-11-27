"use client"

import * as React from "react"
import { createPortal } from "react-dom"

export const HEADER_SLOT_ID = "app-header-slot"
export const HEADER_STATE_SLOT_ID = "app-header-state-slot"

/** Where a page's client components put their header actions and state. */
export function AppHeaderSlot({ className }: { className?: string }) {
  return (
    <div
      id={HEADER_SLOT_ID}
      data-slot="app-header-slot"
      className={className ?? "contents"}
    />
  )
}

/**
 * Renders its children into the page header, so the one primary action sits
 * there even when the state behind it lives further down the tree. Without a
 * header on the page (a unit test, a dialog) the children render in place.
 */
export function HeaderSlot({
  children,
  target: targetId = HEADER_SLOT_ID,
}: {
  children: React.ReactNode
  /** The id of another slot in the header, e.g. the one beside the title. */
  target?: string
}) {
  // The header may mount in the same commit as this component, so the slot is
  // looked up only once that commit is in the document: React re-reads the
  // snapshot right after it subscribes. `undefined` is "not looked up yet".
  const committed = React.useRef(false)
  const subscribe = React.useCallback(() => {
    committed.current = true
    return () => {
      committed.current = false
    }
  }, [])
  const target = React.useSyncExternalStore<HTMLElement | null | undefined>(
    subscribe,
    () => (committed.current ? document.getElementById(targetId) : undefined),
    () => undefined
  )
  if (target === undefined) return null
  return target ? createPortal(children, target) : <>{children}</>
}
