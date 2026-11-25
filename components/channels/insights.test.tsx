import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  approveSuggestionAction,
  editRuleAction,
  findPatternsAction,
  rejectSuggestionAction,
  restoreRuleAction,
  retireRuleAction,
} from "@/features/insights/actions"
import { CLAUDE_KEY_MISSING_MESSAGE } from "@/features/accounts/schema"
import type { getInsights, RuleView } from "@/features/insights/queries"
import { PLAYBOOK_CAP_MESSAGE } from "@/features/insights/schema"

import { Insights } from "./insights"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

vi.mock("@/features/insights/actions", () => ({
  approveSuggestionAction: vi.fn(),
  rejectSuggestionAction: vi.fn(),
  editRuleAction: vi.fn(),
  retireRuleAction: vi.fn(),
  restoreRuleAction: vi.fn(),
  findPatternsAction: vi.fn(),
}))

type Data = Awaited<ReturnType<typeof getInsights>>

function rule(over: Partial<RuleView>): RuleView {
  return {
    id: "r",
    target: "selection",
    text: "Rule",
    supersedesId: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    retiredAt: null,
    ...over,
  }
}

const suggestion: Data["suggestions"][number] = {
  id: "s1",
  channelId: "ch",
  target: "selection",
  kind: "add",
  ruleId: null,
  text: "Open on the punchline",
  rationale: "Short cold opens held viewers longer.",
  evidenceFor: [
    { clipId: "c1", title: "Cold open", projectId: "p1", views: 1200 },
  ],
  evidenceAgainst: [
    { clipId: "c2", title: "Slow intro", projectId: "p2", views: 40 },
  ],
  currentRule: null,
  confidence: 0.8,
  status: "pending",
  createdAt: new Date("2026-11-20T00:00:00Z"),
} as Data["suggestions"][number]

function data(over: Partial<Data> = {}): Data {
  return {
    channel: { title: "Gabe" },
    eligible: 8,
    needed: 8,
    claudeAvailable: true,
    running: false,
    lastError: null,
    suggestions: [],
    rules: { selection: [], review: [], retired: [] },
    ...over,
  }
}

const ok = { ok: true as const, value: undefined }
const capError = {
  ok: false as const,
  error: { code: "CONFLICT" as const, message: PLAYBOOK_CAP_MESSAGE },
}

