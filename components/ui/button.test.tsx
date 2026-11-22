import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Button } from "./button"

describe("Button", () => {
  it("renders an accessible button and handles clicks", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Render</Button>)
    await userEvent.click(screen.getByRole("button", { name: "Render" }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
