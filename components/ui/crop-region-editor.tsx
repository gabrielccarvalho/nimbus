"use client"

import { cn } from "cn"
import * as React from "react"

type CropRect = { x: number; y: number; w: number; h: number }
type Corner = "nw" | "ne" | "sw" | "se"

const MIN_SIZE = 0.05
const NUDGE = 0.005
const BIG_NUDGE = 0.05

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function moveRect(rect: CropRect, dx: number, dy: number): CropRect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, 1 - rect.w),
    y: clamp(rect.y + dy, 0, 1 - rect.h),
  }
}

function resizeRect(
  rect: CropRect,
  corner: Corner,
  dx: number,
  dy: number
): CropRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  if (corner.includes("w")) left = clamp(left + dx, 0, right - MIN_SIZE)
  else right = clamp(right + dx, left + MIN_SIZE, 1)
  if (corner.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIZE)
  else bottom = clamp(bottom + dy, top + MIN_SIZE, 1)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function resizeRectLocked(
  rect: CropRect,
  corner: Corner,
  dx: number,
  dy: number,
  ratio: number
): CropRect {
  const west = corner.includes("w")
  const north = corner.includes("n")
  const anchorX = west ? rect.x + rect.w : rect.x
  const anchorY = north ? rect.y + rect.h : rect.y
  const fromX = rect.w + (west ? -dx : dx)
  const fromY = (rect.h + (north ? -dy : dy)) * ratio
  const wanted =
    Math.abs(fromX - rect.w) >= Math.abs(fromY - rect.w) ? fromX : fromY
  const maxW = Math.min(
    west ? anchorX : 1 - anchorX,
    (north ? anchorY : 1 - anchorY) * ratio
  )
  const w = clamp(
    wanted,
    Math.min(maxW, Math.max(MIN_SIZE, MIN_SIZE * ratio)),
    maxW
  )
  const h = w / ratio
  return {
    x: west ? anchorX - w : anchorX,
    y: north ? anchorY - h : anchorY,
    w,
    h,
  }
}

const noop = () => {}

const percent = (value: number) => `${Math.round(value * 1000) / 10}%`

type CropRegionEditorContextValue = {
  value: CropRect
  commit: (rect: CropRect) => void
  frameRef: React.RefObject<HTMLDivElement | null>
  disabled: boolean
}

const CropRegionEditorContext =
  React.createContext<CropRegionEditorContextValue | null>(null)

function useCropRegionEditor() {
  const context = React.useContext(CropRegionEditorContext)
  if (!context) {
    throw new Error(
      "useCropRegionEditor must be used within <CropRegionEditor>"
    )
  }
  return context
}

