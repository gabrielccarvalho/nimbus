import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  StatCard,
  StatCardDescription,
  StatCardGroup,
  StatCardLabel,
  StatCardValue,
} from "./stat-card"

describe("StatCard", () => {
  it("renders label/value pairs as a description list", () => {
    render(
      <StatCardGroup>
        <StatCard variant="muted" size="sm" className="extra">
          <StatCardLabel>Duration</StatCardLabel>
          <StatCardValue>12:04</StatCardValue>
          <StatCardDescription>1080p</StatCardDescription>
        </StatCard>
      </StatCardGroup>
    )
    expect(screen.getByRole("term")).toHaveTextContent("Duration")
    expect(screen.getAllByRole("definition")[0]).toHaveTextContent("12:04")
    const card = screen.getByText("Duration").closest("[data-slot=stat-card]")
    expect(card).toHaveAttribute("data-variant", "muted")
    expect(card).toHaveAttribute("data-size", "sm")
    expect(card).toHaveClass("extra")
  })
})
