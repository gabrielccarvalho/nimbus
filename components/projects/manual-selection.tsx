"use client"

import { CopyIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitManualSelectionAction } from "@/features/clips/actions"

export function ManualSelection({
  projectId,
  prompt,
}: {
  projectId: string
  prompt: string
}) {
  const router = useRouter()
  const [json, setJson] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick highlights manually</CardTitle>
        <CardDescription>
          Paste this prompt into any chat assistant, then paste its JSON reply
          below. The same length and overlap rules apply as for automatic
          selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="manual-prompt">Prompt</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prompt)
                  toast.success("Prompt copied")
                } catch {
                  toast.error(
                    "Couldn't copy. Select the text and copy it instead."
                  )
                }
              }}
            >
              <CopyIcon data-icon="inline-start" aria-hidden />
              Copy prompt
            </Button>
          </div>
          <Textarea
            id="manual-prompt"
            readOnly
            value={prompt}
            className="h-40 font-mono text-xs"
          />
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await submitManualSelectionAction(projectId, json)
              if (!result.ok) {
                toast.error(result.error.message)
                return
              }
              toast.success(
                `Added ${result.value} ${result.value === 1 ? "clip" : "clips"}`
              )
              setJson("")
              router.refresh()
            })
          }}
        >
          <Label htmlFor="manual-json">JSON reply</Label>
          <Textarea
            id="manual-json"
            value={json}
            onChange={(event) => setJson(event.target.value)}
            placeholder='{"clips":[{"startMs":12000,"endMs":41000,"title":"…","hook":"…","reason":"…","score":0.8}]}'
            className="h-32 font-mono text-xs"
            required
          />
          <Button
            type="submit"
            className="self-start"
            disabled={pending || !json.trim()}
          >
            {pending ? "Adding clips…" : "Add clips"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
