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

export function DeleteProjectDialog({
  projectId,
  projectName,
  redirectTo,
  trigger,
}: {
  projectId: string
  projectName: string
  redirectTo?: "/"
  trigger?: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const confirm = () =>
    startTransition(async () => {
      const result = await deleteProjectAction(projectId)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      setOpen(false)
      toast.success(`Deleted “${projectName}”`)
      if (redirectTo) router.push(redirectTo)
    })

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          trigger ?? (
            <Button>
              <TrashIcon data-icon="inline-start" aria-hidden />
              Delete project
            </Button>
          )
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <TrashIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete “{projectName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The source video, transcript, clips and renders are removed from
            disk. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
