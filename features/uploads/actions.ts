"use server"

import { runAction } from "@/lib/server-action"

import { requireActor } from "../accounts/session"
import { completeUpload, signUploadParts, startUpload } from "./service"

async function actor() {
  const { user, workspace } = await requireActor()
  return { userId: user.id, workspaceId: workspace.id }
}

export async function startUploadAction(input: unknown) {
  return runAction(
    "startUpload",
    async () => startUpload(input, await actor()),
    []
  )
}

export async function signUploadPartsAction(
  token: unknown,
  partNumbers: unknown
) {
  return runAction(
    "signUploadParts",
    async () =>
      signUploadParts(
        typeof token === "string" ? token : "",
        partNumbers,
        await actor()
      ),
    []
  )
}

export async function completeUploadAction(token: unknown, parts?: unknown) {
  return runAction(
    "completeUpload",
    async () =>
      completeUpload(
        typeof token === "string" ? token : "",
        parts,
        await actor()
      ),
    []
  )
}