function CropRegionEditor({
  className,
  value: valueProp,
  defaultValue = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  onValueChange,
  disabled = false,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "defaultValue"> & {
  value?: CropRect
  defaultValue?: CropRect
  onValueChange?: (rect: CropRect) => void
  disabled?: boolean
}) {
  const [valueState, setValueState] = React.useState(defaultValue)
  const value = valueProp ?? valueState
  const frameRef = React.useRef<HTMLDivElement>(null)

  const context = React.useMemo<CropRegionEditorContextValue>(
    () => ({
      value,
      frameRef,
      disabled,
      commit: (rect) => {
        if (valueProp === undefined) setValueState(rect)
        onValueChange?.(rect)
      },
    }),
    [value, valueProp, onValueChange, disabled]
  )

  return (
    <CropRegionEditorContext.Provider value={context}>
      <div
        ref={frameRef}
        data-slot="crop-region-editor"
        data-disabled={disabled || undefined}
        className={cn(
          "relative isolate overflow-hidden rounded-lg bg-black select-none",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </CropRegionEditorContext.Provider>
  )
}

const HANDLES: { corner: Corner; className: string }[] = [
  { corner: "nw", className: "-top-1.5 -left-1.5 cursor-nwse-resize" },
  { corner: "ne", className: "-top-1.5 -right-1.5 cursor-nesw-resize" },
  { corner: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { corner: "se", className: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
]

function CropRegion({
  className,
  style,
  children,
  onKeyDown,
  value: valueProp,
  onValueChange,
  aspectRatio,
  "aria-label": ariaLabel = "Crop region",
  ...props
}: Omit<React.ComponentProps<"div">, "defaultValue"> & {
  value?: CropRect
  onValueChange?: (rect: CropRect) => void
  aspectRatio?: number
}) {
  const editor = useCropRegionEditor()
  const { frameRef } = editor
  const value = valueProp ?? editor.value
  const commit = valueProp ? (onValueChange ?? noop) : editor.commit
  const inert = editor.disabled || Boolean(valueProp && !onValueChange)

  const lockedRatio = () => {
    const frame = frameRef.current?.getBoundingClientRect()
    if (!aspectRatio || !frame || frame.width === 0 || frame.height === 0)
      return null
    return (aspectRatio * frame.height) / frame.width
  }
  const resize = (
    rect: CropRect,
    corner: Corner,
    dx: number,
    dy: number
  ): CropRect => {
    const ratio = lockedRatio()
    return ratio
      ? resizeRectLocked(rect, corner, dx, dy, ratio)
      : resizeRect(rect, corner, dx, dy)
  }
  const descriptionId = React.useId()
  const drag = React.useRef<{
    mode: "move" | Corner
    startX: number
    startY: number
    rect: CropRect
  } | null>(null)

  const startDrag = (
    event: React.PointerEvent<HTMLElement>,
    mode: "move" | Corner
  ) => {
    if (inert || event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      rect: value,
    }
  }

  const onDrag = (event: React.PointerEvent<HTMLElement>) => {
    const state = drag.current
    const frame = frameRef.current?.getBoundingClientRect()
    if (!state || !frame || frame.width === 0 || frame.height === 0) return
    const dx = (event.clientX - state.startX) / frame.width
    const dy = (event.clientY - state.startY) / frame.height
    commit(
      state.mode === "move"
        ? moveRect(state.rect, dx, dy)
        : resize(state.rect, state.mode, dx, dy)
    )
  }

  const endDrag = () => {
    drag.current = null
  }

  return (
    <div
      data-slot="crop-region"
      role="group"
      aria-roledescription="crop region"
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      aria-disabled={editor.disabled || undefined}
      tabIndex={inert ? -1 : 0}
      className={cn(
        "absolute z-10 cursor-move border-2 border-primary shadow-[0_0_0_9999px_rgb(0_0_0/0.5)] outline-none focus-visible:ring-3 focus-visible:ring-ring/70 data-[disabled]:cursor-default",
        className
      )}
      data-disabled={inert || undefined}
      style={{
        left: `${value.x * 100}%`,
        top: `${value.y * 100}%`,
        width: `${value.w * 100}%`,
        height: `${value.h * 100}%`,
        ...style,
      }}
      onPointerDown={(event) => startDrag(event, "move")}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (inert || event.defaultPrevented) return
        const step = event.shiftKey ? BIG_NUDGE : NUDGE
        const deltas: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }
        const delta = deltas[event.key]
        if (!delta) return
        event.preventDefault()
        commit(
          event.altKey
            ? resize(value, "se", delta[0], delta[1])
            : moveRect(value, delta[0], delta[1])
        )
      }}
      {...props}
    >
      <span id={descriptionId} className="sr-only">
        {`Left ${percent(value.x)}, top ${percent(value.y)}, ${percent(value.w)} wide, ${percent(value.h)} tall. Arrow keys move, Alt+arrow keys resize, hold Shift for bigger steps.`}
      </span>
      {!inert &&
        HANDLES.map(({ corner, className: handleClass }) => (
          <span
            key={corner}
            aria-hidden
            data-slot="crop-region-handle"
            data-corner={corner}
            className={cn(
              "absolute size-3 rounded-full border-2 border-primary bg-background",
              handleClass
            )}
            onPointerDown={(event) => startDrag(event, corner)}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ))}
      {children}
    </div>
  )
}

export {
  CropRegion,
  CropRegionEditor,
  moveRect,
  resizeRect,
  resizeRectLocked,
  useCropRegionEditor,
  type CropRect,
}
