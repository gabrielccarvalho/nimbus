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
import { useMessages } from "@/lib/i18n/client"

import { overview } from "./messages/overview"

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
  const t = useMessages(overview).manualSelection

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="manual-prompt">{t.prompt}</Label>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prompt)
                  toast.success(t.copied)
                } catch {
                  toast.error(t.copyFailed)
                }
              }}
            >
              <CopyIcon data-icon="inline-start" aria-hidden />
              {t.copy}
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
              toast.success(t.added(result.value))
              setJson("")
              router.refresh()
            })
          }}
        >
          <Label htmlFor="manual-json">{t.reply}</Label>
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
            {pending ? t.adding : t.add}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
