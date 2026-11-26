import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useClipEdit, type ClipEditState } from "./use-clip-edit"

const initial = {
  title: "Clip",
  hook: "",
  startMs: 10_000,
  endMs: 40_000,
} as ClipEditState

function setup() {
  const { result } = renderHook(() => useClipEdit(() => initial))
  const patch = (...args: Parameters<typeof result.current.patch>) =>
    act(() => result.current.patch(...args))
  return { result, patch, step: () => vi.advanceTimersByTime(1000) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useClipEdit", () => {
  it("undoes and redoes one edit at a time", () => {
    const { result, patch, step } = setup()
    expect(result.current.canUndo).toBe(false)
    patch({ title: "One" })
    step()
    patch((current) => ({ title: `${current.title} two` }))
    expect(result.current.edit.title).toBe("One two")

    act(() => result.current.undo())
    expect(result.current.edit.title).toBe("One")
    act(() => result.current.undo())
    expect(result.current.edit.title).toBe("Clip")
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.undo())
    expect(result.current.edit.title).toBe("Clip")

    act(() => result.current.redo())
    act(() => result.current.redo())
    expect(result.current.edit.title).toBe("One two")
    expect(result.current.canRedo).toBe(false)
  })

  it("merges a burst of changes into one step", () => {
    const { result, patch } = setup()
    for (const title of ["C", "Cl", "Cli"]) {
      patch({ title })
      vi.advanceTimersByTime(100)
    }
    act(() => result.current.undo())
    expect(result.current.edit.title).toBe("Clip")
  })

  it("starts a new step after an undo, however soon", () => {
    const { result, patch } = setup()
    patch({ title: "One" })
    act(() => result.current.undo())
    patch({ title: "Two" })
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.undo())
    expect(result.current.edit.title).toBe("Clip")
  })

  it("keeps a skipped change out of the history", () => {
    const { result, patch } = setup()
    patch({ hook: "Stored" }, "skip")
    expect(result.current.edit.hook).toBe("Stored")
    expect(result.current.canUndo).toBe(false)
  })

  it("applies a rebased change to every step", () => {
    const { result, patch, step } = setup()
    patch({ title: "One" })
    step()
    patch({ title: "Two" })
    act(() => result.current.undo())
    patch({ startMs: 12_000 }, "rebase")
    expect(result.current.edit).toMatchObject({ title: "One", startMs: 12_000 })
    act(() => result.current.undo())
    expect(result.current.edit).toMatchObject({
      title: "Clip",
      startMs: 12_000,
    })
    act(() => result.current.redo())
    act(() => result.current.redo())
    expect(result.current.edit).toMatchObject({ title: "Two", startMs: 12_000 })
  })

  it("keeps the last hundred steps", () => {
    const { result, patch, step } = setup()
    for (let i = 1; i <= 105; i++) {
      patch({ title: `v${i}` })
      step()
    }
    for (let i = 0; i < 105; i++) act(() => result.current.undo())
    expect(result.current.edit.title).toBe("v5")
  })
})
