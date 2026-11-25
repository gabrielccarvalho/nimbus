"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import {
  editRuleAction,
  restoreRuleAction,
  retireRuleAction,
} from "@/features/insights/actions"
import type { RuleView } from "@/features/insights/queries"
import {
  PLAYBOOK_RULE_CAP,
  RULE_MAX_CHARS,
  type RuleTarget,
} from "@/features/insights/schema"

import { useInsightAction } from "./use-insight-action"

export const TARGET_LABELS: Record<RuleTarget, string> = {
  selection: "Picking clips",
  review: "Editing clips",
}

export function Subject({ text }: { text: string }) {
  return <span className="sr-only">: {text}</span>
}

export function RuleTextField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const id = React.useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="sr-only">
        Rule text
      </Label>
      <Textarea
        id={id}
        value={value}
        maxLength={RULE_MAX_CHARS}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="justify-self-end text-[13px] text-muted-foreground tabular-nums">
        {value.length} / {RULE_MAX_CHARS}
      </span>
    </div>
  )
}

export function RetirePickDialog({
  open,
  onOpenChange,
  rules,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rules: RuleView[]
  confirmLabel: string
  pending: boolean
  onConfirm: (retireRuleId: string) => void
}) {
  const [picked, setPicked] = React.useState<string | null>(null)
  const titleId = React.useId()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle id={titleId}>Make room for this rule</DialogTitle>
          <DialogDescription>
            This list already has {PLAYBOOK_RULE_CAP} rules. Pick one to retire.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          aria-labelledby={titleId}
          value={picked}
          onValueChange={(value) => setPicked(String(value))}
        >
          {rules.map((rule) => (
            <Label key={rule.id} className="items-start gap-2.5">
              <RadioGroupItem value={rule.id} />
              <span className="min-w-0 flex-1">{rule.text}</span>
            </Label>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button
            disabled={picked === null || pending}
            onClick={() => picked && onConfirm(picked)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActiveRule({ rule }: { rule: RuleView }) {
  const [editing, setEditing] = React.useState(false)
  const [text, setText] = React.useState(rule.text)
  const { pending, run } = useInsightAction()

  if (editing) {
    return (
      <li className="grid gap-2 py-3">
        <RuleTextField value={text} onChange={setText} />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={
              pending || text.trim() === "" || text.trim() === rule.text
            }
            onClick={() =>
              run(() => editRuleAction(rule.id, text), {
                onDone: () => setEditing(false),
              })
            }
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(rule.text)
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-start gap-3 py-3">
      <span className="min-w-0 flex-1">{rule.text}</span>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Edit
        <Subject text={rule.text} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => retireRuleAction(rule.id))}
      >
        Retire
        <Subject text={rule.text} />
      </Button>
    </li>
  )
}

function RuleList({
  target,
  rules,
}: {
  target: RuleTarget
  rules: RuleView[]
}) {
  const headingId = React.useId()
  return (
    <section aria-labelledby={headingId} className="grid content-start gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="font-medium">
          {TARGET_LABELS[target]}
        </h3>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {rules.length} / {PLAYBOOK_RULE_CAP}
        </span>
      </div>
      {rules.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No rules yet</p>
      ) : (
        <ul className="divide-y divide-white/6">
          {rules.map((rule) => (
            <ActiveRule key={rule.id} rule={rule} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RetiredRule({
  rule,
  siblings,
}: {
  rule: RuleView
  siblings: RuleView[]
}) {
  const [picking, setPicking] = React.useState(false)
  const { pending, run } = useInsightAction()
  const restore = (retireRuleId?: string) =>
    run(
      () => restoreRuleAction(rule.id, retireRuleId ? { retireRuleId } : {}),
      { onCap: () => setPicking(true), onDone: () => setPicking(false) }
    )
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="min-w-0 flex-1 text-muted-foreground">{rule.text}</span>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => restore()}
      >
        Restore
        <Subject text={rule.text} />
      </Button>
      <RetirePickDialog
        open={picking}
        onOpenChange={setPicking}
        rules={siblings}
        confirmLabel="Retire and restore"
        pending={pending}
        onConfirm={restore}
      />
    </li>
  )
}

export function Playbook({
  rules,
}: {
  rules: { selection: RuleView[]; review: RuleView[]; retired: RuleView[] }
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <RuleList target="selection" rules={rules.selection} />
        <RuleList target="review" rules={rules.review} />
      </div>
      {rules.retired.length > 0 && (
        <details className="group">
          <summary className="w-fit cursor-pointer rounded-sm text-[13px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Retired ({rules.retired.length})
          </summary>
          <ul className="divide-y divide-white/6">
            {rules.retired.map((rule) => (
              <RetiredRule
                key={rule.id}
                rule={rule}
                siblings={rules[rule.target]}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
