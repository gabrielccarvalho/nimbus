"use client"

import { TrashIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { deleteProjectAction } from "@/features/projects/actions"
import { useLocale } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"

import { overview } from "./messages/overview"

export function DeleteProjectDialog({
  projectId,
  projectName,
  redirectTo,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  projectId: string
  projectName: string
  redirectTo?: "/"
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = overview[locale].deleteDialog
  const shared = common[locale]
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const [pending, startTransition] = React.useTransition()

  const confirm = () =>
    startTransition(async () => {
      const result = await deleteProjectAction(projectId)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      setOpen(false)
      toast.success(t.deleted(projectName))
      if (redirectTo) router.push(redirectTo)
    })

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <AlertDialogTrigger
          render={
            trigger ?? (
              <Button>
                <TrashIcon data-icon="inline-start" aria-hidden />
                {t.trigger}
              </Button>
            )
          }
        />
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <TrashIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{t.title(projectName)}</AlertDialogTitle>
          <AlertDialogDescription>{t.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {shared.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? t.deleting : shared.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