beforeEach(() => {
  refresh.mockReset()
  vi.mocked(approveSuggestionAction).mockReset().mockResolvedValue(ok)
  vi.mocked(rejectSuggestionAction).mockReset().mockResolvedValue(ok)
  vi.mocked(editRuleAction)
    .mockReset()
    .mockResolvedValue({ ok: true, value: { ruleId: "n" } })
  vi.mocked(retireRuleAction).mockReset().mockResolvedValue(ok)
  vi.mocked(restoreRuleAction).mockReset().mockResolvedValue(ok)
  vi.mocked(findPatternsAction).mockReset().mockResolvedValue(ok)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Insights without a channel", () => {
  it("only asks to connect YouTube", () => {
    render(<Insights {...data({ channel: null, eligible: 0 })} />)
    expect(
      screen.getByText("Connect YouTube to learn from your published clips.")
    ).toBeVisible()
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("Find patterns", () => {
  it("is disabled until enough clips have a week of stats", () => {
    render(<Insights {...data({ eligible: 3 })} />)
    expect(screen.getByRole("button", { name: "Find patterns" })).toBeDisabled()
    expect(screen.getByText("3 of 8 clips have a week of stats")).toBeVisible()
  })

  it("is disabled without a Claude key", () => {
    render(<Insights {...data({ claudeAvailable: false })} />)
    expect(screen.getByRole("button", { name: "Find patterns" })).toBeDisabled()
    expect(screen.getByText(CLAUDE_KEY_MISSING_MESSAGE)).toBeVisible()
  })

  it("runs the analysis", async () => {
    render(<Insights {...data()} />)
    await userEvent.click(screen.getByRole("button", { name: "Find patterns" }))
    expect(findPatternsAction).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalled()
  })

  it("shows progress while running and polls", () => {
    vi.useFakeTimers()
    render(<Insights {...data({ running: true })} />)
    expect(screen.getByText("Looking for patterns…")).toBeVisible()
    expect(
      screen.getByRole("button", { name: /Looking for patterns/ })
    ).toBeDisabled()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("does not poll when idle", () => {
    vi.useFakeTimers()
    render(<Insights {...data()} />)
    act(() => {
      vi.advanceTimersByTime(15000)
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("shows the last error in an alert", () => {
    render(<Insights {...data({ lastError: "Claude timed out" })} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Claude timed out")
  })

  it("hides the last error while running", () => {
    render(
      <Insights {...data({ running: true, lastError: "Claude timed out" })} />
    )
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("Suggestion card", () => {
  const withSuggestion = (s = suggestion) =>
    data({
      suggestions: [s],
      rules: {
        selection: [rule({ id: "r1", text: "Keep it short" })],
        review: [],
        retired: [],
      },
    })

  it("shows target, kind, text, rationale, confidence and evidence", () => {
    render(<Insights {...withSuggestion()} />)
    const card = screen.getByRole("article")
    expect(within(card).getByText("Picking clips")).toBeVisible()
    expect(within(card).getByText("New rule")).toBeVisible()
    expect(within(card).getByText("Open on the punchline")).toBeVisible()
    expect(
      within(card).getByText("Short cold opens held viewers longer.")
    ).toBeVisible()
    expect(within(card).getByText("Strong")).toBeVisible()
    expect(
      within(card).getByRole("link", { name: "Cold open" })
    ).toHaveAttribute("href", "/projects/p1/clips/c1")
    expect(within(card).getByText("1,200 views")).toBeVisible()
    expect(within(card).getByText("Against")).toBeVisible()
    expect(within(card).getByRole("link", { name: "Slow intro" })).toBeVisible()
  })

  it("labels the other targets, kinds and confidence levels", () => {
    render(
      <Insights
        {...withSuggestion({
          ...suggestion,
          target: "review",
          kind: "retire",
          confidence: 0.45,
        })}
      />
    )
    expect(
      screen.getByText("Editing clips", { selector: "span" })
    ).toBeVisible()
    expect(screen.getByText("Retire rule")).toBeVisible()
    expect(screen.getByText("Moderate")).toBeVisible()
  })

  it("labels a weak change", () => {
    render(
      <Insights
        {...withSuggestion({ ...suggestion, kind: "edit", confidence: 0.1 })}
      />
    )
    expect(screen.getByText("Change rule")).toBeVisible()
    expect(screen.getByText("Weak")).toBeVisible()
  })

  it("approves", async () => {
    render(<Insights {...withSuggestion()} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Approve: Open on the punchline" })
    )
    expect(approveSuggestionAction).toHaveBeenCalledWith("s1", {})
    expect(refresh).toHaveBeenCalled()
  })

  it("rejects", async () => {
    render(<Insights {...withSuggestion()} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Reject: Open on the punchline" })
    )
    expect(rejectSuggestionAction).toHaveBeenCalledWith("s1")
  })

  it("edits the text before approving", async () => {
    render(<Insights {...withSuggestion()} />)
    await userEvent.click(
      screen.getByRole("button", {
        name: "Edit, then approve: Open on the punchline",
      })
    )
    const box = screen.getByRole("textbox", { name: "Rule text" })
    expect(box).toHaveValue("Open on the punchline")
    expect(box).toHaveAttribute("maxlength", "200")
    expect(screen.getByText("21 / 200")).toBeVisible()
    await userEvent.clear(box)
    await userEvent.type(box, "Lead with the joke")
    await userEvent.click(
      screen.getByRole("button", { name: "Approve: Open on the punchline" })
    )
    expect(approveSuggestionAction).toHaveBeenCalledWith("s1", {
      text: "Lead with the joke",
    })
  })

  it("keeps the edited text when retrying after the cap", async () => {
    vi.mocked(approveSuggestionAction).mockResolvedValueOnce(capError)
    render(<Insights {...withSuggestion()} />)
    await userEvent.click(
      screen.getByRole("button", {
        name: "Edit, then approve: Open on the punchline",
      })
    )
    const box = screen.getByRole("textbox", { name: "Rule text" })
    await userEvent.clear(box)
    await userEvent.type(box, "Lead with the joke")
    await userEvent.click(
      screen.getByRole("button", { name: "Approve: Open on the punchline" })
    )
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Keep it short" })
    )
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Retire and approve" })
    )
    expect(approveSuggestionAction).toHaveBeenLastCalledWith("s1", {
      text: "Lead with the joke",
      retireRuleId: "r1",
    })
  })

  it("shows the current and new text for a change", () => {
    render(
      <Insights
        {...withSuggestion({
          ...suggestion,
          kind: "edit",
          ruleId: "r1",
          text: "Keep it under 30 seconds",
          currentRule: { id: "r1", text: "Keep it short" },
        })}
      />
    )
    const card = screen.getByRole("article")
    expect(within(card).getByText(/Now:/).parentElement).toHaveTextContent(
      "Now: Keep it short"
    )
    expect(
      within(card).getByText(/Change to:/).parentElement
    ).toHaveTextContent("Change to: Keep it under 30 seconds")
  })

  it("shows the rule being retired and not the suggestion text", () => {
    render(
      <Insights
        {...withSuggestion({
          ...suggestion,
          kind: "retire",
          ruleId: "r1",
          text: "",
          currentRule: { id: "r1", text: "Keep it short" },
        })}
      />
    )
    const card = screen.getByRole("article")
    expect(within(card).getByText(/Retire:/).parentElement).toHaveTextContent(
      "Retire: Keep it short"
    )
    expect(
      within(card).getByRole("button", { name: "Approve: Keep it short" })
    ).toBeVisible()
    expect(within(card).queryByText(/Change to/)).toBeNull()
  })

  it("asks which rule to retire when the list is full", async () => {
    vi.mocked(approveSuggestionAction).mockResolvedValueOnce(capError)
    render(<Insights {...withSuggestion()} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Approve: Open on the punchline" })
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("radio", { name: "Keep it short" })
    ).toBeVisible()
    const confirm = within(dialog).getByRole("button", {
      name: "Retire and approve",
    })
    expect(confirm).toBeDisabled()
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Keep it short" })
    )
    await userEvent.click(confirm)
    expect(approveSuggestionAction).toHaveBeenLastCalledWith("s1", {
      retireRuleId: "r1",
    })
  })

  it("does not open the dialog for other conflicts", async () => {
    vi.mocked(approveSuggestionAction).mockResolvedValueOnce({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "This suggestion was already decided.",
      },
    })
    render(<Insights {...withSuggestion()} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Approve: Open on the punchline" })
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("Playbook", () => {
  const playbook = data({
    rules: {
      selection: [
        rule({ id: "r1", text: "Keep it short" }),
        rule({ id: "r2", text: "Start on a reaction" }),
      ],
      review: [rule({ id: "r3", target: "review", text: "Cut dead air" })],
      retired: [
        rule({
          id: "r4",
          text: "Old habit",
          retiredAt: new Date("2026-11-10"),
        }),
      ],
    },
  })

  it("lists both targets with their counts", () => {
    render(<Insights {...playbook} />)
    const picking = screen.getByRole("region", { name: "Picking clips" })
    expect(within(picking).getByText("2 / 12")).toBeVisible()
    expect(within(picking).getByText("Keep it short")).toBeVisible()
    const editing = screen.getByRole("region", { name: "Editing clips" })
    expect(within(editing).getByText("1 / 12")).toBeVisible()
  })

  it("shows an empty hint for a target with no rules", () => {
    render(<Insights {...data()} />)
    expect(screen.getAllByText("No rules yet")).toHaveLength(2)
  })

  it("edits a rule inline", async () => {
    render(<Insights {...playbook} />)
    const item = screen.getByText("Keep it short").closest("li")!
    await userEvent.click(
      within(item).getByRole("button", { name: "Edit: Keep it short" })
    )
    const box = within(item).getByRole("textbox", { name: "Rule text" })
    expect(box).toHaveValue("Keep it short")
    await userEvent.clear(box)
    await userEvent.type(box, "Keep it under 30 seconds")
    await userEvent.click(within(item).getByRole("button", { name: "Save" }))
    expect(editRuleAction).toHaveBeenCalledWith(
      "r1",
      "Keep it under 30 seconds"
    )
    expect(refresh).toHaveBeenCalled()
  })

  it("cancels an inline edit", async () => {
    render(<Insights {...playbook} />)
    const item = screen.getByText("Keep it short").closest("li")!
    await userEvent.click(
      within(item).getByRole("button", { name: "Edit: Keep it short" })
    )
    await userEvent.click(within(item).getByRole("button", { name: "Cancel" }))
    expect(within(item).queryByRole("textbox")).toBeNull()
    expect(editRuleAction).not.toHaveBeenCalled()
  })

  it("retires a rule immediately", async () => {
    render(<Insights {...playbook} />)
    const item = screen.getByText("Keep it short").closest("li")!
    await userEvent.click(
      within(item).getByRole("button", { name: "Retire: Keep it short" })
    )
    expect(retireRuleAction).toHaveBeenCalledWith("r1")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("keeps retired rules collapsed, with Restore", async () => {
    render(<Insights {...playbook} />)
    const restore = screen.getByRole("button", {
      name: "Restore: Old habit",
      hidden: true,
    })
    expect(restore).not.toBeVisible()
    await userEvent.click(screen.getByText("Retired (1)"))
    expect(restore).toBeVisible()
    await userEvent.click(restore)
    expect(restoreRuleAction).toHaveBeenCalledWith("r4", {})
  })

  it("asks which rule to retire when restoring into a full list", async () => {
    vi.mocked(restoreRuleAction).mockResolvedValueOnce(capError)
    render(<Insights {...playbook} />)
    await userEvent.click(screen.getByText("Retired (1)"))
    await userEvent.click(
      screen.getByRole("button", { name: "Restore: Old habit" })
    )
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Start on a reaction" })
    )
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Retire and restore" })
    )
    expect(restoreRuleAction).toHaveBeenLastCalledWith("r4", {
      retireRuleId: "r2",
    })
  })
})
